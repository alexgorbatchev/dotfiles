package installer

import (
	"archive/zip"
	"bytes"
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

func TestPkgInstaller(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("pkg-payload"))
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)

	if testing.Short() {
		t.Skip("skipping test in short mode.")
	}

	t.Run("Silently skip on non-macOS (Linux)", func(t *testing.T) {
		sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)

		if inst.Name() != "pkg" {
			t.Errorf("expected name to be 'pkg', got %s", inst.Name())
		}

		if !inst.SupportsSudo() {
			t.Error("expected SupportsSudo() to be true")
		}

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error on non-macOS: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected 0 binaries returned on non-macOS, got %d", len(res.Binaries))
		}
	})

	t.Run("Install success on macOS with sudo", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/pkg"

		tool := &config.ToolConfig{
			Name: "mytool",
			Sudo: true,
			InstallParams: map[string]interface{}{
				"url":    server.URL,
				"target": "/Volumes/Mac",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify installer command ran under sudo
		if len(runner.History) == 0 {
			t.Fatal("expected installer command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "sudo" || cmd.Args[0] != "installer" || cmd.Args[2] != "/test/pkg/mytool.pkg" || cmd.Args[4] != "/Volumes/Mac" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Uninstall / Update and details", func(t *testing.T) {
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)

		tool := &config.ToolConfig{Name: "mytool"}
		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.HasUpdate {
			t.Errorf("unexpected: %v, %v", res, err)
		}
	})

	t.Run("Install fails missing URL", func(t *testing.T) {
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error for missing URL, got nil")
		}
	})

	t.Run("Install fails installer command error", func(t *testing.T) {
		runner.Clear()
		runner.Register("installer", nil, errors.New("command error"))

		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/pkg"

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})

	t.Run("Install success with GitHub Release", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/pkg-gh"

		githubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.Path, "/releases/") {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{
					"id": 12345,
					"tag_name": "v1.2.3",
					"name": "v1.2.3 Release",
					"assets": [
						{
							"id": 101,
							"name": "mytool-darwin-arm64.pkg",
							"browser_download_url": "http://` + r.Host + `/download/mytool.pkg"
						}
					]
				}`))
			} else if strings.Contains(r.URL.Path, "/download/") {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("mock-pkg-content"))
			}
		}))
		defer githubServer.Close()

		inst.BaseURL = githubServer.URL

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{
					"type": "github-release",
					"repo": "mytool/mytool",
				},
				"target": "/Volumes/Mac",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected installer command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "installer" || cmd.Args[1] != "/test/pkg-gh/mytool-darwin-arm64.pkg" || cmd.Args[3] != "/Volumes/Mac" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install success from zipped PKG", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/pkg-zip"

		// Create a mock zip containing mytool.pkg
		var zipBuf bytes.Buffer
		zw := zip.NewWriter(&zipBuf)
		f, err := zw.Create("mytool.pkg")
		if err != nil {
			t.Fatalf("failed to create zip file entry: %v", err)
		}
		_, _ = f.Write([]byte("mock-pkg-inside-zip"))
		_ = zw.Close()

		zipServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(zipBuf.Bytes())
		}))
		defer zipServer.Close()

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{
					"type": "url",
					"url":  zipServer.URL + "/mytool-arm64.zip",
				},
				"target": "/Volumes/Mac",
			},
		}

		_, err = inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected installer command to run")
		}
		cmd := runner.History[0]
		if cmd.Name != "installer" || !strings.HasSuffix(cmd.Args[1], ".pkg") || cmd.Args[3] != "/Volumes/Mac" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Install and verify directory pruning of extracted archive", func(t *testing.T) {
		runner.Clear()
		sysCtx := &SystemContext{OS: "darwin", Arch: "arm64"}
		inst := NewPkgInstaller(runner, fsys, dl, sysCtx)
		inst.BinDir = "/test/pkg-pruning"

		// Create a mock zip containing mytool.pkg
		var zipBuf bytes.Buffer
		zw := zip.NewWriter(&zipBuf)
		f, err := zw.Create("mytool.pkg")
		if err != nil {
			t.Fatalf("failed to create zip file entry: %v", err)
		}
		_, _ = f.Write([]byte("mock-pkg-inside-zip"))
		_ = zw.Close()

		zipServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(zipBuf.Bytes())
		}))
		defer zipServer.Close()

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"source": map[string]interface{}{
					"type": "url",
					"url":  zipServer.URL + "/mytool-arm64.zip",
				},
				"target": "/Volumes/Mac",
			},
		}

		_, err = inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify extracted directory has been pruned/removed from fsys
		extractDir := "/test/pkg-pruning/mytool-extracted"
		exists, _ := fsys.Exists(extractDir)
		if exists {
			t.Errorf("expected extracted directory %s to be cleaned up/removed, but it exists", extractDir)
		}

		// Verify download PKG file has been pruned/removed from fsys
		pkgPath := "/test/pkg-pruning/mytool-arm64.zip"
		exists, _ = fsys.Exists(pkgPath)
		if exists {
			t.Errorf("expected downloaded zip %s to be cleaned up/removed, but it exists", pkgPath)
		}
	})
}
