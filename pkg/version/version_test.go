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

func TestUpdateAvailable(t *testing.T) {
	tests := []struct {
		name  string
		query UpdateQuery
		want  bool
	}{
		{"no latest version resolved", UpdateQuery{Installed: "1.2.3"}, false},
		{"nothing installed and a latest version", UpdateQuery{Latest: "1.2.3"}, true},
		{"installed behind latest", UpdateQuery{Installed: "1.2.3", Latest: "1.3.0"}, true},
		{"installed equal to latest", UpdateQuery{Installed: "1.2.3", Latest: "1.2.3"}, false},
		{"installed equal to latest ignoring the v prefix", UpdateQuery{Installed: "v1.2.3", Latest: "1.2.3"}, false},
		{"installed ahead of latest", UpdateQuery{Installed: "2.0.0", Latest: "1.2.3"}, false},
		{"unparseable installed differing from latest", UpdateQuery{Installed: "nightly", Latest: "1.2.3"}, true},
		{"unparseable installed equal to latest", UpdateQuery{Installed: "nightly", Latest: "nightly"}, false},
		{"unparseable latest differing from installed", UpdateQuery{Installed: "1.2.3", Latest: "nightly"}, true},

		{"constraint admits the latest version", UpdateQuery{Installed: "1.2.3", Latest: "1.2.4", Constraint: "~1.2.0"}, true},
		{"constraint excludes the latest version", UpdateQuery{Installed: "1.2.3", Latest: "1.3.0", Constraint: "~1.2.0"}, false},
		{"caret constraint admits a minor bump", UpdateQuery{Installed: "1.2.3", Latest: "1.3.0", Constraint: "^1.2.3"}, true},
		{"caret constraint excludes a major bump", UpdateQuery{Installed: "1.2.3", Latest: "2.0.0", Constraint: "^1.2.3"}, false},
		{"constraint with nothing installed", UpdateQuery{Latest: "2.0.0", Constraint: "^1.2.3"}, false},
		{"constraint cannot admit an unparseable latest version", UpdateQuery{Installed: "1.2.3", Latest: "nightly", Constraint: "^1.2.3"}, false},
		{"wildcard constraint admits anything", UpdateQuery{Installed: "1.2.3", Latest: "9.9.9", Constraint: "*"}, true},

		// An installed v0.26.1 against an upstream tag of v0.26.1 was once reported as an
		// update by the dashboard, and date-stamped versions as a permanent update.
		{"identical tags", UpdateQuery{Installed: "v0.26.1", Latest: "v0.26.1"}, false},
		{"v prefix only upstream", UpdateQuery{Installed: "0.26.1", Latest: "v0.26.1"}, false},
		{"v prefix only local", UpdateQuery{Installed: "v0.26.1", Latest: "0.26.1"}, false},
		{"identical date stamps", UpdateQuery{Installed: "2026-09-17-09-18-10", Latest: "2026-09-17-09-18-10"}, false},
		{"differing date stamps", UpdateQuery{Installed: "2026-09-16-00-00-00", Latest: "2026-09-17-09-18-10"}, true},

		{"outdated override wins over equal versions", UpdateQuery{Installed: "1.2.3_1", Latest: "1.2.3_1", Outdated: boolPtr(true)}, true},
		{"outdated override wins over a newer latest", UpdateQuery{Installed: "1.2.3", Latest: "9.9.9", Outdated: boolPtr(false)}, false},
		{"outdated override answers without a latest version", UpdateQuery{Installed: "1:8.2-1", Outdated: boolPtr(true)}, true},
		{"constraint still bounds the outdated override", UpdateQuery{Installed: "1.2.3", Latest: "2.0.0", Constraint: "^1.2.3", Outdated: boolPtr(true)}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := UpdateAvailable(tt.query); got != tt.want {
				t.Errorf("UpdateAvailable(%+v) = %t, want %t", tt.query, got, tt.want)
			}
		})
	}
}

func boolPtr(b bool) *bool { return &b }
