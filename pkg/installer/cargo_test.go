package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestCargoInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewCargoInstaller(runner, fsys, dl, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "cargo" {
		t.Errorf("expected name to be 'cargo', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success with version and root bin directory", func(t *testing.T) {
		runner.Clear()
		ver := "0.10.1"
		tool := &config.ToolConfig{
			Name:    "exa",
			Version: &ver,
			InstallParams: map[string]interface{}{
				"crateName":    "exa",
				"binarySource": "cargo",
			},
		}

		_ = fsys.MkdirAll("/test/bin/bin", 0755)
		_ = fsys.WriteFile("/test/bin/bin/exa", []byte("mock binary"), 0755)

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) == 0 || res.Binaries[0] != "exa" {
			t.Errorf("expected exa binary returned, got %v", res.Binaries)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected cargo command to run")
		}

		cmd := runner.History[0]
		expectedArgs := []string{"install", "--root", "/test/bin", "--version", "0.10.1", "exa"}
		if cmd.Name != "cargo" {
			t.Errorf("expected cargo command, got %s", cmd.Name)
		}
		for i, arg := range expectedArgs {
			if cmd.Args[i] != arg {
				t.Errorf("arg %d: expected %s, got %s", i, arg, cmd.Args[i])
			}
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "exa",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "cargo" || cmd.Args[0] != "uninstall" || cmd.Args[1] != "--root" || cmd.Args[3] != "exa" {
			t.Errorf("unexpected uninstall command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install failure", func(t *testing.T) {
		runner.Clear()
		runner.Register("cargo", nil, errors.New("cargo error"))

		tool := &config.ToolConfig{
			Name: "broken",
			InstallParams: map[string]interface{}{
				"binarySource": "cargo",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing but got nil")
		}
	})

	t.Run("Install success with cargo-quickinstall", func(t *testing.T) {
		runner.Clear()

		tarBytes, err := createTarGzBytes(map[string]string{
			"bin/exa": "mock precompiled quickinstall exa",
		})
		if err != nil {
			t.Fatalf("failed to create tar bytes: %v", err)
		}

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/v1/crates/exa" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"crate": {"max_version": "0.10.1"}}`))
				return
			}
			if r.URL.Path == "/releases/download/exa-0.10.1/exa-0.10.1-x86_64-unknown-linux-gnu.tar.gz" {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(tarBytes)
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		testFsys := fs.NewMemFS()
		testDl := downloader.NewDownloader(testFsys, server.Client())
		testInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "amd64"})
		testInst.httpClient = server.Client()
		testInst.BaseURL = server.URL + "/releases/download"
		testInst.CratesIOURL = server.URL + "/api/v1/crates"
		testInst.BinDir = "/test/bin"

		tool := &config.ToolConfig{
			Name: "exa",
			InstallParams: map[string]interface{}{
				"crateName": "exa",
			},
		}

		res, err := testInst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "exa" {
			t.Errorf("expected exa binary, got %v", res.Binaries)
		}
		if res.Version != "0.10.1" {
			t.Errorf("expected version 0.10.1, got %q", res.Version)
		}

		destPath := "/test/bin/exa"
		exists, err := testFsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected promoted exa binary to exist at %s", destPath)
		}

		data, err := testFsys.ReadFile(destPath)
		if err != nil {
			t.Fatalf("reading promoted exa: %v", err)
		}
		if string(data) != "mock precompiled quickinstall exa" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Install fallback to local compile on quickinstall 404", func(t *testing.T) {
		runner.Clear()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/v1/crates/exa" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"crate": {"max_version": "0.10.1"}}`))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		testFsys := fs.NewMemFS()
		_ = testFsys.MkdirAll("/test/bin/bin", 0755)
		_ = testFsys.WriteFile("/test/bin/bin/exa", []byte("compiled exa"), 0755)

		testDl := downloader.NewDownloader(testFsys, server.Client())
		testInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "amd64"})
		testInst.httpClient = server.Client()
		testInst.BaseURL = server.URL + "/releases/download"
		testInst.CratesIOURL = server.URL + "/api/v1/crates"
		testInst.BinDir = "/test/bin"

		tool := &config.ToolConfig{
			Name: "exa",
			InstallParams: map[string]interface{}{
				"crateName": "exa",
			},
		}

		res, err := testInst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "exa" {
			t.Errorf("expected exa binary, got %v", res.Binaries)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected cargo command to run as fallback")
		}
		cmd := runner.History[0]
		if cmd.Name != "cargo" || cmd.Args[0] != "install" {
			t.Errorf("expected cargo install command, got %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install compile fallback strips v from pinned version", func(t *testing.T) {
		runner.Clear()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		testFsys := fs.NewMemFS()
		_ = testFsys.MkdirAll("/test/bin/bin", 0755)
		_ = testFsys.WriteFile("/test/bin/bin/exa", []byte("compiled exa"), 0755)
		testDl := downloader.NewDownloader(testFsys, server.Client())
		testInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "amd64"})
		testInst.httpClient = server.Client()
		testInst.BaseURL = server.URL + "/releases/download"
		testInst.CratesIOURL = server.URL + "/api/v1/crates"
		testInst.BinDir = "/test/bin"
		pinned := "v1.2.3"
		tool := &config.ToolConfig{
			Name:    "exa",
			Version: &pinned,
			InstallParams: map[string]interface{}{
				"crateName": "exa",
			},
		}

		res, err := testInst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Version != "1.2.3" {
			t.Fatalf("expected version 1.2.3, got %q", res.Version)
		}
		if len(runner.History) != 1 {
			t.Fatalf("expected one cargo command, got %v", runner.History)
		}
		cmd := runner.History[0]
		expectedArgs := []string{"install", "--root", "/test/bin", "--version", "1.2.3", "exa"}
		if cmd.Name != "cargo" || !slices.Equal(cmd.Args, expectedArgs) {
			t.Fatalf("cargo command = %s %v, want cargo %v", cmd.Name, cmd.Args, expectedArgs)
		}
	})
}

// recordingServer is an httptest server that remembers every requested path.
type recordingServer struct {
	*httptest.Server
	mu    sync.Mutex
	paths []string
}

func newRecordingServer(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) *recordingServer {
	t.Helper()
	rec := &recordingServer{}
	rec.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec.mu.Lock()
		rec.paths = append(rec.paths, r.URL.Path)
		rec.mu.Unlock()
		handler(w, r)
	}))
	t.Cleanup(rec.Close)
	return rec
}

