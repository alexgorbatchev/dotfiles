package config

import (
	"os"
	"testing"
)

func TestMatchesHostname(t *testing.T) {
	t.Parallel()
	current, err := os.Hostname()
	if err != nil || len(current) < 2 {
		t.Skipf("this machine reports no usable hostname (%q, %v)", current, err)
	}

	tests := []struct {
		name    string
		pattern string
		want    bool
	}{
		{"empty pattern names every machine", "", true},
		{"exact hostname", current, true},
		{"part of the hostname", current[:len(current)-1], true},
		{"regular expression that matches", "/.*/", true},
		{"regular expression that does not match", "/^non_matching_regex_pattern_xyz_123$/", false},
		{"invalid regular expression is compared as written", "/[invalid/", false},
		{"lone slash is compared as written", "/", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := MatchesHostname(tt.pattern); got != tt.want {
				t.Errorf("MatchesHostname(%q) = %v, want %v", tt.pattern, got, tt.want)
			}
		})
	}
}

func TestToolConfigIsActive(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		tool ToolConfig
		want bool
	}{
		{"enabled everywhere", ToolConfig{Name: "a"}, true},
		{"disabled", ToolConfig{Name: "a", Disabled: true}, false},
		{"scoped to another host", ToolConfig{Name: "a", Hostname: "/^no-host-is-called-this-165$/"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.tool.IsActive(); got != tt.want {
				t.Errorf("IsActive() = %v, want %v", got, tt.want)
			}
		})
	}
}
