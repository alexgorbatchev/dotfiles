package version

import (
	"testing"
)

func TestCleanVersion(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"1.2.3", "v1.2.3"},
		{"v1.2.3", "v1.2.3"},
		{"  2.0.0-beta  ", "v2.0.0-beta"},
	}
	for _, tt := range tests {
		if got := CleanVersion(tt.input); got != tt.want {
			t.Errorf("CleanVersion(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestParseVersion(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"v1.2.3", "1.2.3"},
		{"1.2.3", "1.2.3"},
		{"  v2.0.0  ", "2.0.0"},
	}
	for _, tt := range tests {
		if got := ParseVersion(tt.input); got != tt.want {
			t.Errorf("ParseVersion(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestCheckVersionStatus(t *testing.T) {
	tests := []struct {
		current string
		latest  string
		want    VersionComparisonStatus
	}{
		{"invalid-semver", "1.0.0", StatusInvalidCurrent},
		{"1.0.0", "invalid-semver", StatusInvalidLatest},
		{"1.0.0", "1.1.0", StatusNewerAvailable},
		{"1.0.0", "1.0.0", StatusUpToDate},
		{"1.1.0", "1.0.0", StatusAheadOfLatest},
		{"v1.2.3", "1.2.3", StatusUpToDate},
		{"1.2.3", "v1.2.3-alpha", StatusAheadOfLatest}, // 1.2.3 is ahead of 1.2.3-alpha
	}
	for _, tt := range tests {
		t.Run(tt.current+"_vs_"+tt.latest, func(t *testing.T) {
			if got := CheckVersionStatus(tt.current, tt.latest); got != tt.want {
				t.Errorf("CheckVersionStatus(%q, %q) = %d, want %d", tt.current, tt.latest, got, tt.want)
			}
		})
	}
}

func TestMatchesConstraint(t *testing.T) {
	tests := []struct {
		version    string
		constraint string
		want       bool
	}{
		{"1.2.3", "", true},
		{"1.2.3", "*", true},
		{"1.2.3", "latest", true},
		{"invalid", "^1.2.3", false},
		{"1.2.3", "^invalid", false},
		{"1.2.3", "~invalid", false},

		// Caret compatible with 1.2.3 (>= 1.2.3 and < 2.0.0)
		{"1.2.3", "^1.2.3", true},
		{"1.5.0", "^1.2.3", true},
		{"2.0.0", "^1.2.3", false},
		{"1.2.2", "^1.2.3", false},

		// Caret compatible pre-1.0.0 with 0.x.y (>= 0.x.y and < 0.x+1.0)
		{"0.2.3", "^0.2.3", true},
		{"0.2.5", "^0.2.3", true},
		{"0.3.0", "^0.2.3", false},

		// Caret compatible pre-1.0.0 with 0.0.x (>= 0.0.x and < 0.0.x+1)
		{"0.0.3", "^0.0.3", true},
		{"0.0.4", "^0.0.3", false},

		// Tilde compatible with 1.2.3 (>= 1.2.3 and < 1.3.0)
		{"1.2.3", "~1.2.3", true},
		{"1.2.5", "~1.2.3", true},
		{"1.3.0", "~1.2.3", false},
		{"1.2.2", "~1.2.3", false},

		// Comparison operators
		{"1.2.3", ">=1.2.0", true},
		{"1.2.3", ">=1.2.3", true},
		{"1.2.3", ">=1.3.0", false},

		{"1.2.3", "<=1.3.0", true},
		{"1.2.3", "<=1.2.3", true},
		{"1.2.3", "<=1.2.0", false},

		{"1.2.3", ">1.2.0", true},
		{"1.2.3", ">1.2.3", false},

		{"1.2.3", "<1.3.0", true},
		{"1.2.3", "<1.2.3", false},

		// Exact matches
		{"1.2.3", "1.2.3", true},
		{"1.2.3", "v1.2.3", true},
		{"1.2.3", "1.2.4", false},
	}
	for _, tt := range tests {
		t.Run(tt.version+"_matches_"+tt.constraint, func(t *testing.T) {
			if got := MatchesConstraint(tt.version, tt.constraint); got != tt.want {
				t.Errorf("MatchesConstraint(%q, %q) = %t, want %t", tt.version, tt.constraint, got, tt.want)
			}
		})
	}
}