func (rec *recordingServer) requested(path string) bool {
	rec.mu.Lock()
	defer rec.mu.Unlock()
	for _, p := range rec.paths {
		if p == path {
			return true
		}
	}
	return false
}

func (rec *recordingServer) requestedContaining(fragment string) bool {
	rec.mu.Lock()
	defer rec.mu.Unlock()
	for _, p := range rec.paths {
		if strings.Contains(p, fragment) {
			return true
		}
	}
	return false
}

// newCargoResolutionServer serves every version source the cargo installer can
// consult: crates.io (1.5.0), a raw Cargo.toml (2.0.0), a custom Cargo.toml
// (3.0.0) and the GitHub latest release (v4.0.0).
func newCargoResolutionServer(t *testing.T) *recordingServer {
	t.Helper()
	return newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/crates/mycrate":
			_, _ = w.Write([]byte(`{"crate":{"max_version":"1.5.0"}}`))
		case "/raw/owner/repo/main/Cargo.toml":
			_, _ = w.Write([]byte("[package]\nname = \"mycrate\"\nversion = \"2.0.0\"\n"))
		case "/custom/Cargo.toml":
			_, _ = w.Write([]byte("[package]\nname = \"mycrate\"\nversion = \"3.0.0\"\n"))
		case "/repos/owner/repo/releases/latest":
			_, _ = w.Write([]byte(`{"tag_name":"v4.0.0","assets":[]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
}

func newCargoResolutionInstaller(server *recordingServer) *CargoInstaller {
	fsys := fs.NewMemFS()
	inst := NewCargoInstaller(exec.NewMockRunner(), fsys, downloader.NewDownloader(fsys, server.Client()), &SystemContext{OS: "linux", Arch: "amd64"})
	inst.httpClient = server.Client()
	inst.CratesIOURL = server.URL + "/api/v1/crates"
	inst.GitHubRawURL = server.URL + "/raw/"
	inst.GitHubAPIURL = server.URL
	return inst
}

// TestCargoResolveVersion pins the v1 versionSource semantics: each explicit
// source consults its own endpoint, and the default follows what the binary
// source can actually download (issue #30).
func TestCargoResolveVersion(t *testing.T) {
	tests := []struct {
		name         string
		binarySource string
		params       map[string]interface{}
		want         cargoVersion
		wantPath     string
		wantErr      string
	}{
		{
			name:         "explicit crates-io",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "crates-io", "githubRepo": "owner/repo"},
			want:         cargoVersion{version: "1.5.0"},
			wantPath:     "/api/v1/crates/mycrate",
		},
		{
			name:         "explicit cargo-toml derives the URL from githubRepo",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "cargo-toml", "githubRepo": "owner/repo"},
			want:         cargoVersion{version: "2.0.0"},
			wantPath:     "/raw/owner/repo/main/Cargo.toml",
		},
		{
			name:         "explicit cargo-toml honours cargoTomlUrl",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "cargo-toml", "githubRepo": "owner/repo"},
			want:         cargoVersion{version: "3.0.0"},
			wantPath:     "/custom/Cargo.toml",
		},
		{
			name:         "cargo-toml without repo or URL is an error",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "cargo-toml"},
			wantErr:      "requires githubRepo or cargoTomlUrl",
		},
		{
			name:         "explicit github-releases resolves the latest tag",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "github-releases", "githubRepo": "owner/repo"},
			want:         cargoVersion{version: "4.0.0", tag: "v4.0.0"},
			wantPath:     "/repos/owner/repo/releases/latest",
		},
		{
			name:         "github-releases without githubRepo is an error",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "github-releases"},
			wantErr:      "githubRepo is required",
		},
		{
			name:         "unknown versionSource is an error",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"versionSource": "npm"},
			wantErr:      `unknown versionSource "npm"`,
		},
		{
			name:         "default for quickinstall is crates-io",
			binarySource: cargoBinarySourceQuickinstall,
			params:       map[string]interface{}{"githubRepo": "owner/repo"},
			want:         cargoVersion{version: "1.5.0"},
			wantPath:     "/api/v1/crates/mycrate",
		},
		{
			name:         "default for github-releases binaries is the release tag",
			binarySource: cargoBinarySourceGitHub,
			params:       map[string]interface{}{"githubRepo": "owner/repo"},
			want:         cargoVersion{version: "4.0.0", tag: "v4.0.0"},
			wantPath:     "/repos/owner/repo/releases/latest",
		},
		{
			name:         "default with cargoTomlUrl is cargo-toml",
			binarySource: cargoBinarySourceGitHub,
			params:       map[string]interface{}{"githubRepo": "owner/repo"},
			want:         cargoVersion{version: "3.0.0"},
			wantPath:     "/custom/Cargo.toml",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newCargoResolutionServer(t)
			inst := newCargoResolutionInstaller(server)
			inst.SetLogger(logger.New(logger.Config{Writer: io.Discard}))
			params := map[string]interface{}{}
			for k, v := range tt.params {
				params[k] = v
			}
			if tt.wantPath == "/custom/Cargo.toml" {
				params["cargoTomlUrl"] = server.URL + "/custom/Cargo.toml"
			}

			got, err := inst.resolveVersion(context.Background(), &config.ToolConfig{Name: "mycrate", InstallParams: params}, "mycrate", tt.binarySource)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolved %+v, want %+v", got, tt.want)
			}
			if !server.requested(tt.wantPath) {
				t.Fatalf("expected request to %s, got %v", tt.wantPath, server.paths)
			}
			if len(server.paths) != 1 {
				t.Fatalf("expected exactly one request, got %v", server.paths)
			}
		})
	}
}

// TestCargoCheckUpdate pins that an update check reports the version an install of
// "latest" would resolve, from the same versionSource, as v1's checkUpdate did for
// crates.io. The version the tool pins does not change what upstream offers.
func TestCargoCheckUpdate(t *testing.T) {
	pinned := "1.0.0"
	tests := []struct {
		name     string
		tool     config.ToolConfig
		want     string
		wantPath string
	}{
		{
			name:     "crates.io by default, with crateName defaulting to the tool name",
			tool:     config.ToolConfig{Name: "mycrate"},
			want:     "1.5.0",
			wantPath: "/api/v1/crates/mycrate",
		},
		{
			name:     "crates.io for a crate named differently from the tool",
			tool:     config.ToolConfig{Name: "mc", InstallParams: map[string]interface{}{"crateName": "mycrate"}},
			want:     "1.5.0",
			wantPath: "/api/v1/crates/mycrate",
		},
		{
			name:     "a pinned version still reports the latest upstream",
			tool:     config.ToolConfig{Name: "mycrate", Version: &pinned},
			want:     "1.5.0",
			wantPath: "/api/v1/crates/mycrate",
		},
		{
			name:     "cargo-toml version source",
			tool:     config.ToolConfig{Name: "mycrate", InstallParams: map[string]interface{}{"versionSource": "cargo-toml", "githubRepo": "owner/repo"}},
			want:     "2.0.0",
			wantPath: "/raw/owner/repo/main/Cargo.toml",
		},
		{
			name:     "github-releases binaries report the release tag without its v",
			tool:     config.ToolConfig{Name: "mycrate", InstallParams: map[string]interface{}{"binarySource": "github-releases", "githubRepo": "owner/repo"}},
			want:     "4.0.0",
			wantPath: "/repos/owner/repo/releases/latest",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newCargoResolutionServer(t)
			inst := newCargoResolutionInstaller(server)
			inst.SetLogger(logger.New(logger.Config{Writer: io.Discard}))

			res, err := inst.CheckUpdate(context.Background(), &tt.tool)
			if err != nil {
				t.Fatalf("CheckUpdate() error = %v", err)
			}
			if res == nil || res.LatestVersion != tt.want {
				t.Fatalf("CheckUpdate() = %+v, want LatestVersion %q", res, tt.want)
			}
			if res.Outdated != nil || res.LocalVersion != "" {
				t.Errorf("CheckUpdate() = %+v; cargo has no local verdict, the versions decide", res)
			}
			if !server.requested(tt.wantPath) || len(server.paths) != 1 {
				t.Fatalf("requests = %v, want exactly one to %s", server.paths, tt.wantPath)
			}
		})
	}
}

// TestCargoCheckUpdateFailures pins that a query which cannot produce a version is a
// failed check naming the tool, never an empty answer (read as "up to date") and never
// ErrUpdateCheckUnsupported (read as "nothing to ask").
func TestCargoCheckUpdateFailures(t *testing.T) {
	tests := []struct {
		name    string
		handler func(w http.ResponseWriter, r *http.Request)
		params  map[string]interface{}
		wantErr string
	}{
		{
			name:    "crates.io server error",
			handler: func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusInternalServerError) },
			wantErr: "crates.io returned status: 500",
		},
		{
			name:    "crate not found",
			handler: func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotFound) },
			wantErr: "crates.io returned status: 404",
		},
		{
			name:    "empty max_version",
			handler: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"crate":{}}`)) },
			wantErr: "empty max_version",
		},
		{
			name:    "malformed response",
			handler: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`not json`)) },
			wantErr: "decoding crates.io response",
		},
		{
			name:    "github-releases source without githubRepo",
			handler: func(w http.ResponseWriter, r *http.Request) { t.Errorf("unexpected request to %s", r.URL.Path) },
			params:  map[string]interface{}{"versionSource": "github-releases"},
			wantErr: "githubRepo is required",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newRecordingServer(t, tt.handler)
			inst := newCargoResolutionInstaller(server)

			res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "mycrate", InstallParams: tt.params})
			if err == nil || res != nil {
				t.Fatalf("CheckUpdate() = %+v, %v; want an error and no result", res, err)
			}
			if errors.Is(err, ErrUpdateCheckUnsupported) {
				t.Fatalf("CheckUpdate() = %v; a failed query is not an unsupported check", err)
			}
			if !strings.Contains(err.Error(), tt.wantErr) || !strings.Contains(err.Error(), "mycrate") {
				t.Fatalf("CheckUpdate() error = %v, want it to name mycrate and contain %q", err, tt.wantErr)
			}
		})
	}
}

