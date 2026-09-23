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
		{0, "linux", false},      // an empty bitmask selects nothing; nil means unconstrained
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

// PlatformOf and ArchitectureOf are the one mapping from the Go spelling of a target to
// the Platform and Architecture members the authoring DSL compares against. A name with
// no member maps to zero, v1's Platform.None / Architecture.None, which equals no member.
func TestPlatformOf(t *testing.T) {
	tests := []struct {
		osName string
		want   int
	}{
		{"linux", PlatformLinux},
		{"darwin", PlatformMacOS},
		{"windows", PlatformWindows},
		{"freebsd", 0},
		{"", 0},
	}

	for _, tt := range tests {
		if got := PlatformOf(tt.osName); got != tt.want {
			t.Errorf("PlatformOf(%q) = %d, want %d", tt.osName, got, tt.want)
		}
	}
}

func TestArchitectureOf(t *testing.T) {
	tests := []struct {
		archName string
		want     int
	}{
		{"amd64", ArchX86_64},
		{"x86_64", ArchX86_64},
		{"arm64", ArchArm64},
		{"386", 0},
		{"", 0},
	}

	for _, tt := range tests {
		if got := ArchitectureOf(tt.archName); got != tt.want {
			t.Errorf("ArchitectureOf(%q) = %d, want %d", tt.archName, got, tt.want)
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
