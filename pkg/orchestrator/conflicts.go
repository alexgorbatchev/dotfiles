package orchestrator

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// ConflictKind distinguishes the category of cross-tool conflict.
type ConflictKind string

const (
	ConflictAliasShadowsBinary    ConflictKind = "alias_shadows_binary"
	ConflictFunctionShadowsBinary ConflictKind = "function_shadows_binary"
	ConflictAliasCollision        ConflictKind = "alias_collision"
	ConflictFunctionCollision     ConflictKind = "function_collision"
	ConflictBinaryCollision       ConflictKind = "binary_collision"
)

// Conflict describes a detected configuration conflict between tools.
type Conflict struct {
	Kind        ConflictKind `json:"kind"`
	ToolName    string       `json:"tool"`
	ConfigPath  string       `json:"config"`
	Name        string       `json:"name"`
	Shell       string       `json:"shell,omitempty"`
	Value       string       `json:"value,omitempty"`
	OtherTool   string       `json:"otherTool"`
	OtherConfig string       `json:"otherConfig"`
	OtherShell  string       `json:"otherShell,omitempty"`
	OtherValue  string       `json:"otherValue,omitempty"`
	Message     string       `json:"message"`
}

type aliasEntry struct {
	toolName   string
	configPath string
	shell      string
	name       string
	value      string
}

type funcEntry struct {
	toolName   string
	configPath string
	shell      string
	name       string
	value      string
}

type binEntry struct {
	toolName   string
	configPath string
	name       string
}

// formatToolOrigin returns the tool's relative config file path if possible, or config path, or tool name.
func formatToolOrigin(toolName, configPath, dotfilesDir string) string {
	if configPath != "" {
		if dotfilesDir != "" {
			if rel, err := filepath.Rel(dotfilesDir, configPath); err == nil && rel != "" && !strings.HasPrefix(rel, "..") {
				return rel
			}
		}
		return configPath
	}
	return toolName
}