// TestCargoCheckUpdateSendsUserAgent pins the header crates.io requires: its data
// access policy refuses requests without a User-Agent (v1 sent cargo.userAgent).
func TestCargoCheckUpdateSendsUserAgent(t *testing.T) {
	server := newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != cargoUserAgent {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_, _ = w.Write([]byte(`{"crate":{"max_version":"1.5.0"}}`))
	})
	inst := newCargoResolutionInstaller(server)

	res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "mycrate"})
	if err != nil || res == nil || res.LatestVersion != "1.5.0" {
		t.Fatalf("CheckUpdate() = %+v, %v; want 1.5.0 fetched with the cargo User-Agent", res, err)
	}
}

func TestParseCargoTomlPackageVersion(t *testing.T) {
	tests := []struct {
		name    string
		toml    string
		want    string
		wantErr string
	}{
		{
			name: "basic string",
			toml: "[package]\nname = \"x\"\nversion = \"1.2.3\"\nedition = \"2021\"\n",
			want: "1.2.3",
		},
		{
			name: "literal string with trailing comment",
			toml: "[package] # metadata\nversion = '1.2.3' # release\n",
			want: "1.2.3",
		},
		{
			name: "package table after another table",
			toml: "[dependencies]\nserde = { version = \"1\" }\nversion = \"9.9.9\"\n\n[package]\nversion = \"0.5.0\"\n",
			want: "0.5.0",
		},
		{
			name:    "workspace inherited version",
			toml:    "[package]\nname = \"x\"\nversion.workspace = true\n",
			wantErr: "inherited from the workspace",
		},
		{
			name:    "workspace inherited inline table",
			toml:    "[package]\nversion = { workspace = true }\n",
			wantErr: "inherited from the workspace",
		},
		{
			name:    "unquoted version",
			toml:    "[package]\nversion = 1.2.3\n",
			wantErr: "is not a string",
		},
		{
			name:    "no package table",
			toml:    "[workspace]\nmembers = [\"a\"]\n",
			wantErr: "no [package] version found",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseCargoTomlPackageVersion([]byte(tt.toml))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want containing %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("version = %q, want %q", got, tt.want)
			}
		})
	}
}

