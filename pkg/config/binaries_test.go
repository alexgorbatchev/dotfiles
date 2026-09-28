package config

import (
	"reflect"
	"testing"
)

func TestAsBinaryConfig(t *testing.T) {
	t.Parallel()

	f := false
	tr := true

	tests := []struct {
		name    string
		input   interface{}
		wantBC  BinaryConfig
		wantOk  bool
		wantPat string
		wantDec bool
		wantSh  bool
	}{
		{
			name:    "map with name only",
			input:   map[string]interface{}{"name": "bare"},
			wantBC:  BinaryConfig{Name: "bare"},
			wantOk:  true,
			wantPat: "",
			wantDec: false,
			wantSh:  true,
		},
		{
			name:    "map with name, pattern, and shim false",
			input:   map[string]interface{}{"name": "full", "pattern": "bin/full", "shim": false},
			wantBC:  BinaryConfig{Name: "full", Pattern: "bin/full", Shim: &f},
			wantOk:  true,
			wantPat: "bin/full",
			wantDec: true,
			wantSh:  false,
		},
		{
			name:    "map with shim true pointer",
			input:   map[string]interface{}{"name": "shim-ptr", "shim": &tr},
			wantBC:  BinaryConfig{Name: "shim-ptr", Shim: &tr},
			wantOk:  true,
			wantPat: "",
			wantDec: false,
			wantSh:  true,
		},
		{
			name:    "BinaryConfig value",
			input:   BinaryConfig{Name: "val", Pattern: "bin/val", Shim: &f},
			wantBC:  BinaryConfig{Name: "val", Pattern: "bin/val", Shim: &f},
			wantOk:  true,
			wantPat: "bin/val",
			wantDec: true,
			wantSh:  false,
		},
		{
			name:    "BinaryConfig pointer",
			input:   &BinaryConfig{Name: "ptr", Pattern: "bin/ptr"},
			wantBC:  BinaryConfig{Name: "ptr", Pattern: "bin/ptr"},
			wantOk:  true,
			wantPat: "bin/ptr",
			wantDec: true,
			wantSh:  true,
		},
		{
			name:    "nil BinaryConfig pointer",
			input:   (*BinaryConfig)(nil),
			wantBC:  BinaryConfig{},
			wantOk:  false,
			wantPat: "",
			wantDec: false,
			wantSh:  true,
		},
		{
			name:    "bare string is rejected",
			input:   "some-tool",
			wantBC:  BinaryConfig{},
			wantOk:  false,
			wantPat: "",
			wantDec: false,
			wantSh:  true,
		},
		{
			name:    "nil interface",
			input:   nil,
			wantBC:  BinaryConfig{},
			wantOk:  false,
			wantPat: "",
			wantDec: false,
			wantSh:  true,
		},
		{
			name:    "number",
			input:   42,
			wantBC:  BinaryConfig{},
			wantOk:  false,
			wantPat: "",
			wantDec: false,
			wantSh:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bc, ok := AsBinaryConfig(tt.input)
			if ok != tt.wantOk {
				t.Errorf("AsBinaryConfig() ok = %v, want %v", ok, tt.wantOk)
			}
			if !reflect.DeepEqual(bc, tt.wantBC) {
				t.Errorf("AsBinaryConfig() bc = %#v, want %#v", bc, tt.wantBC)
			}

			// Test GetBinaryName
			if gotName := GetBinaryName(tt.input); gotName != tt.wantBC.Name {
				t.Errorf("GetBinaryName() = %q, want %q", gotName, tt.wantBC.Name)
			}

			// Test DeclaredBinaryPattern
			pat, dec := DeclaredBinaryPattern(tt.input)
			if pat != tt.wantPat || dec != tt.wantDec {
				t.Errorf("DeclaredBinaryPattern() = (%q, %v), want (%q, %v)", pat, dec, tt.wantPat, tt.wantDec)
			}
		})
	}
}

