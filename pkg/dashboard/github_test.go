package dashboard

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// TestReadmeFetchAddressesTheConfiguredGitHubHost proves the project
// configuration's github.host governs the dashboard's README lookup, which is a
// GitHub API request like any other. Without the wiring the dashboard addresses
// api.github.com, which on a GitHub Enterprise instance holds none of the
// repositories the configuration installs from.
func TestReadmeFetchAddressesTheConfiguredGitHubHost(t *testing.T) {
	var gotPath string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		fmt.Fprint(w, "# Enterprise Readme")
	}))
	t.Cleanup(api.Close)

	log := logger.New(logger.Config{Writer: io.Discard})
	projCfg := &config.ProjectConfig{Github: config.HostConfig{Host: api.URL}}
	s := NewServer(log, "", 0, nil, testFS(), "", projCfg, nil, nil)

	readme, err := s.fetchRemoteReadme(context.Background(), "owner/tool")
	if err != nil {
		t.Fatalf("fetchRemoteReadme: %v", err)
	}
	if readme != "# Enterprise Readme" {
		t.Errorf("README = %q, want the one the configured host served", readme)
	}
	if gotPath != "/repos/owner/tool/readme" {
		t.Errorf("the configured host was asked for %q, want /repos/owner/tool/readme", gotPath)
	}
}

// TestReadmeFetchAuthenticatesFromEverySource proves the dashboard resolves the
// GitHub token the way the installers do. Reading GITHUB_TOKEN alone left a user
// who configured github.token, or who exported only GH_TOKEN the way the gh CLI
// spells it, unauthenticated in the dashboard while the CLI worked.
func TestReadmeFetchAuthenticatesFromEverySource(t *testing.T) {
	tests := []struct {
		name         string
		projectToken string
		env          map[string]string
		want         string
	}{
		{
			name:         "github.token before the environment",
			projectToken: "project",
			env:          map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want:         "Bearer project",
		},
		{
			name: "GITHUB_TOKEN before GH_TOKEN",
			env:  map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want: "Bearer gh",
		},
		{
			name: "GH_TOKEN as the last resort",
			env:  map[string]string{"GH_TOKEN": "cli"},
			want: "Bearer cli",
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

			var gotAuth string
			api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth = r.Header.Get("Authorization")
				fmt.Fprint(w, "# Readme")
			}))
			t.Cleanup(api.Close)

			log := logger.New(logger.Config{Writer: io.Discard})
			projCfg := &config.ProjectConfig{Github: config.HostConfig{Host: api.URL, Token: tt.projectToken}}
			s := NewServer(log, "", 0, nil, testFS(), "", projCfg, nil, nil)

			if _, err := s.fetchRemoteReadme(context.Background(), "owner/tool"); err != nil {
				t.Fatalf("fetchRemoteReadme: %v", err)
			}
			if gotAuth != tt.want {
				t.Errorf("Authorization = %q, want %q", gotAuth, tt.want)
			}
		})
	}
}