// cargoGithubReleaseTags are the releases newCargoGithubServer publishes, by
// repository. owner/mycrate tags with a "v" and owner/bare without one, as
// ripgrep does; the first tag of each is its latest release.
var cargoGithubReleaseTags = map[string][]string{
	"owner/mycrate": {"v1.2.3", "v0.10.1"},
	"owner/bare":    {"14.1.1"},
}

// newCargoGithubServer serves the latest release of each repository in
// cargoGithubReleaseTags and tarData as every asset of every tag listed. Every other
// request, including a download from a tag the repository does not have, answers 404.
func newCargoGithubServer(t *testing.T, tarData []byte) *recordingServer {
	t.Helper()
	return newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
		for repo, tags := range cargoGithubReleaseTags {
			if r.URL.Path == "/repos/"+repo+"/releases/latest" {
				fmt.Fprintf(w, `{"tag_name":%q,"assets":[]}`, tags[0])
				return
			}
			for _, tag := range tags {
				if strings.HasPrefix(r.URL.Path, "/"+repo+"/releases/download/"+tag+"/") {
					_, _ = w.Write(tarData)
					return
				}
			}
		}
		w.WriteHeader(http.StatusNotFound)
	})
}

func newCargoGithubInstaller(server *recordingServer, runner exec.CommandRunner) (*CargoInstaller, fs.FS) {
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, server.Client())
	dl.RetryDelay = time.Millisecond
	inst := NewCargoInstaller(runner, fsys, dl, &SystemContext{OS: "linux", Arch: "amd64"})
	inst.httpClient = server.Client()
	inst.BaseURL = server.URL
	inst.GitHubAPIURL = server.URL
	inst.BinDir = "/test/bin"
	return inst, fsys
}

