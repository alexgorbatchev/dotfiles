package github_test

import (
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/github"
)

// TestToken pins the one resolution order every component that talks to the GitHub
// API shares: a tool's own token parameter, then the project's github.token, then
// GITHUB_TOKEN, then GH_TOKEN. Each case sets the sources below the one it expects
// as well, so the order is proven rather than the mere presence of a value.
func TestToken(t *testing.T) {
	tests := []struct {
		name string
		// configured are the values the caller owns, most specific first: for an
		// installer the tool's `token` parameter and the project's github.token.
		configured []string
		env        map[string]string
		want       string
	}{
		{
			name:       "the most specific configured value wins",
			configured: []string{"param", "project"},
			env:        map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want:       "param",
		},
		{
			name:       "configuration before the environment",
			configured: []string{"", "project"},
			env:        map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want:       "project",
		},
		{
			name:       "GITHUB_TOKEN before GH_TOKEN",
			configured: []string{"", ""},
			env:        map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want:       "gh",
		},
		{
			name: "GH_TOKEN as the last resort",
			env:  map[string]string{"GH_TOKEN": "cli"},
			want: "cli",
		},
		{
			name: "nothing configured anywhere",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_TOKEN", tt.env["GITHUB_TOKEN"])
			t.Setenv("GH_TOKEN", tt.env["GH_TOKEN"])
			if got := github.Token(tt.configured...); got != tt.want {
				t.Fatalf("Token(%q) = %q, want %q", tt.configured, got, tt.want)
			}
		})
	}
}
