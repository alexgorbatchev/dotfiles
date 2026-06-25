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
		matches := tokenRegex.FindAllStringSubmatchIndex(current, -1)
		if len(matches) == 0 {
			return current, nil
		}

		var sb strings.Builder
		lastIndex := 0
		for _, matchLoc := range matches {
			start, end := matchLoc[0], matchLoc[1]
			varStart, varEnd := matchLoc[2], matchLoc[3]

			sb.WriteString(current[lastIndex:start])

			if start > 0 && current[start-1] == '$' {
				sb.WriteString(current[start:end])
			} else {
				varName := current[varStart:varEnd]
				if replacement, ok := vars[varName]; ok {
					sb.WriteString(replacement)
				} else {
					sb.WriteString(current[start:end])
				}
			}
			lastIndex = end
		}
		sb.WriteString(current[lastIndex:])
		next := sb.String()

		if next == current {
			return current, nil
		}

		if seen[next] {
			unresolved := []string{}
			unresolvedMatches := tokenRegex.FindAllStringSubmatchIndex(next, -1)
			for _, loc := range unresolvedMatches {
				start := loc[0]
				if start > 0 && next[start-1] == '$' {
					continue
				}
				if len(loc) > 3 {
					unresolved = append(unresolved, "{"+next[loc[2]:loc[3]]+"}")
				}
			}
			return "", fmt.Errorf("string token substitution did not converge due to a cycle. Remaining tokens: %s", strings.Join(unresolved, ", "))
		}

		seen[next] = true
		current = next
	}

	unresolved := []string{}
	unresolvedMatches := tokenRegex.FindAllStringSubmatchIndex(current, -1)
	for _, loc := range unresolvedMatches {
		start := loc[0]
		if start > 0 && current[start-1] == '$' {
			continue
		}
		if len(loc) > 3 {
			unresolved = append(unresolved, "{"+current[loc[2]:loc[3]]+"}")
		}
	}
	return "", fmt.Errorf("string token substitution did not converge after 20 iterations. Remaining tokens: %s", strings.Join(unresolved, ", "))
}