// TestCargoGithubReleasesResolvesLatestTag is the regression test for issue #30:
// with no pinned version the installer must ask GitHub for the real latest tag
// instead of downloading from a tag literally named "latest".
func TestCargoGithubReleasesResolvesLatestTag(t *testing.T) {
	tarData, err := createTarGzBytes(map[string]string{"mycrate": "binary-content"})
	if err != nil {
		t.Fatalf("failed to create tar: %v", err)
	}
	server := newCargoGithubServer(t, tarData)
	inst, _ := newCargoGithubInstaller(server, exec.NewMockRunner())

	res, err := inst.Install(context.Background(), &config.ToolConfig{
		Name: "mycrate",
		InstallParams: map[string]interface{}{
			"binarySource": "github-releases",
			"githubRepo":   "owner/mycrate",
		},
	})
	if err != nil {
		t.Fatalf("unexpected error installing from github-releases: %v", err)
	}
	if len(res.Binaries) != 1 || res.Binaries[0] != "mycrate" {
		t.Fatalf("expected mycrate binary, got %v", res.Binaries)
	}
	if res.Version != "1.2.3" {
		t.Fatalf("expected version 1.2.3, got %q", res.Version)
	}
	if !server.requested("/repos/owner/mycrate/releases/latest") {
		t.Fatalf("expected the latest release to be resolved through the API, got %v", server.paths)
	}
	wantDownload := "/owner/mycrate/releases/download/v1.2.3/mycrate-1.2.3-unknown-linux-gnu-x86_64.tar.gz"
	if !server.requested(wantDownload) {
		t.Fatalf("expected download of %s, got %v", wantDownload, server.paths)
	}
	if server.requestedContaining("/download/latest/") {
		t.Fatalf("download must never target a tag named latest: %v", server.paths)
	}
}

