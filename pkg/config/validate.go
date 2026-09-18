package config

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strconv"
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

// projectSectionKeys are the sections of a project configuration. A platform override's
// config may set any of them, which is why the "platform" list itself is not among them.
var projectSectionKeys = []string{"paths", "system", "logging", "updates", "github", "cargo", "downloader", "features"}

// platformOverrideKeys are the properties of one entry in the "platform" list.
var platformOverrideKeys = []string{"match", "config"}

// platformMatchKeys are the properties of one matcher in an override's "match" list.
var platformMatchKeys = []string{"os", "arch"}

// The keys each project configuration section accepts. They are declared here rather
// than inline in validateProjectSection so that the accepted surface is one readable
// table, and so that TestEveryAcceptedProjectKeyIsAccountedFor can walk it.
var (
	pathsKeys        = []string{"homeDir", "dotfilesDir", "targetDir", "generatedDir", "toolConfigsDir", "shellScriptsDir", "binariesDir"}
	systemKeys       = []string{"sudoPrompt"}
	loggingKeys      = []string{"debug"}
	updatesKeys      = []string{"checkOnRun", "checkInterval"}
	cargoKeys        = []string{"cratesIo", "githubRaw", "githubRelease", "userAgent"}
	cargoHostKeys    = []string{"cratesIo", "githubRaw", "githubRelease"}
	downloaderKeys   = []string{"timeout", "retryCount", "retryDelay", "cache"}
	featuresKeys     = []string{"catalog", "shellInstall"}
	catalogKeys      = []string{"generate", "filePath"}
	shellInstallKeys = []string{"zsh", "bash", "powershell"}
	hostKeys         = []string{"host", "cache", "token", "userAgent"}
	cacheKeys        = []string{"enabled", "ttl"}
)

func validateProjectMap(prefix string, m map[string]interface{}) error {
	allowedProjectKeys := append(slices.Clone(projectSectionKeys), "platform")
	for k, v := range m {
		if !contains(allowedProjectKeys, k) {
			return unknownPropertyError(prefix, k, allowedProjectKeys)
		}
		path := qualifyPath(prefix, k)
		if k == "platform" {
			if err := validatePlatformOverrides(path, v); err != nil {
				return err
			}
			continue
		}
		if err := validateProjectSection(path, k, v); err != nil {
			return err
		}
	}
	return nil
}

// validateProjectSections validates the config of a platform override, which may hold
// any base section but not another platform list.
func validateProjectSections(prefix string, m map[string]interface{}) error {
	for k, v := range m {
		if !contains(projectSectionKeys, k) {
			return unknownPropertyError(prefix, k, projectSectionKeys)
		}
		if err := validateProjectSection(qualifyPath(prefix, k), k, v); err != nil {
			return err
		}
	}
	return nil
}

// validatePlatformOverrides checks the "platform" list against the v1 schema: each
// entry is an object with a non-empty "match" list and a "config" of base sections.
func validatePlatformOverrides(path string, v interface{}) error {
	overrides, ok := v.([]interface{})
	if !ok {
		return fmt.Errorf("property %q must be an array of platform overrides", path)
	}
	for i, item := range overrides {
		itemPath := fmt.Sprintf("%s[%d]", path, i)
		override, ok := item.(map[string]interface{})
		if !ok {
			return fmt.Errorf("property %q must be an object with \"match\" and \"config\"", itemPath)
		}
		if err := checkKeys(itemPath, override, platformOverrideKeys); err != nil {
			return err
		}
		if err := validatePlatformMatchers(qualifyPath(itemPath, "match"), override["match"]); err != nil {
			return err
		}
		configPath := qualifyPath(itemPath, "config")
		overrideConfig, ok := override["config"].(map[string]interface{})
		if !ok {
			return fmt.Errorf("property %q must be an object of configuration sections", configPath)
		}
		if err := validateProjectSections(configPath, overrideConfig); err != nil {
			return err
		}
	}
	return nil
}

