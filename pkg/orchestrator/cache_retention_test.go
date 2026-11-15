package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestInstalledCacheURLRetention(t *testing.T) {
	project := &config.ProjectConfig{}
	tools := []*config.ToolConfig{
		{Name: "release", InstallationMethod: "github-release", InstallParams: map[string]any{"repo": "acme/release"}},
		{Name: "shared", InstallationMethod: "github-release", InstallParams: map[string]any{"repo": "acme/release"}},
		{Name: "unknown", InstallationMethod: "github-release", InstallParams: map[string]any{"repo": "acme/unknown"}},
		{Name: "direct", InstallationMethod: "curl-tar", InstallParams: map[string]any{"url": "https://example.org/v2.tar.gz"}},
		{Name: "uninstalled", InstallationMethod: "github-release", InstallParams: map[string]any{"repo": "acme/uninstalled"}},
		{Name: "gitea", InstallationMethod: "gitea-release", InstallParams: map[string]any{"repo": "acme/tea", "instanceUrl": "https://forge.example/base"}},
		{Name: "cargo", InstallationMethod: "cargo", InstallParams: map[string]any{"crateName": "crate"}},
		{Name: "cargo-release", InstallationMethod: "cargo", InstallParams: map[string]any{"githubRepo": "acme/crate", "binarySource": "github-releases"}},
		{Name: "package", InstallationMethod: "dmg", InstallParams: map[string]any{"source": map[string]any{"type": "github-release", "repo": "acme/package"}}},
	}
	records := []*registry.ToolInstallationRecord{
		{ToolName: "release", Version: "2", OriginalTag: new("v2")},
		{ToolName: "shared", Version: "v1"},
		{ToolName: "unknown", Version: "latest"},
		{ToolName: "direct", Version: "v1", DownloadURL: new("https://example.org/v1.tar.gz")},
		{ToolName: "gitea", Version: "v2"},
		{ToolName: "cargo", Version: "1.2.3"},
		{ToolName: "cargo-release", Version: "v2"},
		{ToolName: "package", Version: "v2"},
	}
	r := installedCacheURLs(project, tools, records)
	for _, tc := range []struct {
		url  string
		keep bool
	}{
		{"https://github.com/acme/release/releases/download/v0/archive", false},
		{"https://github.com/acme/release/releases/download/v1/archive", true},
		{"https://github.com/ACME/RELEASE/releases/download/2/archive", true},
		{"https://github.com/acme/unknown/releases/download/v99/archive", true},
		{"https://github.com/acme/uninstalled/releases/download/v2/archive", false},
		{"https://example.org/v1.tar.gz", true},
		{"https://example.org/v2.tar.gz", true},
		{"https://forge.example/base/acme/tea/releases/download/v2/archive", true},
		{"https://forge.example/base/acme/tea/releases/download/v1/archive", false},
		{"https://github.com/cargo-bins/cargo-quickinstall/releases/download/crate-1.2.3/archive", true},
		{"https://github.com/cargo-bins/cargo-quickinstall/releases/download/crate-1.2.2/archive", false},
		{"https://github.com/acme/crate/releases/download/v2/archive", true},
		{"https://github.com/acme/package/releases/download/v2/archive", true},
		{"https://other.example/acme/release/releases/download/v2/archive", false},
		{"https://github.com/acme/release/releases/download/v2", false},
		{"https://github.com/acme/release/releases/download/%ZZ/archive", false},
	} {
		if got := r.keep(tc.url); got != tc.keep {
			t.Errorf("keep(%q) = %t, want %t", tc.url, got, tc.keep)
		}
	}
	project.Github.Host = "https://github.enterprise/api/v3"
	r = installedCacheURLs(project, tools, records)
	if !r.keep("https://github.enterprise/acme/release/releases/download/v2/archive") {
		t.Fatal("enterprise release not retained")
	}
	project.Github.Host = "api.github.com"
	r = installedCacheURLs(project, tools, records)
	if !r.keep("https://github.com/acme/release/releases/download/v2/archive") {
		t.Fatal("public API host not mapped to release host")
	}
}

func TestOrchestratorPrunesDownloadCache(t *testing.T) {
	for _, automatic := range []bool{true, false} {
		t.Run(fmt.Sprintf("automatic %t", automatic), func(t *testing.T) {
			ctx := context.Background()
			mem := newMemFS()
			database, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			reg := registry.NewRegistry(database)
			runner := exec.NewMockRunner()
			installers := installer.NewRegistry()
			if err := installers.Register(installer.NewCurlBinaryInstaller(runner, mem, nil, nil)); err != nil {
				t.Fatal(err)
			}
			orch := NewOrchestrator(nil, mem, runner, reg, installers)
			orch.SetSymlinkFS(mem)
			project := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: "/home", TargetDir: "/user-bin", BinariesDir: "/binaries", GeneratedDir: "/generated",
			}}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/failed" {
					w.WriteHeader(http.StatusInternalServerError)
					return
				}
				fmt.Fprint(w, r.URL.Path)
			}))
			defer server.Close()
			tool := &config.ToolConfig{Name: "tool", InstallationMethod: "curl-binary", Binaries: testutil.DeclaredBinaries("tool")}
			ctx = downloader.WithPruning(config.WithForce(ctx, true), automatic)
			for _, version := range []string{"v1", "v2"} {
				tool.Version = &version
				tool.InstallParams = map[string]any{"url": server.URL + "/" + version}
				if err := orch.InstallTool(ctx, tool, project); err != nil {
					t.Fatal(err)
				}
			}
			assertCached := func(url string, want bool) {
				t.Helper()
				names, err := mem.ReadDir("/generated/cache/downloads")
				if err != nil {
					t.Fatal(err)
				}
				found := false
				for _, name := range names {
					if !strings.HasSuffix(name, ".json") {
						continue
					}
					data, err := mem.ReadFile(filepath.Join("/generated/cache/downloads", name))
					if err != nil {
						t.Fatal(err)
					}
					var record struct {
						URL string `json:"url"`
					}
					if err := json.Unmarshal(data, &record); err != nil {
						t.Fatal(err)
					}
					if record.URL == url {
						found = true
					}
				}
				if found != want {
					t.Fatalf("cached %s = %t, want %t", url, found, want)
				}
			}
			assertCached(server.URL+"/v1", !automatic)
			assertCached(server.URL+"/v2", true)
			failedVersion := "v3"
			tool.Version = &failedVersion
			tool.InstallParams["url"] = server.URL + "/failed"
			if err := orch.InstallTool(ctx, tool, project); err == nil {
				t.Fatal("expected failed update")
			}
			assertCached(server.URL+"/v2", true)
			if _, err := orch.ClearDownloadCache(ctx, project); err != nil {
				t.Fatal(err)
			}
			assertCached(server.URL+"/v1", false)
			assertCached(server.URL+"/v2", true)
		})
	}
}
