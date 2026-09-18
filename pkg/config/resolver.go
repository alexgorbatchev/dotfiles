package config

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// placeholderPattern matches a single {placeholder} token.
var placeholderPattern = regexp.MustCompile(`\{([a-zA-Z0-9_.-]+)\}`)

// maxSubstitutionRounds bounds how many times a value is rewritten before a chain of
// placeholder references is reported as circular.
const maxSubstitutionRounds = 20

// substituteTokensOnce replaces every {token} that lookup knows in a single pass and
// leaves the rest of the string untouched. A token preceded by "$" is left alone:
// "${HOME}" is an expansion the shell performs on the generated script, not a
// placeholder this loader owns.
func substituteTokensOnce(value string, lookup func(string) (string, bool)) string {
	matches := placeholderPattern.FindAllStringSubmatchIndex(value, -1)
	if len(matches) == 0 {
		return value
	}

	var sb strings.Builder
	lastIndex := 0
	for _, loc := range matches {
		start, end := loc[0], loc[1]
		sb.WriteString(value[lastIndex:start])
		replacement, known := lookup(value[loc[2]:loc[3]])
		switch {
		case start > 0 && value[start-1] == '$':
			sb.WriteString(value[start:end])
		case known:
			sb.WriteString(replacement)
		default:
			sb.WriteString(value[start:end])
		}
		lastIndex = end
	}
	sb.WriteString(value[lastIndex:])
	return sb.String()
}

// unresolvedTokens lists every {token} left in value that no substitution pass could
// fill, in the order they appear and without repeats.
func unresolvedTokens(value string) []string {
	var tokens []string
	seen := map[string]bool{}
	for _, loc := range placeholderPattern.FindAllStringSubmatchIndex(value, -1) {
		if loc[0] > 0 && value[loc[0]-1] == '$' {
			continue
		}
		token := value[loc[0]:loc[1]]
		if seen[token] {
			continue
		}
		seen[token] = true
		tokens = append(tokens, token)
	}
	return tokens
}

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
		"paths.toolConfigsDir":  projCfg.Paths.GetPrimaryToolConfigsDir(),
		"paths.shellScriptsDir": shellScriptsDir,
		"tool.name":             toolName,
		"toolName":              toolName,
		"HOME":                  projCfg.Paths.HomeDir,
		"homeDir":               projCfg.Paths.HomeDir,
	}

	lookup := func(name string) (string, bool) {
		replacement, ok := vars[name]
		return replacement, ok
	}

	current := val
	seen := map[string]bool{current: true}

	for range maxSubstitutionRounds {
		next := substituteTokensOnce(current, lookup)
		if next == current {
			return current, nil
		}

		if seen[next] {
			return "", fmt.Errorf("string token substitution did not converge due to a cycle. Remaining tokens: %s", strings.Join(unresolvedTokens(next), ", "))
		}

		seen[next] = true
		current = next
	}

	return "", fmt.Errorf("string token substitution did not converge after %d iterations. Remaining tokens: %s", maxSubstitutionRounds, strings.Join(unresolvedTokens(current), ", "))
}
