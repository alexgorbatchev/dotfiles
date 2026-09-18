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
