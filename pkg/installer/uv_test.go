package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestUvInstaller_Properties(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)

	if inst.Name() != "uv" {
		t.Errorf("expected name to be 'uv', got %q", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	inst.SetFS(fsys)
	inst.SetSystemContext(NewDefaultSystemContext())
	inst.SetLogger(logger.New(logger.Config{}))
}

func TestUvInstaller_DryRun(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)

	ctx := config.WithDryRun(context.Background(), true)
	tool := &config.ToolConfig{
		Name:               "ruff",
		InstallationMethod: "uv",
	}

	res, err := inst.Install(ctx, tool)
	if err != nil {
		t.Fatalf("Install dry-run failed: %v", err)
	}
	if len(res.Binaries) != 1 || res.Binaries[0] != "ruff" {
		t.Errorf("expected binaries [ruff], got %v", res.Binaries)
	}
	if len(runner.History) != 0 {
		t.Errorf("expected no commands run during dry-run, got %d", len(runner.History))
	}
}

func TestUvInstaller_SudoRejected(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)

	tool := &config.ToolConfig{
		Name:               "ruff",
		InstallationMethod: "uv",
		Sudo:               true,
	}

	_, err := inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatal("expected error for sudo requirement, got nil")
	}
}

func TestUvInstaller_Install_DefaultParams(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	stagingDir := "/staging"
	inst.BinDir = stagingDir

	// Prepare mock filesystem: target executable and staging symlink
	targetBin := "/home/user/.local/share/uv/tools/ruff/bin/ruff"
	_ = fsys.MkdirAll(filepath.Dir(targetBin), 0755)
	_ = fsys.WriteFile(targetBin, []byte("#!/bin/sh\n"), 0755)
	_ = fsys.MkdirAll(stagingDir, 0755)
	_ = fsys.Symlink(targetBin, filepath.Join(stagingDir, "ruff"))

	// Mock `uv tool list` response
	runner.RegisterFunc("uv", func(c *exec.MockCmd) error {
		if len(c.Args) >= 2 && c.Args[0] == "tool" && c.Args[1] == "list" {
			c.SetOutput([]byte("ruff v0.9.1\n- ruff\n"))
			return nil
		}
		return nil
	})

	tool := &config.ToolConfig{
		Name:               "ruff",
		InstallationMethod: "uv",
	}

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	if len(res.Binaries) != 1 || res.Binaries[0] != "ruff" {
		t.Errorf("expected binaries [ruff], got %v", res.Binaries)
	}
	if res.Version != "0.9.1" {
		t.Errorf("expected version 0.9.1, got %q", res.Version)
	}

	// Verify command executed
	if len(runner.History) == 0 {
		t.Fatal("expected commands to run")
	}
	installCmd := runner.History[0]
	if installCmd.Name != "uv" {
		t.Errorf("expected cmd uv, got %s", installCmd.Name)
	}
	expectedArgs := []string{"tool", "install", "ruff"}
	if !slicesEqual(installCmd.Args, expectedArgs) {
		t.Errorf("expected args %v, got %v", expectedArgs, installCmd.Args)
	}

	// Verify UV_TOOL_BIN_DIR was in environment
	hasEnv := false
	for _, env := range installCmd.Env() {
		if env == "UV_TOOL_BIN_DIR="+stagingDir {
			hasEnv = true
			break
		}
	}
	if !hasEnv {
		t.Errorf("expected UV_TOOL_BIN_DIR=%s in env, got %v", stagingDir, installCmd.Env())
	}
}

