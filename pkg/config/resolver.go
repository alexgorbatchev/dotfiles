package config

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// ResolvePlaceholders recursively resolves placeholders in the input string.
// It supports up to 20 iterations and returns an error if a cyclic token reference is detected.
func ResolvePlaceholders(val string, toolName string, projCfg *ProjectConfig) (string, error) {
	if projCfg == nil {
		return val, nil
	}

	shellScriptsDir := projCfg.Paths.ShellScriptsDir
	if shellScriptsDir == "" {
		shellScriptsDir = filepath.Join(projCfg.Paths.GeneratedDir, "shell-scripts")
	}

	vars := map[string]string{
		"stagingDir":            filepath.Join(projCfg.Paths.BinariesDir, toolName, "current"),
		"paths.homeDir":         projCfg.Paths.HomeDir,
		"paths.dotfilesDir":     projCfg.Paths.DotfilesDir,
		"paths.targetDir":       projCfg.Paths.TargetDir,
		"paths.binariesDir":     projCfg.Paths.BinariesDir,
		"paths.generatedDir":    projCfg.Paths.GeneratedDir,
		"paths.toolConfigsDir":  projCfg.Paths.ToolConfigsDir,
		"paths.shellScriptsDir": shellScriptsDir,
		"tool.name":             toolName,
		"toolName":              toolName,
		"HOME":                  projCfg.Paths.HomeDir,
		"homeDir":               projCfg.Paths.HomeDir,
	}

	tokenRegex := regexp.MustCompile(`\{([a-zA-Z0-9_.-]+)\}`)

	current := val
	seen := map[string]bool{current: true}
	maxIterations := 20

	for i := 0; i < maxIterations; i++ {
		next := tokenRegex.ReplaceAllStringFunc(current, func(match string) string {
			varName := match[1 : len(match)-1]
			if replacement, ok := vars[varName]; ok {
				return replacement
			}
			return match
		})

		if next == current {
			return current, nil
		}

		if seen[next] {
			unresolved := []string{}
			matches := tokenRegex.FindAllStringSubmatch(next, -1)
			for _, m := range matches {
				if len(m) > 1 {
					unresolved = append(unresolved, "{"+m[1]+"}")
				}
			}
			return "", fmt.Errorf("string token substitution did not converge due to a cycle. Remaining tokens: %s", strings.Join(unresolved, ", "))
		}

		seen[next] = true
		current = next
	}

	unresolved := []string{}
	matches := tokenRegex.FindAllStringSubmatch(current, -1)
	for _, m := range matches {
		if len(m) > 1 {
			unresolved = append(unresolved, "{"+m[1]+"}")
		}
	}
	return "", fmt.Errorf("string token substitution did not converge after 20 iterations. Remaining tokens: %s", strings.Join(unresolved, ", "))
}
