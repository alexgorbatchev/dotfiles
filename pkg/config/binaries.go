package config

// AsBinaryConfig extracts a BinaryConfig from an untyped entry of ToolConfig.Binaries.
// An entry is either a map[string]interface{} (as recorded by .bin()), a BinaryConfig,
// or a *BinaryConfig. Any other type returns an empty BinaryConfig and false.
func AsBinaryConfig(b interface{}) (BinaryConfig, bool) {
	switch val := b.(type) {
	case map[string]interface{}:
		name, _ := val["name"].(string)
		pattern, _ := val["pattern"].(string)
		var shim *bool
		if s, ok := val["shim"].(bool); ok {
			shim = &s
		} else if s, ok := val["shim"].(*bool); ok {
			shim = s
		}
		return BinaryConfig{Name: name, Pattern: pattern, Shim: shim}, true
	case BinaryConfig:
		return val, true
	case *BinaryConfig:
		if val != nil {
			return *val, true
		}
	}
	return BinaryConfig{}, false
}

// GetBinaryName returns the name declared by a single binary entry, or "".
func GetBinaryName(b interface{}) string {
	if bc, ok := AsBinaryConfig(b); ok {
		return bc.Name
	}
	return ""
}

// DeclaredBinaryPattern returns the pattern a binary entry declares and whether it
// declares one: only a non-empty string selects a file, and anything else leaves
// the default glob.
func DeclaredBinaryPattern(b interface{}) (string, bool) {
	if bc, ok := AsBinaryConfig(b); ok && bc.Pattern != "" {
		return bc.Pattern, true
	}
	return "", false
}

// GetBinaryNames returns the binary names declared in toolBinaries.
// If toolName is non-empty and no binary names are declared, it falls back to []string{toolName}.
func GetBinaryNames(toolName string, toolBinaries []interface{}) []string {
	names := make([]string, 0, len(toolBinaries))
	for _, b := range toolBinaries {
		if bc, ok := AsBinaryConfig(b); ok && bc.Name != "" {
			names = append(names, bc.Name)
		}
	}
	if len(names) == 0 && toolName != "" {
		return []string{toolName}
	}
	return names
}

// BinaryNames returns the declared binary names in toolBinaries without fallback.
func BinaryNames(toolBinaries []interface{}) []string {
	return GetBinaryNames("", toolBinaries)
}

// GetPatternForBinary returns the pattern declared for binName in toolBinaries, or "".
func GetPatternForBinary(toolBinaries []interface{}, binName string) string {
	for _, b := range toolBinaries {
		if bc, ok := AsBinaryConfig(b); ok && bc.Name == binName {
			return bc.Pattern
		}
	}
	return ""
}

// WantsShim reports whether the binary named binName should get a shim in the target
// directory. Only an explicit `shim: false` on the binary's declaration turns it off.
// If the binary is not found, it returns true by default.
func WantsShim(toolBinaries []interface{}, binName string) bool {
	for _, b := range toolBinaries {
		if bc, ok := AsBinaryConfig(b); ok && bc.Name == binName {
			return bc.WantsShim()
		}
	}
	return true
}

// BinaryNames returns the declared binary names for tc.
func (tc *ToolConfig) BinaryNames() []string {
	if tc == nil {
		return nil
	}
	return BinaryNames(tc.Binaries)
}

// BinaryConfigs returns the declared binaries converted to BinaryConfig structs.
func (tc *ToolConfig) BinaryConfigs() []BinaryConfig {
	if tc == nil || len(tc.Binaries) == 0 {
		return nil
	}
	configs := make([]BinaryConfig, 0, len(tc.Binaries))
	for _, b := range tc.Binaries {
		if bc, ok := AsBinaryConfig(b); ok && bc.Name != "" {
			configs = append(configs, bc)
		}
	}
	return configs
}