// TestCargoGithubReleasesPinnedVersionFindsTag pins that a pinned version, whether
// from .version() or from the version tool update found, downloads from the tag the
// repository really has. A version carries no record of whether the tag has a "v", so
// both spellings are tried against the download URL itself. The GitHub API is never
// asked: release downloads are not rate limited and the API is.
func TestCargoGithubReleasesPinnedVersionFindsTag(t *testing.T) {
	tests := []struct {
		name        string
		repo        string
		pinned      string
		wantVersion string
		wantPaths   []string
	}{
		{
			name:        "a v-prefixed tag is tried first",
			repo:        "owner/mycrate",
			pinned:      "0.10.1",
			wantVersion: "0.10.1",
			wantPaths:   []string{"/owner/mycrate/releases/download/v0.10.1/mycrate-0.10.1-unknown-linux-gnu-x86_64.tar.gz"},
		},
		{
			name:        "a pinned version written with its v",
			repo:        "owner/mycrate",
			pinned:      "v0.10.1",
			wantVersion: "0.10.1",
			wantPaths:   []string{"/owner/mycrate/releases/download/v0.10.1/mycrate-0.10.1-unknown-linux-gnu-x86_64.tar.gz"},
		},
		{
			name:        "a tag without a v is tried after the v spelling is not found",
			repo:        "owner/bare",
			pinned:      "14.1.1",
			wantVersion: "14.1.1",
			wantPaths: []string{
				"/owner/bare/releases/download/v14.1.1/mycrate-14.1.1-unknown-linux-gnu-x86_64.tar.gz",
				"/owner/bare/releases/download/14.1.1/mycrate-14.1.1-unknown-linux-gnu-x86_64.tar.gz",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tarData, err := createTarGzBytes(map[string]string{"mycrate": "binary-content"})
			if err != nil {
				t.Fatalf("failed to create tar: %v", err)
			}
			server := newCargoGithubServer(t, tarData)
			runner := exec.NewMockRunner()
			inst, _ := newCargoGithubInstaller(server, runner)

			pinned := tt.pinned
			res, err := inst.Install(context.Background(), &config.ToolConfig{
				Name:    "mycrate",
				Version: &pinned,
				InstallParams: map[string]interface{}{
					"binarySource": "github-releases",
					"githubRepo":   tt.repo,
				},
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(runner.History) != 0 {
				t.Fatalf("expected the prebuilt download, not a cargo fallback: %v", runner.History)
			}
			if res.Version != tt.wantVersion {
				t.Fatalf("installed version %q, want %q", res.Version, tt.wantVersion)
			}
			if !slices.Equal(server.paths, tt.wantPaths) {
				t.Fatalf("requests = %v, want exactly %v", server.paths, tt.wantPaths)
			}
			if server.requestedContaining("/repos/") {
				t.Fatalf("a pinned version must not ask the GitHub API: %v", server.paths)
			}
		})
	}
}

// TestCargoGithubReleasesPinnedTagFailures pins that a pinned version missing under
// both spellings is an error naming both tags, and that a download failing for any
// reason other than 404 is reported rather than retried under the other spelling.
func TestCargoGithubReleasesPinnedTagFailures(t *testing.T) {
	const asset = "mycrate-9.9.9-unknown-linux-gnu-x86_64.tar.gz"
	tests := []struct {
		name      string
		status    int
		wantErr   []string
		wantPaths []string
	}{
		{
			name:    "no release under either spelling",
			status:  http.StatusNotFound,
			wantErr: []string{"not found in owner/mycrate under tag v9.9.9 or 9.9.9", "status 404"},
			wantPaths: []string{
				"/owner/mycrate/releases/download/v9.9.9/" + asset,
				"/owner/mycrate/releases/download/9.9.9/" + asset,
			},
		},
		{
			name:      "server error on the first spelling",
			status:    http.StatusInternalServerError,
			wantErr:   []string{"github release: downloading archive", "status 500"},
			wantPaths: []string{"/owner/mycrate/releases/download/v9.9.9/" + asset},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tt.status) })
			inst, _ := newCargoGithubInstaller(server, exec.NewMockRunner())

			_, err := inst.tryGithubReleases(context.Background(), &config.ToolConfig{
				Name:          "mycrate",
				InstallParams: map[string]interface{}{"githubRepo": "owner/mycrate"},
			}, "mycrate", cargoVersion{version: "9.9.9"})
			if err == nil {
				t.Fatal("expected an error for a release that cannot be downloaded")
			}
			for _, want := range tt.wantErr {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error = %v, want it to contain %q", err, want)
				}
			}
			if !slices.Equal(server.paths, tt.wantPaths) {
				t.Fatalf("requests = %v, want exactly %v", server.paths, tt.wantPaths)
			}
		})
	}
}