func TestUvInstaller_Install_CustomParams(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	stagingDir := "/staging"
	inst.BinDir = stagingDir

	// Prepare mock filesystem: target executables and staging symlinks
	target1 := "/home/user/.local/share/uv/tools/claude-swap/bin/claude-swap"
	target2 := "/home/user/.local/share/uv/tools/claude-swap/bin/cswap"
	_ = fsys.MkdirAll(filepath.Dir(target1), 0755)
	_ = fsys.WriteFile(target1, []byte("#!/bin/sh\n"), 0755)
	_ = fsys.WriteFile(target2, []byte("#!/bin/sh\n"), 0755)
	_ = fsys.MkdirAll(stagingDir, 0755)
	_ = fsys.Symlink(target1, filepath.Join(stagingDir, "claude-swap"))
	_ = fsys.Symlink(target2, filepath.Join(stagingDir, "cswap"))

	runner.RegisterFunc("uv", func(c *exec.MockCmd) error {
		if len(c.Args) >= 2 && c.Args[0] == "tool" && c.Args[1] == "list" {
			c.SetOutput([]byte("claude-swap v0.26.0 (>=0.26.0)\n- claude-swap\n- cswap\n"))
			return nil
		}
		return nil
	})

	tool := &config.ToolConfig{
		Name:               "claude-swap",
		InstallationMethod: "uv",
		Binaries:           []interface{}{map[string]interface{}{"name": "claude-swap"}, map[string]interface{}{"name": "cswap"}},
		InstallParams: map[string]interface{}{
			"package": "claude-swap",
			"version": ">=0.26.0",
			"python":  ">=3.12",
			"with":    []interface{}{"pkgA", "pkgB"},
			"force":   true,
		},
	}

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	if len(res.Binaries) != 2 || res.Binaries[0] != "claude-swap" || res.Binaries[1] != "cswap" {
		t.Errorf("expected binaries [claude-swap, cswap], got %v", res.Binaries)
	}
	if res.Version != "0.26.0" {
		t.Errorf("expected version 0.26.0, got %q", res.Version)
	}

	installCmd := runner.History[0]
	expectedArgs := []string{
		"tool", "install",
		"--python", ">=3.12",
		"--with", "pkgA",
		"--with", "pkgB",
		"--force",
		"claude-swap>=0.26.0",
	}
	if !slicesEqual(installCmd.Args, expectedArgs) {
		t.Errorf("expected args %v, got %v", expectedArgs, installCmd.Args)
	}
}

func TestUvInstaller_Install_ExactVersionPin(t *testing.T) {
	tests := []struct {
		name         string
		version      string
		expectedSpec string
	}{
		{name: "exact version", version: "0.26.0", expectedSpec: "pkg==0.26.0"},
		{name: "with leading v", version: "v0.26.0", expectedSpec: "pkg==0.26.0"},
		{name: "greater equal operator", version: ">=0.26.0", expectedSpec: "pkg>=0.26.0"},
		{name: "compatible operator", version: "~=0.26.0", expectedSpec: "pkg~=0.26.0"},
		{name: "exact operator", version: "==0.26.0", expectedSpec: "pkg==0.26.0"},
		{name: "latest", version: "latest", expectedSpec: "pkg"},
		{name: "empty", version: "", expectedSpec: "pkg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			fsys := fs.NewMemFS()
			inst := NewUvInstaller(runner, fsys, nil)
			stagingDir := "/staging"
			inst.BinDir = stagingDir

			target := "/target/bin/pkg"
			_ = fsys.MkdirAll(filepath.Dir(target), 0755)
			_ = fsys.WriteFile(target, []byte("#!/bin/sh\n"), 0755)
			_ = fsys.MkdirAll(stagingDir, 0755)
			_ = fsys.Symlink(target, filepath.Join(stagingDir, "pkg"))

			tool := &config.ToolConfig{
				Name:               "pkg",
				InstallationMethod: "uv",
				InstallParams: map[string]interface{}{
					"version": tt.version,
				},
			}

			_, err := inst.Install(context.Background(), tool)
			if err != nil {
				t.Fatalf("Install failed: %v", err)
			}

			installCmd := runner.History[0]
			lastArg := installCmd.Args[len(installCmd.Args)-1]
			if lastArg != tt.expectedSpec {
				t.Errorf("expected package spec %q, got %q", tt.expectedSpec, lastArg)
			}
		})
	}
}

