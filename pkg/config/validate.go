package config

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// ValidateProjectConfigRawJSON validates that the provided JSON bytes only contain allowed properties for ProjectConfig.
// It returns user-friendly, actionable error messages with "did you mean?" suggestions for unknown or misspelled keys.
func ValidateProjectConfigRawJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("invalid JSON syntax: %w", err)
	}
	return validateProjectMap("", raw)
}

// ValidateLoaderResultRawJSON validates that the unified loader JSON only contains allowed properties for ProjectConfig and ToolConfigs.
func ValidateLoaderResultRawJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("invalid JSON syntax: %w", err)
	}

	allowedRoot := []string{"projectConfig", "toolConfigs"}
	for k := range raw {
		if !contains(allowedRoot, k) {
			return unknownPropertyError("", k, allowedRoot)
		}
	}

	if projRaw, ok := raw["projectConfig"].(map[string]interface{}); ok {
		if err := validateProjectMap("", projRaw); err != nil {
			return err
		}
	}

	if toolsRaw, ok := raw["toolConfigs"].(map[string]interface{}); ok {
		for toolName, toolVal := range toolsRaw {
			if toolMap, ok := toolVal.(map[string]interface{}); ok {
				if err := validateToolMap(fmt.Sprintf("tool %q", toolName), toolMap); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func validateProjectMap(prefix string, m map[string]interface{}) error {
	allowedProjectKeys := []string{"paths", "system", "logging", "updates", "github", "cargo", "downloader", "features"}
	for k, v := range m {
		if !contains(allowedProjectKeys, k) {
			return unknownPropertyError(prefix, k, allowedProjectKeys)
		}
		path := qualifyPath(prefix, k)
		switch k {
		case "paths":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedPaths := []string{"homeDir", "dotfilesDir", "targetDir", "generatedDir", "toolConfigsDir", "shellScriptsDir", "binariesDir"}
				if err := checkKeys(path, sub, allowedPaths); err != nil {
					return err
				}
			}
		case "system":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedSystem := []string{"sudoPrompt"}
				if err := checkKeys(path, sub, allowedSystem); err != nil {
					return err
				}
			}
		case "logging":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedLogging := []string{"debug"}
				if err := checkKeys(path, sub, allowedLogging); err != nil {
					return err
				}
			}
		case "updates":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedUpdates := []string{"checkOnRun", "checkInterval"}
				if err := checkKeys(path, sub, allowedUpdates); err != nil {
					return err
				}
			}
		case "github":
			if sub, ok := v.(map[string]interface{}); ok {
				if err := validateHostMap(path, sub); err != nil {
					return err
				}
			}
		case "cargo":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedCargo := []string{"cratesIo", "githubRaw", "githubRelease", "userAgent"}
				if err := checkKeys(path, sub, allowedCargo); err != nil {
					return err
				}
				for _, subHost := range []string{"cratesIo", "githubRaw", "githubRelease"} {
					if hostMap, ok := sub[subHost].(map[string]interface{}); ok {
						if err := validateHostMap(qualifyPath(path, subHost), hostMap); err != nil {
							return err
						}
					}
				}
			}
		case "downloader":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedDownloader := []string{"timeout", "retryCount", "retryDelay", "cache"}
				if err := checkKeys(path, sub, allowedDownloader); err != nil {
					return err
				}
				if cacheMap, ok := sub["cache"].(map[string]interface{}); ok {
					if err := validateCacheMap(qualifyPath(path, "cache"), cacheMap); err != nil {
						return err
					}
				}
			}
		case "features":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedFeatures := []string{"catalog", "shellInstall"}
				if err := checkKeys(path, sub, allowedFeatures); err != nil {
					return err
				}
				if catMap, ok := sub["catalog"].(map[string]interface{}); ok {
					allowedCat := []string{"generate", "filePath"}
					if err := checkKeys(qualifyPath(path, "catalog"), catMap, allowedCat); err != nil {
						return err
					}
				}
				if shMap, ok := sub["shellInstall"].(map[string]interface{}); ok {
					allowedShell := []string{"zsh", "bash", "powershell"}
					if err := checkKeys(qualifyPath(path, "shellInstall"), shMap, allowedShell); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func validateToolMap(prefix string, m map[string]interface{}) error {
	allowedToolKeys := []string{
		"name", "version", "configFilePath", "binaries", "dependencies",
		"disabled", "hostname", "sudo",
		"shellConfigs", "symlinks", "copies", "updateCheck",
		"installationMethod", "installParams",
	}

	for k, v := range m {
		if !contains(allowedToolKeys, k) {
			return unknownPropertyError(prefix, k, allowedToolKeys)
		}
		path := qualifyPath(prefix, k)
		switch k {
		case "updateCheck":
			if sub, ok := v.(map[string]interface{}); ok {
				allowed := []string{"enabled", "constraint"}
				if err := checkKeys(path, sub, allowed); err != nil {
					return err
				}
			}
		case "symlinks":
			if list, ok := v.([]interface{}); ok {
				for i, item := range list {
					if sub, ok := item.(map[string]interface{}); ok {
						if err := checkKeys(fmt.Sprintf("%s[%d]", path, i), sub, []string{"source", "target"}); err != nil {
							return err
						}
					}
				}
			}
		case "copies":
			if list, ok := v.([]interface{}); ok {
				for i, item := range list {
					if sub, ok := item.(map[string]interface{}); ok {
						if err := checkKeys(fmt.Sprintf("%s[%d]", path, i), sub, []string{"source", "target"}); err != nil {
							return err
						}
					}
				}
			}
		case "shellConfigs":
			if sub, ok := v.(map[string]interface{}); ok {
				allowedShells := []string{"zsh", "bash", "powershell"}
				if err := checkKeys(path, sub, allowedShells); err != nil {
					return err
				}
				allowedShellProps := []string{
					"scripts", "aliases", "env", "functions", "paths",
					"completions", "sourceFiles", "sources", "sourceFunctions",
				}
				for _, sh := range allowedShells {
					if shMap, ok := sub[sh].(map[string]interface{}); ok {
						if err := checkKeys(qualifyPath(path, sh), shMap, allowedShellProps); err != nil {
							return err
						}
					}
				}
			}
		}
	}
	return nil
}

func validateHostMap(prefix string, m map[string]interface{}) error {
	allowedHost := []string{"host", "cache", "token", "userAgent"}
	if err := checkKeys(prefix, m, allowedHost); err != nil {
		return err
	}
	if cacheMap, ok := m["cache"].(map[string]interface{}); ok {
		if err := validateCacheMap(qualifyPath(prefix, "cache"), cacheMap); err != nil {
			return err
		}
	}
	return nil
}

func validateCacheMap(prefix string, m map[string]interface{}) error {
	allowedCache := []string{"enabled", "ttl"}
	return checkKeys(prefix, m, allowedCache)
}

func checkKeys(prefix string, m map[string]interface{}, allowed []string) error {
	for k := range m {
		if !contains(allowed, k) {
			return unknownPropertyError(prefix, k, allowed)
		}
	}
	return nil
}

func unknownPropertyError(prefix, unknownKey string, allowed []string) error {
	fullProp := unknownKey
	if prefix != "" {
		fullProp = prefix + "." + unknownKey
	}

	bestMatch := findBestMatch(unknownKey, allowed)
	if bestMatch != "" {
		suggested := bestMatch
		if prefix != "" {
			suggested = prefix + "." + bestMatch
		}
		return fmt.Errorf("unknown property %q (did you mean %q?)", fullProp, suggested)
	}

	sort.Strings(allowed)
	if prefix == "" {
		return fmt.Errorf("unknown top-level property %q (valid properties: %s)", fullProp, strings.Join(allowed, ", "))
	}
	return fmt.Errorf("unknown property %q (valid properties under '%s': %s)", fullProp, prefix, strings.Join(allowed, ", "))
}

func qualifyPath(prefix, key string) string {
	if prefix == "" {
		return key
	}
	return prefix + "." + key
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}

func findBestMatch(input string, candidates []string) string {
	inputLower := strings.ToLower(input)
	bestDist := -1
	bestMatch := ""

	for _, cand := range candidates {
		candLower := strings.ToLower(cand)
		if inputLower == candLower {
			return cand
		}
		dist := levenshteinDistance(inputLower, candLower)
		maxAllowed := 3
		if len(cand) <= 4 {
			maxAllowed = 1
		} else if len(cand) <= 8 {
			maxAllowed = 2
		}
		if dist <= maxAllowed && (bestDist == -1 || dist < bestDist) {
			bestDist = dist
			bestMatch = cand
		}
	}
	return bestMatch
}

func levenshteinDistance(s, t string) int {
	d := make([][]int, len(s)+1)
	for i := range d {
		d[i] = make([]int, len(t)+1)
		d[i][0] = i
	}
	for j := range d[0] {
		d[0][j] = j
	}

	for j := 1; j <= len(t); j++ {
		for i := 1; i <= len(s); i++ {
			cost := 0
			if s[i-1] != t[j-1] {
				cost = 1
			}
			d[i][j] = min(
				d[i-1][j]+1,
				d[i][j-1]+1,
				d[i-1][j-1]+cost,
			)
		}
	}
	return d[len(s)][len(t)]
}

func min(vals ...int) int {
	m := vals[0]
	for _, v := range vals[1:] {
		if v < m {
			m = v
		}
	}
	return m
}
