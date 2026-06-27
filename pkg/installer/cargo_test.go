package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
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