func TestUvInstaller_Install_FallbackVersionDetection(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	stagingDir := "/staging"
	inst.BinDir = stagingDir

	target := "/target/bin/pkg"
	_ = fsys.MkdirAll(filepath.Dir(target), 0755)
	_ = fsys.WriteFile(target, []byte("#!/bin/sh\n"), 0755)
	_ = fsys.MkdirAll(stagingDir, 0755)
	_ = fsys.Symlink(target, filepath.Join(stagingDir, "pkg"))

	// uv tool list fails, but install output prints version
	runner.RegisterFunc("uv", func(c *exec.MockCmd) error {
		if len(c.Args) >= 2 && c.Args[0] == "tool" && c.Args[1] == "list" {
			return errors.New("failed to list")
		}
		if len(c.Args) >= 2 && c.Args[0] == "tool" && c.Args[1] == "install" {
			c.SetOutput([]byte("Resolved 1 package in 10ms\nInstalled 1 package in 5ms\n + pkg==1.2.3\n"))
			return nil
		}
		return nil
	})

	tool := &config.ToolConfig{
		Name:               "pkg",
		InstallationMethod: "uv",
	}

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if res.Version != "1.2.3" {
		t.Errorf("expected fallback version 1.2.3, got %q", res.Version)
	}
}

func TestUvInstaller_Install_Failure(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	inst.BinDir = "/staging"

	runner.RegisterFunc("uv", func(c *exec.MockCmd) error {
		return errors.New("network failure")
	})

	tool := &config.ToolConfig{
		Name:               "pkg",
		InstallationMethod: "uv",
	}

	// Failure without logger (lw is nil)
	_, err := inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatal("expected install to fail, got nil")
	}
	if !strings.Contains(err.Error(), "network failure") {
		t.Errorf("expected error to contain 'network failure', got: %v", err)
	}

	// Failure with logger (lw.PrintError should be called)
	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelDefault})
	inst.SetLogger(testLog)

	_, err = inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatal("expected install to fail, got nil")
	}
	if !strings.Contains(logBuf.String(), "| network failure") {
		t.Errorf("expected log to contain '| network failure', got:\n%s", logBuf.String())
	}
}

func TestUvInstaller_Uninstall(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	inst.SetLogger(logger.New(logger.Config{}))

	tool := &config.ToolConfig{
		Name:               "claude-swap",
		InstallationMethod: "uv",
		InstallParams: map[string]interface{}{
			"package": "claude-swap-pkg",
		},
	}

	if err := inst.Uninstall(context.Background(), tool); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}

	if len(runner.History) == 0 {
		t.Fatal("expected commands to run")
	}
	cmd := runner.History[0]
	if cmd.Name != "uv" {
		t.Errorf("expected cmd uv, got %s", cmd.Name)
	}
	expectedArgs := []string{"tool", "uninstall", "claude-swap-pkg"}
	if !slicesEqual(cmd.Args, expectedArgs) {
		t.Errorf("expected args %v, got %v", expectedArgs, cmd.Args)
	}

	// Test uninstall with bracketed extras (e.g. "httpie[jwt]" -> "httpie")
	runner.Clear()
	extrasTool := &config.ToolConfig{
		Name:               "httpie",
		InstallationMethod: "uv",
		InstallParams: map[string]interface{}{
			"package": "httpie[jwt]",
		},
	}
	if err := inst.Uninstall(context.Background(), extrasTool); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}
	if len(runner.History) == 0 {
		t.Fatal("expected commands to run")
	}
	extrasCmd := runner.History[0]
	expectedExtrasArgs := []string{"tool", "uninstall", "httpie"}
	if !slicesEqual(extrasCmd.Args, expectedExtrasArgs) {
		t.Errorf("expected args %v, got %v", expectedExtrasArgs, extrasCmd.Args)
	}

	// Test uninstall failure with logger
	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelDefault})
	inst.SetLogger(testLog)
	runner.Clear()
	runner.RegisterFunc("uv", func(c *exec.MockCmd) error {
		return errors.New("uninstall error")
	})
	if err := inst.Uninstall(context.Background(), tool); err == nil {
		t.Fatal("expected error on uninstall failure, got nil")
	}
	if !strings.Contains(logBuf.String(), "| uninstall error") {
		t.Errorf("expected log to contain '| uninstall error', got:\n%s", logBuf.String())
	}

	// Test uninstall failure without logger (lw is nil)
	inst.SetLogger(nil)
	if err := inst.Uninstall(context.Background(), tool); err == nil {
		t.Fatal("expected error on uninstall failure, got nil")
	}
}

