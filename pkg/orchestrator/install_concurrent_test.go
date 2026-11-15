package orchestrator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// TestConcurrentInstallTool_GitHubRelease verifies that two concurrent InstallTool calls
// using the same installer method (github-release) on separate goroutines under go test -race:
// 1. Do not encounter data races.
// 2. Place each tool's binary strictly in its own current directory.
func TestConcurrentInstallTool_GitHubRelease(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	var reachedFirst sync.WaitGroup
	reachedFirst.Add(1)
	var allowFirst sync.WaitGroup
	allowFirst.Add(1)
	var once sync.Once

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v3/repos/ownerA/toolA/releases/latest":
			reachedFirst.Done()
			allowFirst.Wait()
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"id":       1,
				"tag_name": "v1.0.0",
				"name":     "v1.0.0",
				"assets": []map[string]interface{}{
					{
						"id":                   10,
						"name":                 "toolA-bin",
						"size":                 21,
						"browser_download_url": "http://" + r.Host + "/download/toolA-bin",
					},
				},
			})
		case "/api/v3/repos/ownerB/toolB/releases/latest":
			once.Do(func() {
				allowFirst.Done()
			})
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"id":       2,
				"tag_name": "v1.0.0",
				"name":     "v1.0.0",
				"assets": []map[string]interface{}{
					{
						"id":                   20,
						"name":                 "toolB-bin",
						"size":                 21,
						"browser_download_url": "http://" + r.Host + "/download/toolB-bin",
					},
				},
			})
		case "/download/toolA-bin":
			w.Header().Set("Content-Type", "application/octet-stream")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("#!/bin/sh\necho toolA\n"))
		case "/download/toolB-bin":
			w.Header().Set("Content-Type", "application/octet-stream")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("#!/bin/sh\necho toolB\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	instReg := installer.NewRegistry()
	runner := exec.NewMockRunner()
	dl := downloader.NewDownloader(memFS, server.Client())
	ghInst := installer.NewGitHubInstaller(runner, memFS, dl, nil)
	ghInst.BaseURL = server.URL + "/api/v3"
	_ = instReg.Register(ghInst)

	orch := NewOrchestrator(nil, memFS, runner, reg, instReg)
	orch.SetSymlinkFS(memFS)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	toolA := &config.ToolConfig{
		Name:               "toolA",
		Binaries:           testutil.DeclaredBinaries("toolA"),
		InstallationMethod: "github-release",
		InstallParams: map[string]interface{}{
			"repo":         "ownerA/toolA",
			"assetPattern": ".*",
		},
	}
	toolB := &config.ToolConfig{
		Name:               "toolB",
		Binaries:           testutil.DeclaredBinaries("toolB"),
		InstallationMethod: "github-release",
		InstallParams: map[string]interface{}{
			"repo":         "ownerB/toolB",
			"assetPattern": ".*",
		},
	}

	var wg sync.WaitGroup
	var errA, errB error

	wg.Add(1)
	go func() {
		defer wg.Done()
		errA = orch.InstallTool(ctx, toolA, projCfg)
	}()

	reachedFirst.Wait()

	wg.Add(1)
	go func() {
		defer wg.Done()
		errB = orch.InstallTool(ctx, toolB, projCfg)
	}()

	wg.Wait()

	if errA != nil {
		t.Fatalf("InstallTool(toolA) failed: %v", errA)
	}
	if errB != nil {
		t.Fatalf("InstallTool(toolB) failed: %v", errB)
	}

	binAPath := "/home/user/binaries/toolA/current/toolA"
	binBPath := "/home/user/binaries/toolB/current/toolB"

	existsA, err := memFS.Exists(binAPath)
	if err != nil || !existsA {
		t.Errorf("toolA binary missing at %s (exists=%v, err=%v)", binAPath, existsA, err)
	}
	existsB, err := memFS.Exists(binBPath)
	if err != nil || !existsB {
		t.Errorf("toolB binary missing at %s (exists=%v, err=%v)", binBPath, existsB, err)
	}

	misplacedA := "/home/user/binaries/toolB/current/toolA"
	misplacedB := "/home/user/binaries/toolA/current/toolB"

	if exists, _ := memFS.Exists(misplacedA); exists {
		t.Errorf("toolA binary was incorrectly placed in toolB directory: %s", misplacedA)
	}
	if exists, _ := memFS.Exists(misplacedB); exists {
		t.Errorf("toolB binary was incorrectly placed in toolA directory: %s", misplacedB)
	}
}

// TestConcurrentInstallTool_CurlBinary verifies that two concurrent InstallTool calls
// using the same installer method (curl-binary) on separate goroutines under go test -race:
// 1. Do not encounter data races.
// 2. Place each tool's binary strictly in its own current directory.
func TestConcurrentInstallTool_CurlBinary(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/toolA":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("#!/bin/sh\necho toolA\n"))
		case "/toolB":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("#!/bin/sh\necho toolB\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	instReg := installer.NewRegistry()
	runner := exec.NewMockRunner()
	dl := downloader.NewDownloader(memFS, server.Client())
	curlBin := installer.NewCurlBinaryInstaller(runner, memFS, dl, nil)
	_ = instReg.Register(curlBin)

	orch := NewOrchestrator(nil, memFS, runner, reg, instReg)
	orch.SetSymlinkFS(memFS)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	toolA := &config.ToolConfig{
		Name:               "toolA",
		Binaries:           testutil.DeclaredBinaries("toolA-bin"),
		InstallationMethod: "curl-binary",
		InstallParams: map[string]interface{}{
			"url": server.URL + "/toolA",
		},
	}
	toolB := &config.ToolConfig{
		Name:               "toolB",
		Binaries:           testutil.DeclaredBinaries("toolB-bin"),
		InstallationMethod: "curl-binary",
		InstallParams: map[string]interface{}{
			"url": server.URL + "/toolB",
		},
	}

	var start sync.WaitGroup
	start.Add(1)
	var wg sync.WaitGroup
	var errA, errB error

	wg.Add(2)
	go func() {
		defer wg.Done()
		start.Wait()
		errA = orch.InstallTool(ctx, toolA, projCfg)
	}()
	go func() {
		defer wg.Done()
		start.Wait()
		errB = orch.InstallTool(ctx, toolB, projCfg)
	}()
	start.Done()
	wg.Wait()

	if errA != nil {
		t.Fatalf("InstallTool(toolA) failed: %v", errA)
	}
	if errB != nil {
		t.Fatalf("InstallTool(toolB) failed: %v", errB)
	}

	// Verify each tool's binary is placed strictly in its own current directory
	binAPath := "/home/user/binaries/toolA/current/toolA-bin"
	binBPath := "/home/user/binaries/toolB/current/toolB-bin"

	existsA, err := memFS.Exists(binAPath)
	if err != nil || !existsA {
		t.Errorf("toolA binary missing at %s (exists=%v, err=%v)", binAPath, existsA, err)
	}
	existsB, err := memFS.Exists(binBPath)
	if err != nil || !existsB {
		t.Errorf("toolB binary missing at %s (exists=%v, err=%v)", binBPath, existsB, err)
	}

	// Verify no binary bleed across directories
	misplacedA := "/home/user/binaries/toolB/current/toolA-bin"
	misplacedB := "/home/user/binaries/toolA/current/toolB-bin"

	if exists, _ := memFS.Exists(misplacedA); exists {
		t.Errorf("toolA binary was incorrectly placed in toolB directory: %s", misplacedA)
	}
	if exists, _ := memFS.Exists(misplacedB); exists {
		t.Errorf("toolB binary was incorrectly placed in toolA directory: %s", misplacedB)
	}
}
