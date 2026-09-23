package orchestrator

import (
	"fmt"
	"os"
	osExec "os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// skipReason says why a tool takes no part in a run.
type skipReason int

const (
	skipNone skipReason = iota
	skipDisabled
	skipHostname
)

// toolSkipReason classifies a tool for the current machine. The hostname restriction
// is checked first: a tool scoped to another machine is that machine's business
// whether or not it is also disabled here.
func toolSkipReason(tool *config.ToolConfig) skipReason {
	if tool.Hostname != "" && !config.MatchesHostname(tool.Hostname) {
		return skipHostname
	}
	if tool.Disabled {
		return skipDisabled
	}
	return skipNone
}

// partitionTools splits a configuration into the tools this run acts on and the tools
// it skips. The skipped ones are not discarded: they still declare binaries that other
// tools may legitimately dependsOn(), so dependency resolution needs to see them.
func partitionTools(tools []*config.ToolConfig) (active, skipped []*config.ToolConfig) {
	for _, t := range tools {
		if toolSkipReason(t) == skipNone {
			active = append(active, t)
			continue
		}
		skipped = append(skipped, t)
	}
	return active, skipped
}

func (o *Orchestrator) pruneToolsWithLogging(tools []*config.ToolConfig) (active, skipped []*config.ToolConfig) {
	active, skipped = partitionTools(tools)
	hostname, _ := os.Hostname()

	var disabledTools []string
	var hostnameMismatched []string

	for _, t := range skipped {
		switch toolSkipReason(t) {
		case skipHostname:
			hostnameMismatched = append(hostnameMismatched, t.Name)
		case skipDisabled:
			disabledTools = append(disabledTools, t.Name)
		}
	}

	if len(disabledTools) > 0 {
		sort.Strings(disabledTools)
		o.logger.WithTag("system").Warn(logger.Message(fmt.Sprintf("Skipping disabled tools: %s", strings.Join(disabledTools, ", "))))
	}
	if len(hostnameMismatched) > 0 {
		sort.Strings(hostnameMismatched)
		o.logger.WithTag("system").Warn(logger.Message(fmt.Sprintf("Skipping hostname-mismatched tools on %s: %s", hostname, strings.Join(hostnameMismatched, ", "))))
	}

	return active, skipped
}

// sortActiveTools orders the tools a run acts on, resolving their dependencies against
// the skipped tools as well so that depending on a skipped tool's binary orders
// correctly instead of aborting the whole run.
func (o *Orchestrator) sortActiveTools(active, skipped []*config.ToolConfig) ([]*config.ToolConfig, error) {
	return topologicalSort(active, skipped, func(msg string) {
		o.logger.WithTag("system").Warn(logger.Message(msg))
	})
}

// TopologicalSort sorts a slice of ToolConfigs topologically based on their dependencies.
// It returns an error if a dependency cycle or an unregistered dependency is detected.
func TopologicalSort(tools []*config.ToolConfig) ([]*config.ToolConfig, error) {
	return topologicalSort(tools, nil, nil)
}

// topologicalSort orders tools by their declared dependencies.
//
// skipped carries the tools the run leaves out (disabled, or scoped to another
// hostname). They contribute no work and no ordering edge, but the binaries they
// declare are still valid dependsOn() targets — the generated bin-name registry lists
// them on purpose — so a dependency resolved to one of them is reported through warn
// and dropped from the graph rather than failing the run. They are kept apart rather
// than merged into the graph because merging them would read a pair of host-scoped
// providers of the same binary — only one of which this machine runs — as an ambiguous
// dependency.
func topologicalSort(tools, skipped []*config.ToolConfig, warn func(string)) ([]*config.ToolConfig, error) {
	toolMap := make(map[string]*config.ToolConfig)
	originalIndex := make(map[string]int)
	for i, tool := range tools {
		if _, exists := toolMap[tool.Name]; exists {
			return nil, fmt.Errorf("duplicate tool name %q in configuration", tool.Name)
		}
		toolMap[tool.Name] = tool
		originalIndex[tool.Name] = i
	}

	binaryProviders := make(map[string][]string)
	for _, tool := range tools {
		bins := getBinaryNames(tool.Binaries)
		if len(bins) == 0 {
			bins = []string{tool.Name}
		}
		for _, bin := range bins {
			binaryProviders[bin] = append(binaryProviders[bin], tool.Name)
		}
	}

	skippedProviders := make(map[string]*config.ToolConfig)
	claimSkipped := func(key string, tool *config.ToolConfig) {
		if _, taken := skippedProviders[key]; !taken {
			skippedProviders[key] = tool
		}
	}
	for _, tool := range skipped {
		bins := getBinaryNames(tool.Binaries)
		if len(bins) == 0 {
			bins = []string{tool.Name}
		}
		for _, bin := range bins {
			claimSkipped(bin, tool)
		}
	}
	for _, tool := range skipped {
		claimSkipped(tool.Name, tool)
	}

	adj := make(map[string][]string)
	inDegree := make(map[string]int)

	for _, tool := range tools {
		inDegree[tool.Name] = 0
	}

	for _, tool := range tools {
		for _, dep := range tool.Dependencies {
			var provider string
			providers, exists := binaryProviders[dep]
			if !exists {
				if _, toolExists := toolMap[dep]; toolExists {
					provider = dep
				} else if isSystemBinary(dep) {
					continue
				} else if skippedProvider, isSkipped := skippedProviders[dep]; isSkipped {
					warnSkippedDependency(warn, tool, dep, skippedProvider)
					continue
				} else {
					return nil, fmt.Errorf("tool %q depends on missing dependency %q", tool.Name, dep)
				}
			} else if len(providers) > 1 {
				return nil, fmt.Errorf("ambiguous dependency: binary %q is provided by multiple tools: %s", dep, strings.Join(providers, ", "))
			} else {
				provider = providers[0]
			}
			if provider == tool.Name {
				continue
			}
			inDegree[tool.Name]++
			adj[provider] = append(adj[provider], tool.Name)
		}
	}

	var queue []string
	for _, tool := range tools {
		if inDegree[tool.Name] == 0 {
			queue = append(queue, tool.Name)
		}
	}
	sort.Slice(queue, func(i, j int) bool {
		return originalIndex[queue[i]] < originalIndex[queue[j]]
	})

	var sorted []string
	for len(queue) > 0 {
		u := queue[0]
		queue = queue[1:]
		sorted = append(sorted, u)

		for _, v := range adj[u] {
			inDegree[v]--
			if inDegree[v] == 0 {
				queue = append(queue, v)
			}
		}
		sort.Slice(queue, func(i, j int) bool {
			return originalIndex[queue[i]] < originalIndex[queue[j]]
		})
	}

	if len(sorted) < len(tools) {
		var cycled []string
		for name, deg := range inDegree {
			if deg > 0 {
				cycled = append(cycled, name)
			}
		}
		sort.Strings(cycled)
		return nil, fmt.Errorf("dependency cycle detected among tools: %s", strings.Join(cycled, ", "))
	}

	result := make([]*config.ToolConfig, 0, len(sorted))
	for _, name := range sorted {
		result = append(result, toolMap[name])
	}

	return result, nil
}

// warnSkippedDependency names the tool that would have provided dep, so the report
// says the provider is skipped rather than claiming the dependency does not exist.
func warnSkippedDependency(warn func(string), tool *config.ToolConfig, dep string, provider *config.ToolConfig) {
	if warn == nil {
		return
	}
	if toolSkipReason(provider) == skipHostname {
		warn(fmt.Sprintf(
			"Tool %q depends on %q, provided by tool %q which is scoped to hostname %q: continuing without it",
			tool.Name, dep, provider.Name, provider.Hostname,
		))
		return
	}
	warn(fmt.Sprintf(
		"Tool %q depends on %q, provided by disabled tool %q: continuing without it",
		tool.Name, dep, provider.Name,
	))
}

func isSystemBinary(name string) bool {
	if _, err := osExec.LookPath(name); err == nil {
		return true
	}
	fallbacks := []string{
		filepath.Join("/opt/homebrew/bin", name),
		filepath.Join("/opt/homebrew/sbin", name),
		filepath.Join("/usr/local/bin", name),
		filepath.Join("/usr/local/sbin", name),
		filepath.Join("/usr/bin", name),
		filepath.Join("/bin", name),
		filepath.Join("/usr/sbin", name),
		filepath.Join("/sbin", name),
		filepath.Join("/home/linuxbrew/.linuxbrew/bin", name),
	}
	for _, fb := range fallbacks {
		if fi, err := os.Stat(fb); err == nil && !fi.IsDir() {
			return true
		}
	}
	return false
}