func TestUvInstaller_Install_WithLogger(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	inst.SetLogger(logger.New(logger.Config{}))
	stagingDir := "/staging"
	inst.BinDir = stagingDir

	targetBin := "/home/user/.local/share/uv/tools/ruff/bin/ruff"
	_ = fsys.MkdirAll(filepath.Dir(targetBin), 0755)
	_ = fsys.WriteFile(targetBin, []byte("#!/bin/sh\n"), 0755)
	_ = fsys.MkdirAll(stagingDir, 0755)
	_ = fsys.Symlink(targetBin, filepath.Join(stagingDir, "ruff"))

	tool := &config.ToolConfig{
		Name:               "ruff",
		InstallationMethod: "uv",
	}

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if len(res.Binaries) != 1 || res.Binaries[0] != "ruff" {
		t.Errorf("expected [ruff], got %v", res.Binaries)
	}
}

func TestUvInstaller_Install_PromoteBinariesError(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	inst.BinDir = "/staging"
	// Do not create binary in staging -> PromoteBinaries will fail

	tool := &config.ToolConfig{
		Name:               "ruff",
		InstallationMethod: "uv",
	}

	_, err := inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatal("expected error when staged binary missing, got nil")
	}
}

func TestUvInstaller_CheckUpdate_DefaultClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"info": map[string]interface{}{"version": "1.0.0"},
		})
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	// Do not set httpClient -> exercises client() fallback to http.DefaultClient
	inst.PyPIURL = server.URL

	tool := &config.ToolConfig{
		Name:               "my-pkg",
		InstallationMethod: "uv",
	}
	res, err := inst.CheckUpdate(context.Background(), tool)
	if err != nil {
		t.Fatalf("CheckUpdate failed: %v", err)
	}
	if res.LatestVersion != "1.0.0" {
		t.Errorf("expected 1.0.0, got %s", res.LatestVersion)
	}
}

func TestUvInstaller_CheckUpdate(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/claude-swap/json") {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"info": map[string]interface{}{
					"version": "0.26.1",
					"name":    "claude-swap",
				},
			})
			return
		}
		if strings.HasSuffix(r.URL.Path, "/httpie/json") {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"info": map[string]interface{}{
					"version": "3.2.4",
					"name":    "httpie",
				},
			})
			return
		}
		if strings.HasSuffix(r.URL.Path, "/missing/json") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/server-error/json") {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/no-version/json") {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"info": map[string]interface{}{},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	inst.SetHTTPClient(server.Client())
	inst.PyPIURL = server.URL

	t.Run("successful update check", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name:               "claude-swap",
			InstallationMethod: "uv",
		}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("CheckUpdate failed: %v", err)
		}
		if res.LatestVersion != "0.26.1" {
			t.Errorf("expected latest version 0.26.1, got %q", res.LatestVersion)
		}
	})

	t.Run("package with extras", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name:               "httpie-tool",
			InstallationMethod: "uv",
			InstallParams: map[string]interface{}{
				"package": "httpie[jwt]",
			},
		}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("CheckUpdate failed: %v", err)
		}
		if res.LatestVersion != "3.2.4" {
			t.Errorf("expected latest version 3.2.4, got %q", res.LatestVersion)
		}
	})

	t.Run("package not found 404", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name:               "missing",
			InstallationMethod: "uv",
		}
		_, err := inst.CheckUpdate(context.Background(), tool)
		if err == nil {
			t.Fatal("expected error for 404, got nil")
		}
		if !strings.Contains(err.Error(), "not found on PyPI") {
			t.Errorf("expected error to mention not found on PyPI, got %v", err)
		}
	})

	t.Run("server error 500", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name:               "server-error",
			InstallationMethod: "uv",
		}
		_, err := inst.CheckUpdate(context.Background(), tool)
		if err == nil {
			t.Fatal("expected error for 500, got nil")
		}
	})

	t.Run("empty version in payload", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name:               "no-version",
			InstallationMethod: "uv",
		}
		_, err := inst.CheckUpdate(context.Background(), tool)
		if err == nil {
			t.Fatal("expected error for empty version, got nil")
		}
	})
}