func TestCargoGithubReleases(t *testing.T) {
	tarData, err := createTarGzBytes(map[string]string{"mycrate": "binary-content"})
	if err != nil {
		t.Fatalf("failed to create tar: %v", err)
	}
	server := newCargoGithubServer(t, tarData)
	runner := exec.NewMockRunner()
	testInst, testFsys := newCargoGithubInstaller(server, runner)
	testDl := testInst.dl

	t.Run("Github releases missing repo error fallback", func(t *testing.T) {
		runner.Clear()
		toolNoRepo := &config.ToolConfig{
			Name: "mycrate",
			InstallParams: map[string]interface{}{
				"binarySource": "github-releases",
			},
		}
		_ = testFsys.MkdirAll("/test/bin/bin", 0755)
		_ = testFsys.WriteFile("/test/bin/bin/mycrate", []byte("bin"), 0755)

		_, err := testInst.Install(context.Background(), toolNoRepo)
		if err != nil {
			t.Fatalf("expected fallback to cargo install on missing githubRepo, got %v", err)
		}
		if len(runner.History) == 0 || runner.History[0].Name != "cargo" {
			t.Fatalf("expected cargo install fallback, got %v", runner.History)
		}
	})

	t.Run("Github releases version resolution failure falls back to cargo install", func(t *testing.T) {
		runner.Clear()
		_ = testFsys.MkdirAll("/test/bin/bin", 0755)
		_ = testFsys.WriteFile("/test/bin/bin/mycrate", []byte("bin"), 0755)

		_, err := testInst.Install(context.Background(), &config.ToolConfig{
			Name: "mycrate",
			InstallParams: map[string]interface{}{
				"binarySource": "github-releases",
				"githubRepo":   "owner/unknown",
			},
		})
		if err != nil {
			t.Fatalf("expected fallback to cargo install when the release lookup fails, got %v", err)
		}
		if len(runner.History) == 0 || runner.History[0].Name != "cargo" {
			t.Fatalf("expected cargo install fallback, got %v", runner.History)
		}
	})

	t.Run("Quickinstall crates.io 404 error fallback", func(t *testing.T) {
		runner.Clear()
		errServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer errServer.Close()

		qiInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "amd64"})
		qiInst.CratesIOURL = errServer.URL
		qiInst.httpClient = errServer.Client()
		qiInst.BinDir = "/test/bin"

		qiTool := &config.ToolConfig{
			Name: "badcrate",
			InstallParams: map[string]interface{}{
				"binarySource": "cargo-quickinstall",
			},
		}
		_ = testFsys.MkdirAll("/test/bin/bin", 0755)
		_ = testFsys.WriteFile("/test/bin/bin/badcrate", []byte("badcrate binary"), 0755)

		_, err := qiInst.Install(context.Background(), qiTool)
		if err != nil {
			t.Fatalf("expected fallback to cargo install when crates.io returns 404, got %v", err)
		}
	})

	t.Run("Quickinstall unsupported OS and Arch error", func(t *testing.T) {
		badOSInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "unknownos", Arch: "amd64"})
		_, err := badOSInst.tryQuickinstall(context.Background(), &config.ToolConfig{Name: "crate"}, "crate", "1.0.0")
		if err == nil {
			t.Errorf("expected error on unsupported OS")
		}

		badArchInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "unknownarch"})
		_, err = badArchInst.tryQuickinstall(context.Background(), &config.ToolConfig{Name: "crate"}, "crate", "1.0.0")
		if err == nil {
			t.Errorf("expected error on unsupported Arch")
		}
	})

	t.Run("Github releases unsupported Arch and non-v version prefix", func(t *testing.T) {
		badArchGH := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "unknownarch"})
		_, err := badArchGH.tryGithubReleases(context.Background(), &config.ToolConfig{
			Name:          "crate",
			InstallParams: map[string]interface{}{"githubRepo": "owner/crate"},
		}, "crate", cargoVersion{version: "1.0.0"})
		if err == nil {
			t.Errorf("expected error on unsupported Arch for gh releases")
		}

		// Non-v version prefix formatting check
		tarBytes, _ := createTarGzBytes(map[string]string{"vcrate": "bin"})
		vServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.Contains(r.URL.Path, "/v1.2.3/") {
				t.Errorf("expected tag v1.2.3 in URL path, got %s", r.URL.Path)
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(tarBytes)
		}))
		defer vServer.Close()

		vInst := NewCargoInstaller(runner, testFsys, downloader.NewDownloader(testFsys, vServer.Client()), &SystemContext{OS: "linux", Arch: "amd64"})
		vInst.httpClient = vServer.Client()
		vInst.BaseURL = vServer.URL
		vInst.BinDir = "/test/vbin"

		_, err = vInst.tryGithubReleases(context.Background(), &config.ToolConfig{
			Name: "vcrate",
			InstallParams: map[string]interface{}{
				"githubRepo": "owner/vcrate",
			},
		}, "vcrate", cargoVersion{version: "1.2.3"})
		if err != nil {
			t.Errorf("expected tryGithubReleases to succeed with non-v version, got %v", err)
		}
	})

	t.Run("Quickinstall and Github releases OS platform mapping", func(t *testing.T) {
		for _, osName := range []string{"darwin", "windows"} {
			sys := &SystemContext{OS: osName, Arch: "arm64"}
			cInst := NewCargoInstaller(runner, testFsys, testDl, sys)
			// Downloads go to the local server, which has no owner/crate release.
			cInst.BaseURL = server.URL
			_, _ = cInst.tryQuickinstall(context.Background(), &config.ToolConfig{Name: "crate"}, "crate", "1.0.0")
			_, _ = cInst.tryGithubReleases(context.Background(), &config.ToolConfig{
				Name:          "crate",
				InstallParams: map[string]interface{}{"githubRepo": "owner/crate"},
			}, "crate", cargoVersion{version: "1.0.0"})
		}
	})

	t.Run("Quickinstall and Github releases logging and download error fallback", func(t *testing.T) {
		log := logger.New(logger.Config{Writer: io.Discard})
		errDLFS := fs.NewMemFS()
		errDL := downloader.NewDownloader(errDLFS, nil)
		errDL.RetryDelay = time.Millisecond
		cInst := NewCargoInstaller(runner, errDLFS, errDL, &SystemContext{OS: "linux", Arch: "amd64"})
		// owner/nonexistent has no releases, so both tag spellings fail to download.
		missingServer := newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotFound) })
		cInst.BaseURL = missingServer.URL
		cInst.SetLogger(log)
		cInst.BinDir = "/test/errbin"
		_ = errDLFS.MkdirAll("/test/errbin/bin", 0755)
		_ = errDLFS.WriteFile("/test/errbin/bin/errcrate", []byte("errbin"), 0755)

		// 1. github-releases failure fallback to cargo install with logger set
		runner.Clear()
		pinned := "1.0.0"
		_, err := cInst.Install(context.Background(), &config.ToolConfig{
			Name:    "errcrate",
			Version: &pinned,
			InstallParams: map[string]interface{}{
				"binarySource": "github-releases",
				"githubRepo":   "owner/nonexistent",
			},
		})
		if err != nil {
			t.Fatalf("expected fallback to cargo install, got %v", err)
		}

		// 2. crates-io resolution through the injected HTTP client
		cratesIOServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.Path, "/api/v1/crates/latestcrate") {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"crate":{"max_version":"2.5.0"}}`))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer cratesIOServer.Close()

		cInst.CratesIOURL = cratesIOServer.URL + "/api/v1/crates"
		cInst.httpClient = cratesIOServer.Client()
		ver, err := cInst.resolveVersion(context.Background(), &config.ToolConfig{Name: "latestcrate"}, "latestcrate", cargoBinarySourceQuickinstall)
		if err != nil || ver.version != "2.5.0" {
			t.Fatalf("expected crates.io to resolve 2.5.0, got %+v, %v", ver, err)
		}
	})

	t.Run("Github releases custom assetPattern", func(t *testing.T) {
		tarBytes, _ := createTarGzBytes(map[string]string{"patcrate": "bin"})
		patServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.Contains(r.URL.Path, "custom-patcrate-1.0.0") {
				t.Errorf("expected custom asset pattern in URL path, got %s", r.URL.Path)
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(tarBytes)
		}))
		defer patServer.Close()

		patInst := NewCargoInstaller(runner, testFsys, downloader.NewDownloader(testFsys, patServer.Client()), &SystemContext{OS: "linux", Arch: "amd64"})
		patInst.httpClient = patServer.Client()
		patInst.BaseURL = patServer.URL
		patInst.BinDir = "/test/patbin"

		_, err := patInst.tryGithubReleases(context.Background(), &config.ToolConfig{
			Name: "patcrate",
			InstallParams: map[string]interface{}{
				"githubRepo":   "owner/patcrate",
				"assetPattern": "custom-{crateName}-{version}.tar.gz",
			},
		}, "patcrate", cargoVersion{version: "v1.0.0", tag: "v1.0.0"})
		if err != nil {
			t.Errorf("expected tryGithubReleases to succeed with custom assetPattern, got %v", err)
		}
	})
}

func createTarGzBytes(files map[string]string) ([]byte, error) {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	for name, content := range files {
		hdr := &tar.Header{
			Name: name,
			Mode: 0755,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return nil, err
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			return nil, err
		}
	}

	_ = tw.Close()
	_ = gw.Close()
	return buf.Bytes(), nil
}
