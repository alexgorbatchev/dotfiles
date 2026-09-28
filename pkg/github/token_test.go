package github_test

import (
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/github"
)

// TestToken pins the resolution order and host scoping every component that talks
// to the GitHub API shares following the gh CLI convention:
// 1. Configured token parameters (tool token, then project github.token) win across all hosts.
// 2. For github.com, api.github.com, *.ghe.com, or empty host (default): GH_TOKEN, then GITHUB_TOKEN.
// 3. For any other host (such as GitHub Enterprise Server): GH_ENTERPRISE_TOKEN, then GITHUB_ENTERPRISE_TOKEN.
func TestToken(t *testing.T) {
	tests := []struct {
		name       string
		host       string
		configured []string
		env        map[string]string
		want       string
	}{
		// 1. Configured token precedence across all hosts
		{
			name:       "the most specific configured value wins on github.com",
			host:       "https://api.github.com",
			configured: []string{"param", "project"},
			env:        map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want:       "param",
		},
		{
			name:       "configuration before the environment on github.com",
			host:       "https://api.github.com",
			configured: []string{"", "project"},
			env:        map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want:       "project",
		},
		{
			name:       "configured token wins on enterprise host",
			host:       "https://ghe.example.com/api/v3",
			configured: []string{"param", "project"},
			env:        map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want:       "param",
		},
		{
			name:       "project token before environment on enterprise host",
			host:       "https://ghe.example.com/api/v3",
			configured: []string{"", "project"},
			env:        map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want:       "project",
		},

		// 2. Precedence for github.com: GH_TOKEN before GITHUB_TOKEN
		{
			name: "GH_TOKEN before GITHUB_TOKEN on https://api.github.com",
			host: "https://api.github.com",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "cli",
		},
		{
			name: "GITHUB_TOKEN fallback on https://api.github.com",
			host: "https://api.github.com",
			env:  map[string]string{"GITHUB_TOKEN": "gh"},
			want: "gh",
		},
		{
			name: "GH_TOKEN on empty host defaults to github.com",
			host: "",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "cli",
		},
		{
			name: "GITHUB_TOKEN on empty host defaults to github.com",
			host: "",
			env:  map[string]string{"GITHUB_TOKEN": "gh"},
			want: "gh",
		},
		{
			name: "GH_TOKEN on bare github.com",
			host: "github.com",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "cli",
		},
		{
			name: "GH_TOKEN on bare api.github.com",
			host: "api.github.com",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "cli",
		},

		// 3. Precedence for *.ghe.com
		{
			name: "GH_TOKEN before GITHUB_TOKEN on https://x.ghe.com/api/v3",
			host: "https://x.ghe.com/api/v3",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "cli",
		},
		{
			name: "GITHUB_TOKEN fallback on https://x.ghe.com/api/v3",
			host: "https://x.ghe.com/api/v3",
			env:  map[string]string{"GITHUB_TOKEN": "gh"},
			want: "gh",
		},
		{
			name: "GH_TOKEN on subdomain x.ghe.com",
			host: "x.ghe.com",
			env:  map[string]string{"GH_TOKEN": "cli"},
			want: "cli",
		},

		// 4. Precedence for Enterprise / other hosts
		{
			name: "GH_ENTERPRISE_TOKEN before GITHUB_ENTERPRISE_TOKEN on https://ghe.example.com/api/v3",
			host: "https://ghe.example.com/api/v3",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want: "ghe_cli",
		},
		{
			name: "GITHUB_ENTERPRISE_TOKEN fallback on https://ghe.example.com/api/v3",
			host: "https://ghe.example.com/api/v3",
			env:  map[string]string{"GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want: "ghe_token",
		},
		{
			name: "GH_ENTERPRISE_TOKEN on bare ghe.example.com",
			host: "ghe.example.com",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli"},
			want: "ghe_cli",
		},

		// 5. Host isolation / no cross-leakage
		{
			name: "GH_ENTERPRISE_TOKEN is not sent to https://api.github.com",
			host: "https://api.github.com",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want: "",
		},
		{
			name: "GH_ENTERPRISE_TOKEN is not sent to https://x.ghe.com/api/v3",
			host: "https://x.ghe.com/api/v3",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want: "",
		},
		{
			name: "GH_ENTERPRISE_TOKEN is not sent to empty host",
			host: "",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_token"},
			want: "",
		},
		{
			name: "GH_TOKEN is not sent to https://ghe.example.com/api/v3",
			host: "https://ghe.example.com/api/v3",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "",
		},
		{
			name: "GH_TOKEN is not sent to custom internal host",
			host: "http://git.internal.corp:8080/api/v3",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "",
		},

		// 6. Nothing configured
		{
			name: "nothing configured anywhere for api.github.com",
			host: "https://api.github.com",
			want: "",
		},
		{
			name: "nothing configured anywhere for ghe.example.com",
			host: "https://ghe.example.com/api/v3",
			want: "",
		},
		{
			name: "nothing configured anywhere for empty host",
			host: "",
			want: "",
		},
		{
			name: "invalid url falls back to raw string",
			host: ":/invalid",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe"},
			want: "ghe",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GH_TOKEN", tt.env["GH_TOKEN"])
			t.Setenv("GITHUB_TOKEN", tt.env["GITHUB_TOKEN"])
			t.Setenv("GH_ENTERPRISE_TOKEN", tt.env["GH_ENTERPRISE_TOKEN"])
			t.Setenv("GITHUB_ENTERPRISE_TOKEN", tt.env["GITHUB_ENTERPRISE_TOKEN"])
			if got := github.Token(tt.host, tt.configured...); got != tt.want {
				t.Fatalf("Token(%q, %q) = %q, want %q", tt.host, tt.configured, got, tt.want)
			}
		})
	}
}
