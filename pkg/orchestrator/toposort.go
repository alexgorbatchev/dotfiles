package orchestrator

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func pruneTools(tools []*config.ToolConfig) []*config.ToolConfig {
	var pruned []*config.ToolConfig
	for _, t := range tools {
		if t.Disabled {
			continue
		}
		if t.Hostname != "" && !matchesHostname(t.Hostname) {
			continue
		}
		pruned = append(pruned, t)
	}
	return pruned
}

func (o *Orchestrator) pruneToolsWithLogging(tools []*config.ToolConfig) []*config.ToolConfig {
	var pruned []*config.ToolConfig
	hostname, _ := os.Hostname()

	var platformUnsupported []string
	var disabledTools []string
	var hostnameMismatched []string

	for _, t := range tools {
		if t.Hostname != "" && !matchesHostname(t.Hostname) {
			hostnameMismatched = append(hostnameMismatched, t.Name)
			continue
		}
		if t.PlatformUnsupported {
			platformUnsupported = append(platformUnsupported, t.Name)
			continue
		}
		if t.Disabled {
			disabledTools = append(disabledTools, t.Name)
			continue
		}
		pruned = append(pruned, t)
	}

	sysCtx := installer.NewDefaultSystemContext()
	platTarget := fmt.Sprintf("%s/%s", sysCtx.OS, sysCtx.Arch)

	if len(platformUnsupported) > 0 {
		sort.Strings(platformUnsupported)
		o.logger.GetSubLogger("", "system").Warn(logger.Message(fmt.Sprintf("Skipping platform-unsupported tools on %s: %s", platTarget, strings.Join(platformUnsupported, ", "))))
	}
	if len(disabledTools) > 0 {
		sort.Strings(disabledTools)
		o.logger.GetSubLogger("", "system").Warn(logger.Message(fmt.Sprintf("Skipping disabled tools: %s", strings.Join(disabledTools, ", "))))
	}
	if len(hostnameMismatched) > 0 {
		sort.Strings(hostnameMismatched)
		o.logger.GetSubLogger("", "system").Warn(logger.Message(fmt.Sprintf("Skipping hostname-mismatched tools on %s: %s", hostname, strings.Join(hostnameMismatched, ", "))))
	}

	return pruned
}

// TopologicalSortForPlatform evaluates platform overrides on tools for the specified OS and architecture,
// then topologically sorts the tools based on their resolved dependencies.
func TopologicalSortForPlatform(tools []*config.ToolConfig, osName, archName string) ([]*config.ToolConfig, error) {
	config.ResolvePlatformConfigs(tools, osName, archName)
	return topologicalSort(tools)
}

// TopologicalSort sorts a slice of ToolConfigs topologically based on their dependencies.
// It evaluates platform overrides prior to constructing the dependency graph.
// It returns an error if a dependency cycle or an unregistered dependency is detected.
func TopologicalSort(tools []*config.ToolConfig) ([]*config.ToolConfig, error) {
	config.ResolvePlatformConfigs(tools, "", "")
	return topologicalSort(tools)
}

func topologicalSort(tools []*config.ToolConfig) ([]*config.ToolConfig, error) {
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
