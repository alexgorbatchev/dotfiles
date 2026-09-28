package dashboard

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
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
	s := NewServer(log, "", 0, nil, testFS(), "", projCfg, nil, nil, nil)

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

type redirectingTransport struct {
	targetURL string
}

func (rt *redirectingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	target, err := url.Parse(rt.targetURL)
	if err != nil {
		return nil, err
	}
	cloned.URL.Scheme = target.Scheme
	cloned.URL.Host = target.Host
	return http.DefaultTransport.RoundTrip(cloned)
}

// TestReadmeFetchAuthenticatesFromEverySource proves the dashboard resolves the
// GitHub token the way the installers do following the gh CLI convention:
// 1. Configured github.token wins across all hosts.
// 2. GH_TOKEN, then GITHUB_TOKEN, for default/github.com.
// 3. GH_ENTERPRISE_TOKEN, then GITHUB_ENTERPRISE_TOKEN, for an enterprise host.
// 4. No ambient token leaks across host boundaries.
func TestReadmeFetchAuthenticatesFromEverySource(t *testing.T) {
	tests := []struct {
		name         string
		enterprise   bool
		projectToken string
		env          map[string]string
		want         string
	}{
		{
			name:         "github.token before the environment",
			enterprise:   true,
			projectToken: "project",
			env:          map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GH_TOKEN": "cli"},
			want:         "Bearer project",
		},
		{
			name: "GH_TOKEN before GITHUB_TOKEN on github.com",
			env:  map[string]string{"GH_TOKEN": "cli", "GITHUB_TOKEN": "gh"},
			want: "Bearer cli",
		},
		{
			name: "GITHUB_TOKEN fallback on github.com",
			env:  map[string]string{"GITHUB_TOKEN": "gh"},
			want: "Bearer gh",
		},
		{
			name:       "GH_ENTERPRISE_TOKEN before GITHUB_ENTERPRISE_TOKEN on enterprise host",
			enterprise: true,
			env:        map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli", "GITHUB_ENTERPRISE_TOKEN": "ghe_gh"},
			want:       "Bearer ghe_cli",
		},
		{
			name:       "GITHUB_ENTERPRISE_TOKEN fallback on enterprise host",
			enterprise: true,
			env:        map[string]string{"GITHUB_ENTERPRISE_TOKEN": "ghe_gh"},
			want:       "Bearer ghe_gh",
		},
		{
			name:       "ambient GITHUB_TOKEN is not sent to enterprise host",
			enterprise: true,
			env:        map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want:       "",
		},
		{
			name: "ambient GH_ENTERPRISE_TOKEN is not sent to github.com",
			env:  map[string]string{"GH_ENTERPRISE_TOKEN": "ghe_cli"},
			want: "",
		},
		{
			name: "nothing configured anywhere",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GH_TOKEN", tt.env["GH_TOKEN"])
			t.Setenv("GITHUB_TOKEN", tt.env["GITHUB_TOKEN"])
			t.Setenv("GH_ENTERPRISE_TOKEN", tt.env["GH_ENTERPRISE_TOKEN"])
			t.Setenv("GITHUB_ENTERPRISE_TOKEN", tt.env["GITHUB_ENTERPRISE_TOKEN"])

			var gotAuth string
			api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth = r.Header.Get("Authorization")
				fmt.Fprint(w, "# Readme")
			}))
			t.Cleanup(api.Close)

			log := logger.New(logger.Config{Writer: io.Discard})
			var host string
			if tt.enterprise {
				host = api.URL
			}
			projCfg := &config.ProjectConfig{Github: config.HostConfig{Host: host, Token: tt.projectToken}}
			s := NewServer(log, "", 0, nil, testFS(), "", projCfg, nil, nil, nil)
			s.SetHTTPClient(&http.Client{Transport: &redirectingTransport{targetURL: api.URL}})

			if _, err := s.fetchRemoteReadme(context.Background(), "owner/tool"); err != nil {
				t.Fatalf("fetchRemoteReadme: %v", err)
			}
			if gotAuth != tt.want {
				t.Errorf("Authorization = %q, want %q", gotAuth, tt.want)
			}
		})
	}
}