func TestBinaryReadersOverCollections(t *testing.T) {
	t.Parallel()

	f := false
	tr := true

	binaries := []interface{}{
		map[string]interface{}{"name": "b1", "pattern": "pat1"},
		map[string]interface{}{"name": "b2", "shim": false},
		map[string]interface{}{"name": "b3", "pattern": "pat3", "shim": true},
		BinaryConfig{Name: "b4", Pattern: "pat4", Shim: &f},
		&BinaryConfig{Name: "b5", Pattern: "pat5", Shim: &tr},
		&BinaryConfig{Name: "b6"},
		(*BinaryConfig)(nil),
		"unrecognized-string",
		42,
	}

	// 1. GetBinaryNames
	wantNames := []string{"b1", "b2", "b3", "b4", "b5", "b6"}
	gotNames := GetBinaryNames("fallback", binaries)
	if !reflect.DeepEqual(gotNames, wantNames) {
		t.Errorf("GetBinaryNames() = %v, want %v", gotNames, wantNames)
	}

	// 2. Fallback when empty
	fallbackOnly := GetBinaryNames("my-tool", nil)
	if !reflect.DeepEqual(fallbackOnly, []string{"my-tool"}) {
		t.Errorf("GetBinaryNames(fallback) = %v, want ['my-tool']", fallbackOnly)
	}

	// 3. BinaryNames (no fallback)
	noFallbackEmpty := BinaryNames(nil)
	if len(noFallbackEmpty) != 0 {
		t.Errorf("BinaryNames(nil) = %v, want empty", noFallbackEmpty)
	}
	gotNoFallback := BinaryNames(binaries)
	if !reflect.DeepEqual(gotNoFallback, wantNames) {
		t.Errorf("BinaryNames() = %v, want %v", gotNoFallback, wantNames)
	}

	// 4. GetPatternForBinary
	if pat := GetPatternForBinary(binaries, "b1"); pat != "pat1" {
		t.Errorf("GetPatternForBinary(b1) = %q, want 'pat1'", pat)
	}
	if pat := GetPatternForBinary(binaries, "b4"); pat != "pat4" {
		t.Errorf("GetPatternForBinary(b4) = %q, want 'pat4'", pat)
	}
	if pat := GetPatternForBinary(binaries, "b5"); pat != "pat5" {
		t.Errorf("GetPatternForBinary(b5) = %q, want 'pat5'", pat)
	}
	if pat := GetPatternForBinary(binaries, "b6"); pat != "" {
		t.Errorf("GetPatternForBinary(b6) = %q, want empty", pat)
	}
	if pat := GetPatternForBinary(binaries, "nonexistent"); pat != "" {
		t.Errorf("GetPatternForBinary(nonexistent) = %q, want empty", pat)
	}

	// 5. WantsShim
	if got := WantsShim(binaries, "b1"); !got {
		t.Errorf("WantsShim(b1) = %v, want true", got)
	}
	if got := WantsShim(binaries, "b2"); got {
		t.Errorf("WantsShim(b2) = %v, want false", got)
	}
	if got := WantsShim(binaries, "b3"); !got {
		t.Errorf("WantsShim(b3) = %v, want true", got)
	}
	if got := WantsShim(binaries, "b4"); got {
		t.Errorf("WantsShim(b4) = %v, want false", got)
	}
	if got := WantsShim(binaries, "b5"); !got {
		t.Errorf("WantsShim(b5) = %v, want true", got)
	}
	if got := WantsShim(binaries, "b6"); !got {
		t.Errorf("WantsShim(b6) = %v, want true", got)
	}
	if got := WantsShim(binaries, "nonexistent"); !got {
		t.Errorf("WantsShim(nonexistent) = %v, want true", got)
	}

	// 6. ToolConfig methods
	tc := &ToolConfig{
		Name:     "tool",
		Binaries: binaries,
	}
	if names := tc.BinaryNames(); !reflect.DeepEqual(names, wantNames) {
		t.Errorf("tc.BinaryNames() = %v, want %v", names, wantNames)
	}

	configs := tc.BinaryConfigs()
	if len(configs) != 6 {
		t.Fatalf("tc.BinaryConfigs() len = %d, want 6", len(configs))
	}
	if configs[0].Name != "b1" || configs[0].Pattern != "pat1" {
		t.Errorf("configs[0] = %+v", configs[0])
	}
	if configs[1].Name != "b2" || configs[1].Shim == nil || *configs[1].Shim != false {
		t.Errorf("configs[1] = %+v", configs[1])
	}

	var nilTC *ToolConfig
	if nilTC.BinaryNames() != nil {
		t.Errorf("nilTC.BinaryNames() = %v, want nil", nilTC.BinaryNames())
	}
	if nilTC.BinaryConfigs() != nil {
		t.Errorf("nilTC.BinaryConfigs() = %v, want nil", nilTC.BinaryConfigs())
	}
}
