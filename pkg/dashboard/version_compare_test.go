package dashboard

import "testing"

func TestIsNewerVersion(t *testing.T) {
	tests := []struct {
		name    string
		current string
		latest  string
		want    bool
	}{
		// The reported bug: an installed v0.26.1 against an upstream tag of v0.26.1.
		{name: "identical tags", current: "v0.26.1", latest: "v0.26.1", want: false},
		{name: "v prefix only upstream", current: "0.26.1", latest: "v0.26.1", want: false},
		{name: "v prefix only local", current: "v0.26.1", latest: "0.26.1", want: false},
		{name: "patch behind", current: "v0.26.0", latest: "v0.26.1", want: true},
		{name: "minor behind", current: "0.23.5", latest: "0.24.0", want: true},
		{name: "ahead of upstream", current: "v1.0.0", latest: "v0.9.0", want: false},

		// Non-semver schemes fall back to plain inequality rather than always claiming an update.
		{name: "identical date stamps", current: "2026-09-17-09-18-10", latest: "2026-09-17-09-18-10", want: false},
		{name: "differing date stamps", current: "2026-09-16-00-00-00", latest: "2026-09-17-09-18-10", want: true},

		// Nothing to compare against.
		{name: "unknown current", current: "unknown", latest: "v1.0.0", want: false},
		{name: "unknown latest", current: "v1.0.0", latest: "unknown", want: false},
		{name: "empty current", current: "", latest: "v1.0.0", want: false},
		{name: "empty latest", current: "v1.0.0", latest: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isNewerVersion(tt.current, tt.latest); got != tt.want {
				t.Fatalf("isNewerVersion(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
			}
		})
	}
}