// validatePlatformMatchers checks an override's "match" list: at least one matcher,
// each naming an os and/or an arch from the fixed vocabularies.
func validatePlatformMatchers(path string, v interface{}) error {
	matchers, ok := v.([]interface{})
	if !ok || len(matchers) == 0 {
		return fmt.Errorf("property %q must be a non-empty array of matchers", path)
	}
	for i, item := range matchers {
		itemPath := fmt.Sprintf("%s[%d]", path, i)
		matcher, ok := item.(map[string]interface{})
		if !ok {
			return fmt.Errorf("property %q must be an object with \"os\" and/or \"arch\"", itemPath)
		}
		if err := checkKeys(itemPath, matcher, platformMatchKeys); err != nil {
			return err
		}
		osValue, hasOS := matcher["os"]
		archValue, hasArch := matcher["arch"]
		if !hasOS && !hasArch {
			return fmt.Errorf("property %q must name at least one of \"os\" and \"arch\"", itemPath)
		}
		if hasOS {
			if err := checkVocabulary(qualifyPath(itemPath, "os"), osValue, PlatformMatchOSNames()); err != nil {
				return err
			}
		}
		if hasArch {
			if err := checkVocabulary(qualifyPath(itemPath, "arch"), archValue, PlatformMatchArchNames()); err != nil {
				return err
			}
		}
	}
	return nil
}

// checkVocabulary requires value to be one of the allowed strings.
func checkVocabulary(path string, value interface{}, allowed []string) error {
	if s, ok := value.(string); ok && contains(allowed, s) {
		return nil
	}
	quoted := make([]string, len(allowed))
	for i, name := range allowed {
		quoted[i] = strconv.Quote(name)
	}
	return fmt.Errorf("property %q must be one of %s, got %s", path, strings.Join(quoted, ", "), formatJSONValue(value))
}

// formatJSONValue renders a decoded JSON value for an error message, quoting strings so
// they read as the literal the author wrote.
func formatJSONValue(value interface{}) string {
	if s, ok := value.(string); ok {
		return strconv.Quote(s)
	}
	return fmt.Sprintf("%v", value)
}

// validateProjectSection validates the value of one base configuration section.
func validateProjectSection(path, key string, v interface{}) error {
	switch key {
	case "paths":
		if sub, ok := v.(map[string]interface{}); ok {
			if err := checkKeys(path, sub, pathsKeys); err != nil {
				return err
			}
		}
	case "system":
		if sub, ok := v.(map[string]interface{}); ok {
			if err := checkKeys(path, sub, systemKeys); err != nil {
				return err
			}
		}
	case "logging":
		if sub, ok := v.(map[string]interface{}); ok {
			if err := checkKeys(path, sub, loggingKeys); err != nil {
				return err
			}
		}
	case "updates":
		if sub, ok := v.(map[string]interface{}); ok {
			if err := checkKeys(path, sub, updatesKeys); err != nil {
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
			if err := checkKeys(path, sub, cargoKeys); err != nil {
				return err
			}
			for _, subHost := range cargoHostKeys {
				if hostMap, ok := sub[subHost].(map[string]interface{}); ok {
					if err := validateHostMap(qualifyPath(path, subHost), hostMap); err != nil {
						return err
					}
				}
			}
		}
	case "downloader":
		if sub, ok := v.(map[string]interface{}); ok {
			if err := checkKeys(path, sub, downloaderKeys); err != nil {
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
			if err := checkKeys(path, sub, featuresKeys); err != nil {
				return err
			}
			if catMap, ok := sub["catalog"].(map[string]interface{}); ok {
				if err := checkKeys(qualifyPath(path, "catalog"), catMap, catalogKeys); err != nil {
					return err
				}
			}
			if shMap, ok := sub["shellInstall"].(map[string]interface{}); ok {
				if err := checkKeys(qualifyPath(path, "shellInstall"), shMap, shellInstallKeys); err != nil {
					return err
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
				allowedShellProps := []string{"scripts", "aliases", "env", "functions", "paths", "completions"}
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
	if err := checkKeys(prefix, m, hostKeys); err != nil {
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
	return checkKeys(prefix, m, cacheKeys)
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

	// Sort a copy: callers hand in shared slices such as projectSectionKeys.
	valid := slices.Clone(allowed)
	sort.Strings(valid)
	if prefix == "" {
		return fmt.Errorf("unknown top-level property %q (valid properties: %s)", fullProp, strings.Join(valid, ", "))
	}
	return fmt.Errorf("unknown property %q (valid properties under '%s': %s)", fullProp, prefix, strings.Join(valid, ", "))
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