// DetectConflicts scans tool configurations for cross-tool shell and binary conflicts.
func DetectConflicts(tools []*config.ToolConfig, dotfilesDir ...string) []Conflict {
	var dotDir string
	if len(dotfilesDir) > 0 {
		dotDir = dotfilesDir[0]
	}

	var aliases []aliasEntry
	var functions []funcEntry
	var binaries []binEntry

	shells := []string{"zsh", "bash", "powershell"}

	for _, tool := range tools {
		if tool.Disabled || (tool.Hostname != "" && !matchesHostname(tool.Hostname)) {
			continue
		}

		// Binaries
		for _, binName := range installer.GetBinaryNames(tool.Name, tool.Binaries) {
			if binName == "" {
				continue
			}
			binaries = append(binaries, binEntry{
				toolName:   tool.Name,
				configPath: tool.ConfigFilePath,
				name:       binName,
			})
		}

		// Shell aliases & functions
		for _, sh := range shells {
			stc := getShellTypeConfig(tool, sh)
			if stc == nil {
				continue
			}

			for aliasName, aliasVal := range stc.Aliases {
				if aliasName == "" {
					continue
				}
				aliases = append(aliases, aliasEntry{
					toolName:   tool.Name,
					configPath: tool.ConfigFilePath,
					shell:      sh,
					name:       aliasName,
					value:      aliasVal,
				})
			}

			for funcName, funcVal := range stc.Functions {
				if funcName == "" {
					continue
				}
				functions = append(functions, funcEntry{
					toolName:   tool.Name,
					configPath: tool.ConfigFilePath,
					shell:      sh,
					name:       funcName,
					value:      funcVal,
				})
			}
		}
	}

	var conflicts []Conflict
	seenKeys := make(map[string]bool)

	// 1. Alias collisions: Multiple tools declare the same alias name (for the same shell)
	for i := 0; i < len(aliases); i++ {
		for j := i + 1; j < len(aliases); j++ {
			a1 := aliases[i]
			a2 := aliases[j]
			if a1.toolName != a2.toolName && a1.shell == a2.shell && a1.name == a2.name {
				origin2 := formatToolOrigin(a2.toolName, a2.configPath, dotDir)
				msg := fmt.Sprintf("alias %q ('%s') collides with alias from %s",
					a1.name, a1.value, origin2)
				key := fmt.Sprintf("alias_collision:%s:%s:%s:%s", a1.toolName, a2.toolName, a1.shell, a1.name)
				if !seenKeys[key] {
					seenKeys[key] = true
					conflicts = append(conflicts, Conflict{
						Kind:        ConflictAliasCollision,
						ToolName:    a1.toolName,
						ConfigPath:  a1.configPath,
						Name:        a1.name,
						Shell:       a1.shell,
						Value:       a1.value,
						OtherTool:   a2.toolName,
						OtherConfig: a2.configPath,
						OtherShell:  a2.shell,
						OtherValue:  a2.value,
						Message:     msg,
					})
				}
			}
		}
	}

	// 2. Function collisions: Multiple tools declare the same function name (for the same shell)
	for i := 0; i < len(functions); i++ {
		for j := i + 1; j < len(functions); j++ {
			f1 := functions[i]
			f2 := functions[j]
			if f1.toolName != f2.toolName && f1.shell == f2.shell && f1.name == f2.name {
				origin2 := formatToolOrigin(f2.toolName, f2.configPath, dotDir)
				msg := fmt.Sprintf("function %q collides with function from %s",
					f1.name, origin2)
				key := fmt.Sprintf("function_collision:%s:%s:%s:%s", f1.toolName, f2.toolName, f1.shell, f1.name)
				if !seenKeys[key] {
					seenKeys[key] = true
					conflicts = append(conflicts, Conflict{
						Kind:        ConflictFunctionCollision,
						ToolName:    f1.toolName,
						ConfigPath:  f1.configPath,
						Name:        f1.name,
						Shell:       f1.shell,
						Value:       f1.value,
						OtherTool:   f2.toolName,
						OtherConfig: f2.configPath,
						OtherShell:  f2.shell,
						OtherValue:  f2.value,
						Message:     msg,
					})
				}
			}
		}
	}

	// 3. Binary collisions: Multiple tools register the same binary name
	for i := 0; i < len(binaries); i++ {
		for j := i + 1; j < len(binaries); j++ {
			b1 := binaries[i]
			b2 := binaries[j]
			if b1.toolName != b2.toolName && b1.name == b2.name {
				origin2 := formatToolOrigin(b2.toolName, b2.configPath, dotDir)
				msg := fmt.Sprintf("binary %q collides with binary from %s",
					b1.name, origin2)
				key := fmt.Sprintf("binary_collision:%s:%s:%s", b1.toolName, b2.toolName, b1.name)
				if !seenKeys[key] {
					seenKeys[key] = true
					conflicts = append(conflicts, Conflict{
						Kind:        ConflictBinaryCollision,
						ToolName:    b1.toolName,
						ConfigPath:  b1.configPath,
						Name:        b1.name,
						OtherTool:   b2.toolName,
						OtherConfig: b2.configPath,
						Message:     msg,
					})
				}
			}
		}
	}

	// 4. Alias shadowing binary: A tool's alias shares a name with a binary provided by another tool
	for _, a := range aliases {
		for _, b := range binaries {
			if a.toolName != b.toolName && a.name == b.name {
				originB := formatToolOrigin(b.toolName, b.configPath, dotDir)
				msg := fmt.Sprintf("alias %q ('%s') shadows binary %q from %s",
					a.name, a.value, b.name, originB)
				key := fmt.Sprintf("alias_shadows_binary:%s:%s:%s:%s", a.toolName, b.toolName, a.name, a.value)
				if !seenKeys[key] {
					seenKeys[key] = true
					conflicts = append(conflicts, Conflict{
						Kind:        ConflictAliasShadowsBinary,
						ToolName:    a.toolName,
						ConfigPath:  a.configPath,
						Name:        a.name,
						Shell:       a.shell,
						Value:       a.value,
						OtherTool:   b.toolName,
						OtherConfig: b.configPath,
						Message:     msg,
					})
				}
			}
		}
	}

	// 5. Function shadowing binary: A tool's shell function shares a name with a binary provided by another tool
	for _, f := range functions {
		for _, b := range binaries {
			if f.toolName != b.toolName && f.name == b.name {
				originB := formatToolOrigin(b.toolName, b.configPath, dotDir)
				msg := fmt.Sprintf("function %q shadows binary %q from %s",
					f.name, b.name, originB)
				key := fmt.Sprintf("function_shadows_binary:%s:%s:%s", f.toolName, b.toolName, f.name)
				if !seenKeys[key] {
					seenKeys[key] = true
					conflicts = append(conflicts, Conflict{
						Kind:        ConflictFunctionShadowsBinary,
						ToolName:    f.toolName,
						ConfigPath:  f.configPath,
						Name:        f.name,
						Shell:       f.shell,
						Value:       f.value,
						OtherTool:   b.toolName,
						OtherConfig: b.configPath,
						Message:     msg,
					})
				}
			}
		}
	}

	// Sort conflicts deterministically by ToolName, Kind, Shell, Name, OtherTool
	sort.Slice(conflicts, func(i, j int) bool {
		c1, c2 := conflicts[i], conflicts[j]
		if c1.ToolName != c2.ToolName {
			return c1.ToolName < c2.ToolName
		}
		if c1.Kind != c2.Kind {
			return c1.Kind < c2.Kind
		}
		if c1.Shell != c2.Shell {
			return c1.Shell < c2.Shell
		}
		if c1.Name != c2.Name {
			return c1.Name < c2.Name
		}
		return c1.OtherTool < c2.OtherTool
	})

	return conflicts
}

// WarnConflicts detects cross-tool configuration conflicts and logs actionable warnings.
func (o *Orchestrator) WarnConflicts(tools []*config.ToolConfig, projCfg *config.ProjectConfig) {
	var dotDir string
	if projCfg != nil {
		dotDir = projCfg.Paths.DotfilesDir
	}
	conflicts := DetectConflicts(tools, dotDir)
	for _, c := range conflicts {
		o.logger.GetSubLogger("", c.ToolName).Warn(logger.Message(c.Message))
	}
}
