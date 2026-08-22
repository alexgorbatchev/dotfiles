package config

import (
	"encoding/json"
	"runtime"
)

// MatchesPlatform checks if a platform bitmask matches the given OS name ("linux", "darwin", "windows").
func MatchesPlatform(platforms int, osName string) bool {
	if platforms == 0 {
		return true
	}
	var mask int
	switch osName {
	case "linux":
		mask = 1
	case "darwin":
		mask = 2
	case "windows":
		mask = 4
	default:
		return false
	}
	return (platforms & mask) == mask
}

// MatchesArch checks if an architecture bitmask matches the given arch name ("amd64", "x86_64", "arm64").
func MatchesArch(architectures int, archName string) bool {
	if architectures == 3 { // All
		return true
	}
	if architectures == 2 && archName == "arm64" {
		return true
	}
	if architectures == 1 && (archName == "amd64" || archName == "x86_64") {
		return true
	}
	return false
}

// ResolvePlatformConfig merges platform-specific overrides into tc for the given OS and architecture.
// Once resolved, tc.PlatformConfigs is cleared so that subsequent calls are idempotent.
func ResolvePlatformConfig(tc *ToolConfig, osName, archName string) {
	if tc == nil || len(tc.PlatformConfigs) == 0 {
		return
	}

	if osName == "" {
		osName = runtime.GOOS
	}
	if archName == "" {
		archName = runtime.GOARCH
	}

	matched := false
	for _, entry := range tc.PlatformConfigs {
		if MatchesPlatform(entry.Platforms, osName) {
			if entry.Architectures != nil {
				if !MatchesArch(*entry.Architectures, archName) {
					continue
				}
			}

			matched = true
			jsonBytes, err := json.Marshal(entry.Config)
			if err == nil {
				var rawOverride map[string]interface{}
				var override ToolConfig
				if err := json.Unmarshal(jsonBytes, &rawOverride); err == nil {
					if err := json.Unmarshal(jsonBytes, &override); err == nil {
						tc.Merge(&override, rawOverride)
					}
				}
			}
		}
	}
	tc.PlatformConfigs = nil

	if !matched && (tc.InstallationMethod == "" || tc.Disabled) {
		tc.PlatformUnsupported = true
	}
}

// ResolvePlatformConfigs evaluates and merges platform overrides on a list of ToolConfigs
// for the specified OS and architecture (defaulting to runtime.GOOS and runtime.GOARCH if empty).
func ResolvePlatformConfigs(tools []*ToolConfig, osName, archName string) {
	if osName == "" {
		osName = runtime.GOOS
	}
	if archName == "" {
		archName = runtime.GOARCH
	}
	for _, tc := range tools {
		ResolvePlatformConfig(tc, osName, archName)
	}
}
