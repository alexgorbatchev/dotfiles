package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

	t.Run("CheckUpdate success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "exa",
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.LatestVersion != "latest" {
			t.Errorf("expected version 'latest', got %s", res.LatestVersion)
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
			if strings.Contains(r.URL.Path, "releases/download") {
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
}

func TestCargoGithubReleases(t *testing.T) {
	tarData, err := createTarGzBytes(map[string]string{"mycrate": "binary-content"})
	if err != nil {
		t.Fatalf("failed to create tar: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(tarData)
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	testFsys := fs.NewMemFS()
	testDl := downloader.NewDownloader(testFsys, server.Client())
	testInst := NewCargoInstaller(runner, testFsys, testDl, &SystemContext{OS: "linux", Arch: "amd64"})
	testInst.httpClient = server.Client()
	testInst.BaseURL = server.URL
	testInst.BinDir = "/test/bin"

	tool := &config.ToolConfig{
		Name: "mycrate",
		InstallParams: map[string]interface{}{
			"binarySource": "github-releases",
			"githubRepo":   "owner/mycrate",
		},
	}

	res, err := testInst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("unexpected error installing from github-releases: %v", err)
	}
	if len(res.Binaries) == 0 {
		t.Errorf("expected binaries returned")
	}

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
		_, err := badArchGH.tryGithubReleases(context.Background(), &config.ToolConfig{Name: "crate"}, "crate", "1.0.0")
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
		}, "vcrate", "1.2.3")
		if err != nil {
			t.Errorf("expected tryGithubReleases to succeed with non-v version, got %v", err)
		}
	})

	t.Run("Quickinstall and Github releases OS platform mapping", func(t *testing.T) {
		for _, osName := range []string{"darwin", "windows"} {
			sys := &SystemContext{OS: osName, Arch: "arm64"}
			cInst := NewCargoInstaller(runner, testFsys, testDl, sys)
			_, _ = cInst.tryQuickinstall(context.Background(), &config.ToolConfig{Name: "crate"}, "crate", "1.0.0")
			_, _ = cInst.tryGithubReleases(context.Background(), &config.ToolConfig{
				Name: "crate",
				InstallParams: map[string]interface{}{"githubRepo": "owner/crate"},
			}, "crate", "1.0.0")
		}
	})

	t.Run("Quickinstall and Github releases logging and download error fallback", func(t *testing.T) {
		log := logger.New(logger.Config{Writer: io.Discard})
		errDLFS := fs.NewMemFS()
		errDL := downloader.NewDownloader(errDLFS, nil)
		cInst := NewCargoInstaller(runner, errDLFS, errDL, &SystemContext{OS: "linux", Arch: "amd64"})
		cInst.SetLogger(log)
		cInst.BinDir = "/test/errbin"
		_ = errDLFS.MkdirAll("/test/errbin/bin", 0755)
		_ = errDLFS.WriteFile("/test/errbin/bin/errcrate", []byte("errbin"), 0755)

		// 1. github-releases failure fallback to cargo install with logger set
		runner.Clear()
		_, err := cInst.Install(context.Background(), &config.ToolConfig{
			Name: "errcrate",
			InstallParams: map[string]interface{}{
				"binarySource": "github-releases",
				"githubRepo":   "owner/nonexistent",
			},
		})
		if err != nil {
			t.Fatalf("expected fallback to cargo install, got %v", err)
		}

		// 3. quickinstall with version="latest" fetching crates.io
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
		_, _ = cInst.tryQuickinstall(context.Background(), &config.ToolConfig{Name: "latestcrate"}, "latestcrate", "latest")
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
		}, "patcrate", "1.0.0")
		if err != nil {
			t.Errorf("expected tryGithubReleases to succeed with custom assetPattern, got %v", err)
		}
	})

	t.Run("Github releases version empty", func(t *testing.T) {
		runner.Clear()
		badExtFS := fs.NewMemFS()
		badExtDL := downloader.NewDownloader(badExtFS, nil)
		cInst := NewCargoInstaller(runner, badExtFS, badExtDL, &SystemContext{OS: "linux", Arch: "amd64"})
		cInst.BinDir = "/test/badext"

		// Version empty test
		_, _ = cInst.tryGithubReleases(context.Background(), &config.ToolConfig{
			Name: "vcrate2",
			InstallParams: map[string]interface{}{
				"githubRepo": "owner/vcrate2",
			},
		}, "vcrate2", "")
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