func TestUvInstaller_Install_Force(t *testing.T) {
	tests := []struct {
		name          string
		installParams map[string]interface{}
		ctxForce      bool
		expectedForce bool
	}{
		{
			name:          "neither param nor ctx force",
			installParams: map[string]interface{}{},
			ctxForce:      false,
			expectedForce: false,
		},
		{
			name:          "param force true",
			installParams: map[string]interface{}{"force": true},
			ctxForce:      false,
			expectedForce: true,
		},
		{
			name:          "ctx force true",
			installParams: map[string]interface{}{},
			ctxForce:      true,
			expectedForce: true,
		},
		{
			name:          "both param and ctx force true",
			installParams: map[string]interface{}{"force": true},
			ctxForce:      true,
			expectedForce: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			fsys := fs.NewMemFS()
			inst := NewUvInstaller(runner, fsys, nil)
			stagingDir := "/staging"
			inst.BinDir = stagingDir

			target := "/target/bin/pkg"
			_ = fsys.MkdirAll(filepath.Dir(target), 0755)
			_ = fsys.WriteFile(target, []byte("#!/bin/sh\n"), 0755)
			_ = fsys.MkdirAll(stagingDir, 0755)
			_ = fsys.Symlink(target, filepath.Join(stagingDir, "pkg"))

			tool := &config.ToolConfig{
				Name:               "pkg",
				InstallationMethod: "uv",
				InstallParams:      tt.installParams,
			}

			ctx := context.Background()
			if tt.ctxForce {
				ctx = config.WithForce(ctx, true)
			}

			_, err := inst.Install(ctx, tool)
			if err != nil {
				t.Fatalf("Install failed: %v", err)
			}

			installCmd := runner.History[0]
			hasForce := false
			for _, arg := range installCmd.Args {
				if arg == "--force" {
					hasForce = true
					break
				}
			}
			if hasForce != tt.expectedForce {
				t.Errorf("expected force %v, got %v (args: %v)", tt.expectedForce, hasForce, installCmd.Args)
			}
		})
	}
}

func TestUvInstaller_PackageName_EmptyStringFallback(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)
	stagingDir := "/staging"
	inst.BinDir = stagingDir

	target := "/target/bin/fallback-pkg"
	_ = fsys.MkdirAll(filepath.Dir(target), 0755)
	_ = fsys.WriteFile(target, []byte("#!/bin/sh\n"), 0755)
	_ = fsys.MkdirAll(stagingDir, 0755)
	_ = fsys.Symlink(target, filepath.Join(stagingDir, "fallback-pkg"))

	tool := &config.ToolConfig{
		Name:               "fallback-pkg",
		InstallationMethod: "uv",
		InstallParams: map[string]interface{}{
			"package": "",
		},
	}

	_, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}

	installCmd := runner.History[0]
	lastArg := installCmd.Args[len(installCmd.Args)-1]
	if lastArg != "fallback-pkg" {
		t.Errorf("expected package name 'fallback-pkg', got %q", lastArg)
	}

	// Test uninstall fallback
	runner.Clear()
	if err := inst.Uninstall(context.Background(), tool); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}
	uninstallCmd := runner.History[0]
	if uninstallCmd.Args[len(uninstallCmd.Args)-1] != "fallback-pkg" {
		t.Errorf("expected package name 'fallback-pkg', got %q", uninstallCmd.Args[len(uninstallCmd.Args)-1])
	}
}

