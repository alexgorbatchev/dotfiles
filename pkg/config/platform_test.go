package config

import (
	"testing"
)

func TestMatchesPlatform(t *testing.T) {
	tests := []struct {
		platforms int
		osName    string
		want      bool
	}{
		{0, "linux", true},       // 0 matches all
		{1, "linux", true},       // 1 = linux
		{1, "darwin", false},     // 1 does not match darwin
		{2, "darwin", true},      // 2 = darwin
		{4, "windows", true},     // 4 = windows
		{3, "linux", true},       // 3 = linux (1) | darwin (2)
		{3, "darwin", true},      // 3 = linux (1) | darwin (2)
		{3, "windows", false},    // 3 does not match windows
		{1, "unknown_os", false}, // unknown OS
	}

	for _, tt := range tests {
		got := MatchesPlatform(tt.platforms, tt.osName)
		if got != tt.want {
			t.Errorf("MatchesPlatform(%d, %q) = %v, want %v", tt.platforms, tt.osName, got, tt.want)
		}
	}
}

func TestMatchesArch(t *testing.T) {
	tests := []struct {
		architectures int
		archName      string
		want          bool
	}{
		{3, "amd64", true},  // 3 = All
		{3, "arm64", true},  // 3 = All
		{1, "amd64", true},  // 1 = amd64 / x86_64
		{1, "x86_64", true}, // 1 = amd64 / x86_64
		{1, "arm64", false}, // 1 does not match arm64
		{2, "arm64", true},  // 2 = arm64
		{2, "amd64", false}, // 2 does not match amd64
		{0, "amd64", false}, // 0 matches none
	}

	for _, tt := range tests {
		got := MatchesArch(tt.architectures, tt.archName)
		if got != tt.want {
			t.Errorf("MatchesArch(%d, %q) = %v, want %v", tt.architectures, tt.archName, got, tt.want)
		}
	}
}

func TestResolvePlatformConfig(t *testing.T) {
	archArm64 := 2
	archAmd64 := 1

	v13 := "13.0.0"

	tc := &ToolConfig{
		Name:    "ripgrep",
		Version: &v13,
		PlatformConfigs: []PlatformConfigEntry{
			{
				Platforms:     1, // linux
				Architectures: &archAmd64,
				Config: map[string]interface{}{
					"version": "14.0.0",
				},
			},
			{
				Platforms:     2, // darwin
				Architectures: &archArm64,
				Config: map[string]interface{}{
					"version": "15.0.0",
				},
			},
		},
	}

	// Resolve for darwin arm64
	ResolvePlatformConfig(tc, "darwin", "arm64")

	if tc.Version == nil || *tc.Version != "15.0.0" {
		t.Errorf("expected version 15.0.0 after platform resolve, got %v", tc.Version)
	}

	if tc.PlatformConfigs != nil {
		t.Errorf("expected PlatformConfigs to be nil after resolution")
	}

	// Idempotency: resolving again when PlatformConfigs is nil should do nothing
	ResolvePlatformConfig(tc, "darwin", "arm64")
	if tc.Version == nil || *tc.Version != "15.0.0" {
		t.Errorf("expected version to stay 15.0.0, got %v", tc.Version)
	}

	// Nil check
	ResolvePlatformConfig(nil, "linux", "amd64")

	// Empty OS/Arch default check
	tc2 := &ToolConfig{
		Name: "bat",
		PlatformConfigs: []PlatformConfigEntry{
			{
				Platforms: 7, // linux (1) | darwin (2) | windows (4)
				Config: map[string]interface{}{
					"version": "2.0.0",
				},
			},
		},
	}
	ResolvePlatformConfigs([]*ToolConfig{tc2}, "", "")
	if tc2.Version == nil || *tc2.Version != "2.0.0" {
		t.Errorf("expected batch resolution to set version 2.0.0, got %v", tc2.Version)
	}
}
