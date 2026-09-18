package config

import (
	"encoding/json"
	"fmt"
	"sort"
)

// platformMatchOS maps the operating system names a project-level platform matcher
// may use to their platform bits. The names are the v1 vocabulary; the target an
// override is matched against uses the Go spelling ("darwin"), which MatchesPlatform
// understands.
var platformMatchOS = map[string]int{
	"macos":   PlatformMacOS,
	"linux":   PlatformLinux,
	"windows": PlatformWindows,
}

// platformMatchArch maps the architecture names a project-level platform matcher may
// use to their architecture bits. Only the v1 vocabulary is accepted; MatchesArch takes
// care of a target reported as "amd64".
var platformMatchArch = map[string]int{
	"x86_64": ArchX86_64,
	"arm64":  ArchArm64,
}

// PlatformMatchOSNames lists the operating system names a matcher accepts, sorted.
func PlatformMatchOSNames() []string {
	return sortedKeys(platformMatchOS)
}

// PlatformMatchArchNames lists the architecture names a matcher accepts, sorted.
func PlatformMatchArchNames() []string {
	return sortedKeys(platformMatchArch)
}

// PlatformMatch selects the machines a PlatformOverride applies to. A field left empty
// does not constrain that dimension, so {OS: "macos"} matches every macOS machine.
type PlatformMatch struct {
	OS   string `json:"os,omitempty"`
	Arch string `json:"arch,omitempty"`
}

// Matches reports whether a target OS ("darwin", "linux", "windows") and architecture
// ("amd64", "x86_64", "arm64") satisfy this matcher. Following the package convention
// that an empty selection selects nothing, the zero PlatformMatch never matches; the
// validator guarantees at least one field is set.
func (m PlatformMatch) Matches(osName, archName string) bool {
	if m.OS == "" && m.Arch == "" {
		return false
	}
	if m.OS != "" && !MatchesPlatform(platformMatchOS[m.OS], osName) {
		return false
	}
	if m.Arch != "" && !MatchesArch(platformMatchArch[m.Arch], archName) {
		return false
	}
	return true
}

// PlatformOverride is one entry of a project configuration's "platform" list: a partial
// configuration folded into the base configuration when any of its matchers matches.
type PlatformOverride struct {
	Match  []PlatformMatch        `json:"match"`
	Config map[string]interface{} `json:"config"`
}

// appliesTo reports whether any matcher selects the target.
func (o PlatformOverride) appliesTo(osName, archName string) bool {
	for _, m := range o.Match {
		if m.Matches(osName, archName) {
			return true
		}
	}
	return false
}

// ApplyPlatformOverrides folds the entries of a project configuration's "platform"
// list that apply to the target into the configuration and removes the list, returning
// the resulting JSON. Overrides are applied in order, so a later matching entry wins
// over an earlier one; objects merge recursively while every other value replaces the
// base value outright. data must already have passed ValidateProjectConfigRawJSON.
func ApplyPlatformOverrides(data []byte, osName, archName string) ([]byte, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("invalid JSON syntax: %w", err)
	}

	rawOverrides, ok := raw["platform"]
	if !ok {
		return data, nil
	}
	delete(raw, "platform")

	overrides, err := decodePlatformOverrides(rawOverrides)
	if err != nil {
		return nil, err
	}
	for _, override := range overrides {
		if override.appliesTo(osName, archName) {
			deepMerge(raw, override.Config)
		}
	}

	resolved, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("encoding resolved project config: %w", err)
	}
	return resolved, nil
}

// decodePlatformOverrides turns the decoded "platform" value back into typed entries.
func decodePlatformOverrides(value interface{}) ([]PlatformOverride, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encoding platform overrides: %w", err)
	}
	var overrides []PlatformOverride
	if err := json.Unmarshal(encoded, &overrides); err != nil {
		return nil, fmt.Errorf("decoding platform overrides: %w", err)
	}
	return overrides, nil
}

// deepMerge writes src into dst. A key whose value is an object on both sides is
// merged recursively; any other value from src replaces what dst had.
func deepMerge(dst, src map[string]interface{}) {
	for key, srcValue := range src {
		srcMap, srcIsMap := srcValue.(map[string]interface{})
		dstMap, dstIsMap := dst[key].(map[string]interface{})
		if srcIsMap && dstIsMap {
			deepMerge(dstMap, srcMap)
			continue
		}
		dst[key] = srcValue
	}
}

func sortedKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