func TestUvInstaller_NormalizationAndMetadata(t *testing.T) {
	t.Run("normalizePyPIName strips bracketed extras and normalizes", func(t *testing.T) {
		tests := []struct {
			input string
			want  string
		}{
			{"httpie", "httpie"},
			{"httpie[jwt]", "httpie"},
			{"HTTPie[jwt,socks]", "httpie"},
			{"claude_swap", "claude-swap"},
			{"claude_swap[all]", "claude-swap"},
			{"Claude_Swap[all]", "claude-swap"},
			{"my-tool[dev,test]", "my-tool"},
			{"ruamel.yaml", "ruamel-yaml"},
		}
		for _, tt := range tests {
			if got := normalizePyPIName(tt.input); got != tt.want {
				t.Errorf("normalizePyPIName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		}
	})

	t.Run("parseUvToolListVersion normalizes underscores, hyphens, and dots", func(t *testing.T) {
		listOutput := "claude_swap v0.26.0\n- claude-swap\n- cswap\n"
		v := parseUvToolListVersion(listOutput, "claude-swap")
		if v != "0.26.0" {
			t.Errorf("expected 0.26.0, got %q", v)
		}

		listOutput2 := "my-tool v1.2.3\n- my-tool\n"
		v2 := parseUvToolListVersion(listOutput2, "my_tool")
		if v2 != "1.2.3" {
			t.Errorf("expected 1.2.3, got %q", v2)
		}

		listOutput3 := "my-tool (v1.2.3)\n- my-tool\n"
		v3 := parseUvToolListVersion(listOutput3, "my-tool")
		if v3 != "1.2.3" {
			t.Errorf("expected 1.2.3, got %q", v3)
		}

		listOutput4 := "httpie v3.2.2\n- http\n- https\n"
		v4 := parseUvToolListVersion(listOutput4, "httpie[jwt]")
		if v4 != "3.2.2" {
			t.Errorf("expected 3.2.2, got %q", v4)
		}

		listOutput5 := "ruamel-yaml v0.18.6\n- ruamel.yaml\n"
		v5 := parseUvToolListVersion(listOutput5, "ruamel.yaml")
		if v5 != "0.18.6" {
			t.Errorf("expected 0.18.6, got %q", v5)
		}
	})

	t.Run("parseUvInstallOutputVersion handles trailing metadata and normalization", func(t *testing.T) {
		installOutput := "Resolved 1 package in 12ms\n + claude-swap==0.26.0 (wheel)\n"
		v := parseUvInstallOutputVersion(installOutput, "claude_swap")
		if v != "0.26.0" {
			t.Errorf("expected 0.26.0, got %q", v)
		}

		installOutput2 := "Resolved 1 package in 12ms\n + my_tool==2.0.0 from https://example.com/whl\n"
		v2 := parseUvInstallOutputVersion(installOutput2, "my-tool")
		if v2 != "2.0.0" {
			t.Errorf("expected 2.0.0, got %q", v2)
		}

		installOutput3 := "Resolved 1 package in 12ms\n + httpie==3.2.2\n"
		v3 := parseUvInstallOutputVersion(installOutput3, "httpie[jwt]")
		if v3 != "3.2.2" {
			t.Errorf("expected 3.2.2, got %q", v3)
		}

		installOutput4 := "Resolved 1 package in 12ms\n + httpie==v3.2.2\n"
		v4 := parseUvInstallOutputVersion(installOutput4, "httpie")
		if v4 != "3.2.2" {
			t.Errorf("expected 3.2.2, got %q", v4)
		}
	})
}

func TestUvInstaller_HTTPClientTimeout(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewUvInstaller(runner, fsys, nil)

	client := inst.client()
	if client.Timeout != 30*time.Second {
		t.Errorf("expected default timeout 30s, got %v", client.Timeout)
	}
}

func slicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
