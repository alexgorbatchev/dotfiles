package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestOrchestratorSettersAndHelpers(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})

	instReg := installer.NewRegistry()
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}
	_ = projCfg.Paths.HomeDir

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// SetLogger and SetConfigFilePath
	orch.SetLogger(log)
	orch.SetConfigFilePath("/home/test/dotfiles/dotfiles.config.ts")

	if orch.getConfigFilePath() != "/home/test/dotfiles/dotfiles.config.ts" {
		t.Errorf("getConfigFilePath mismatch: %q", orch.getConfigFilePath())
	}

	// shouldOverwrite helper
	ctxOverwrite := config.WithOverwrite(ctx, true)
	if !shouldOverwrite(ctxOverwrite) {
		t.Errorf("shouldOverwrite(ctxOverwrite) = false, want true")
	}

	ctxNoOverwrite := config.WithOverwrite(ctx, false)
	if shouldOverwrite(ctxNoOverwrite) {
		t.Errorf("shouldOverwrite(ctxNoOverwrite) = true, want false")
	}

	// getStringParam
	params := map[string]interface{}{
		"valid":   "hello",
		"invalid": 12345,
	}
	if got := getStringParam(params, "valid", "def"); got != "hello" {
		t.Errorf("getStringParam(valid) = %q, want 'hello'", got)
	}
	if got := getStringParam(params, "invalid", "def"); got != "def" {
		t.Errorf("getStringParam(invalid) = %q, want 'def'", got)
	}
	if got := getStringParam(params, "missing", "def"); got != "def" {
		t.Errorf("getStringParam(missing) = %q, want 'def'", got)
	}
	if got := getStringParam(nil, "any", "def"); got != "def" {
		t.Errorf("getStringParam(nil) = %q, want 'def'", got)
	}
}

func TestCleanupStaleArtifactsAndCopies(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)
	orch.SetLogger(log)

	tool := &config.ToolConfig{
		Name: "bat",
		Copies: []config.CopyConfig{
			{Source: "/src/c1", Target: "/home/test/.config/c1"},
		},
		Symlinks: []config.SymlinkConfig{
			{Source: "/src/s1", Target: "/home/test/.bin/s1"},
		},
	}

	// 1. CleanupStaleCopies
	err = orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleCopies failed: %v", err)
	}

	// 2. CleanupStaleArtifacts
	err = orch.CleanupStaleArtifacts(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleArtifacts failed: %v", err)
	}
}

func TestLineLogWriter(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Writer: &logBuf})

	lw := logger.NewLineWriter(log, "[prefix]")
	_, err := lw.Write([]byte("message line 1\nmessage line 2\nunfinished line"))
	if err != nil {
		t.Fatalf("lineLogWriter Write failed: %v", err)
	}
	lw.Flush()

	out := logBuf.String()
	if !strings.Contains(out, "message line 1") || !strings.Contains(out, "unfinished line") {
		t.Errorf("expected lineLogWriter to flush lines, got %q", out)
	}
}

func TestShouldSkipInstallationAndHealth(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	ver := "1.0.0"
	tool := &config.ToolConfig{
		Name:               "ripgrep",
		Version:            &ver,
		InstallationMethod: "github-release",
		Binaries:           []interface{}{"rg"},
	}

	// 1. Not installed -> shouldSkip = false
	skip, err := orch.shouldSkipInstallation(ctx, tool, projCfg)
	if err != nil || skip {
		t.Errorf("expected skip=false when not installed, got skip=%v, err=%v", skip, err)
	}

	// 2. Record installation on disk & DB
	_ = memFS.MkdirAll("/home/test/.binaries/ripgrep/current", 0755)
	_ = memFS.WriteFile("/home/test/.binaries/ripgrep/current/rg", []byte("bin"), 0755)
	_ = memFS.MkdirAll("/opt/rg", 0755)
	_ = memFS.WriteFile("/opt/rg/rg", []byte("bin"), 0755)

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "ripgrep",
			Version:     "1.0.0",
			InstallPath: "/opt/rg/rg",
			Timestamp:   "now",
			InstalledAt: 1000,
			BinaryPaths: `["/opt/rg/rg"]`,
		})
	})

	// 3. Healthy & matching version -> shouldSkip = true
	skip, err = orch.shouldSkipInstallation(ctx, tool, projCfg)
	if err != nil || !skip {
		t.Errorf("expected skip=true for healthy matching install, got skip=%v, err=%v", skip, err)
	}

	// 4. Version mismatch -> shouldSkip = false
	verNew := "2.0.0"
	toolNew := *tool
	toolNew.Version = &verNew
	skip, err = orch.shouldSkipInstallation(ctx, &toolNew, projCfg)
	if err != nil || skip {
		t.Errorf("expected skip=false for version mismatch, got skip=%v, err=%v", skip, err)
	}

	// 5. Overwrite enabled -> shouldSkip = false
	ctxOverwrite := config.WithOverwrite(ctx, true)
	skip, err = orch.shouldSkipInstallation(ctxOverwrite, tool, projCfg)
	if err != nil || skip {
		t.Errorf("expected skip=false when overwrite enabled, got skip=%v, err=%v", skip, err)
	}
}

func TestGetTargetVersion(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	orch := NewOrchestrator(logger.New(logger.Config{Writer: io.Discard}), memFS, runner, nil, nil)

	ver1 := "v1.2.3"
	verConstraint := "^1.0.0"
	verLatest := "latest"

	// 1. Exact top level version
	t1 := &config.ToolConfig{Version: &ver1}
	if got := orch.getTargetVersion(t1); got != "v1.2.3" {
		t.Errorf("getTargetVersion(v1.2.3) = %q, want 'v1.2.3'", got)
	}

	// 2. Semver constraint -> returns empty
	t2 := &config.ToolConfig{Version: &verConstraint}
	if got := orch.getTargetVersion(t2); got != "" {
		t.Errorf("getTargetVersion(^1.0.0) = %q, want empty", got)
	}

	// 3. Latest -> returns empty
	t3 := &config.ToolConfig{Version: &verLatest}
	if got := orch.getTargetVersion(t3); got != "" {
		t.Errorf("getTargetVersion(latest) = %q, want empty", got)
	}

	// 4. Apt/Dnf version from InstallParams
	t4 := &config.ToolConfig{
		InstallationMethod: "apt",
		InstallParams: map[string]interface{}{
			"version": "v2.3.4",
		},
	}
	if got := orch.getTargetVersion(t4); got != "v2.3.4" {
		t.Errorf("getTargetVersion(apt v2.3.4) = %q, want 'v2.3.4'", got)
	}
}

func TestGenerateCompletionsForTool(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// Create tool completion file on disk
	_ = memFS.MkdirAll("/home/test/dotfiles/completions", 0755)
	_ = memFS.WriteFile("/home/test/dotfiles/completions/_rg", []byte("#compdef rg\n_rg() {}"), 0644)

	tool := &config.ToolConfig{
		Name:     "ripgrep",
		Binaries: []interface{}{"rg"},
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: "/home/test/dotfiles/completions/_rg",
			},
			Bash: &config.ShellTypeConfig{
				Completions: "/home/test/dotfiles/completions/_rg",
			},
		},
	}

	err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed: %v", err)
	}

	data, err := memFS.ReadFile("/home/test/.generated/shell-scripts/zsh/completions/_rg")
	if err != nil || !strings.Contains(string(data), "#compdef rg") {
		t.Errorf("expected completion file written, got data %q, err=%v", string(data), err)
	}
}

func TestCleanupStaleArtifactsWithStaleFiles(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// Create stale copy file and stale symlink on disk & record in DB
	_ = memFS.MkdirAll("/home/test/.config", 0755)
	_ = memFS.WriteFile("/home/test/.config/stale.conf", []byte("stale"), 0644)

	_ = memFS.MkdirAll("/home/test/.bin", 0755)
	_ = memFS.Symlink("/opt/stale/bin", "/home/test/.bin/stale_sym")

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "old-tool",
			OperationType: "copy",
			FilePath:      "/home/test/.config/stale.conf",
			FileType:      "copy",
			CreatedAt:     1000,
			OperationID:   "op-stale-copy",
		})
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "old-tool",
			OperationType: "symlink",
			FilePath:      "/home/test/.bin/stale_sym",
			FileType:      "symlink",
			CreatedAt:     1001,
			OperationID:   "op-stale-sym",
		})
	})

	activeTool := &config.ToolConfig{
		Name: "active-tool",
	}

	err = orch.CleanupStaleArtifacts(ctx, []*config.ToolConfig{activeTool}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleArtifacts failed: %v", err)
	}

	// Verify stale copy and symlink were removed from disk
	existsCopy, _ := memFS.Exists("/home/test/.config/stale.conf")
	if existsCopy {
		t.Errorf("expected stale copy file to be removed")
	}

	existsSym, _ := memFS.Exists("/home/test/.bin/stale_sym")
	if existsSym {
		t.Errorf("expected stale symlink to be removed")
	}
}

func TestAutoInstallAndCliCommandHelpers(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	orch := NewOrchestrator(logger.New(logger.Config{Writer: io.Discard}), memFS, runner, nil, nil)

	// isAutoInstall
	if isAutoInstall(nil) {
		t.Error("expected false for nil tool in isAutoInstall")
	}
	tAuto := &config.ToolConfig{
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}
	if !isAutoInstall(tAuto) {
		t.Error("expected true for auto: true in InstallParams")
	}

	tAutoStr := &config.ToolConfig{
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"auto": "true",
		},
	}
	if !isAutoInstall(tAutoStr) {
		t.Error("expected true for auto: 'true' in InstallParams")
	}

	// getCliCommand with env var override
	t.Setenv("DOTFILES_CLI_COMMAND", "dotfiles-custom")
	if got := orch.getCliCommand(); got != "dotfiles-custom" {
		t.Errorf("getCliCommand with env override = %q, want 'dotfiles-custom'", got)
	}
}

func TestGenerateToolFilteringAndCopies(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. Disabled tool
	tDisabled := &config.ToolConfig{
		Name:     "dis-tool",
		Disabled: true,
	}
	err = orch.GenerateTool(ctx, tDisabled, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool(disabled) failed: %v", err)
	}

	// 2. Hostname mismatch
	tHost := &config.ToolConfig{
		Name:     "host-tool",
		Hostname: "nonexistent-hostname-12345",
	}
	err = orch.GenerateTool(ctx, tHost, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool(hostname mismatch) failed: %v", err)
	}

	// 3. Tool with Symlink
	_ = memFS.MkdirAll("/home/test/dotfiles/src", 0755)
	_ = memFS.WriteFile("/home/test/dotfiles/src/sym.txt", []byte("sym content"), 0644)

	tSym := &config.ToolConfig{
		Name:           "sym-tool",
		ConfigFilePath: "/home/test/dotfiles/tools/sym.tool.ts",
		Binaries:       []interface{}{"csbin"},
		Symlinks: []config.SymlinkConfig{
			{Source: "/home/test/dotfiles/src/sym.txt", Target: "/home/test/.config/sym.txt"},
		},
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases: map[string]string{"cs": "csbin"},
			},
		},
	}

	err = orch.GenerateTool(ctx, tSym, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool(sym) failed: %v", err)
	}
}

func TestInstallToolErrorBranches(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. Nil projCfg
	err = orch.InstallTool(ctx, &config.ToolConfig{Name: "t"}, nil)
	if err == nil || !strings.Contains(err.Error(), "project configuration is nil") {
		t.Errorf("expected project configuration is nil error, got %v", err)
	}

	// 2. Missing installation method with binaries
	tMissingMethod := &config.ToolConfig{
		Name:     "t-missing",
		Binaries: []interface{}{"bin"},
	}
	err = orch.InstallTool(ctx, tMissingMethod, projCfg)
	if err == nil || !strings.Contains(err.Error(), "installation method not specified") {
		t.Errorf("expected installation method not specified error, got %v", err)
	}

	// 3. Unknown installation method
	tUnknownMethod := &config.ToolConfig{
		Name:               "t-unknown",
		InstallationMethod: "unknown-method-12345",
	}
	err = orch.InstallTool(ctx, tUnknownMethod, projCfg)
	if err == nil || !strings.Contains(err.Error(), "getting installer") {
		t.Errorf("expected getting installer error, got %v", err)
	}

	// 4. Shell-only tool without installation method and no binaries -> calls GenerateTool
	tShellOnly := &config.ToolConfig{
		Name: "t-shell",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases: map[string]string{"sh": "echo"},
			},
		},
	}
	err = orch.InstallTool(ctx, tShellOnly, projCfg)
	if err != nil {
		t.Fatalf("shell-only tool InstallTool failed: %v", err)
	}
}

func TestRemoveAllAndHealthCheckEdgeCases(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. removeAll non-existent
	err = removeAll(memFS, "/nonexistent/path")
	if err != nil {
		t.Errorf("removeAll non-existent returned error: %v", err)
	}

	// 2. removeAll existing
	_ = memFS.MkdirAll("/dir-to-rm", 0755)
	_ = memFS.WriteFile("/dir-to-rm/f.txt", []byte("a"), 0644)
	err = removeAll(memFS, "/dir-to-rm")
	if err != nil {
		t.Errorf("removeAll existing failed: %v", err)
	}

	// 3. isExistingInstallationHealthy with missing install path
	tool := &config.ToolConfig{
		Name:     "bat",
		Binaries: []interface{}{"bat"},
	}
	instRecordMissingPath := &registry.ToolInstallationRecord{
		ToolName:    "bat",
		InstallPath: "/nonexistent/install/path/bat",
	}
	if orch.isExistingInstallationHealthy(ctx, "bat", instRecordMissingPath, tool, projCfg) {
		t.Error("expected unhealthy for missing install path")
	}

	// 4. isExistingInstallationHealthy with missing current dir
	_ = memFS.MkdirAll("/opt/bat", 0755)
	_ = memFS.WriteFile("/opt/bat/bat", []byte("bin"), 0755)
	instRecordValidPath := &registry.ToolInstallationRecord{
		ToolName:    "bat",
		InstallPath: "/opt/bat/bat",
	}
	if orch.isExistingInstallationHealthy(ctx, "bat", instRecordValidPath, tool, projCfg) {
		t.Error("expected unhealthy for missing current dir")
	}

	// 5. isExistingInstallationHealthy with missing binary in current dir
	_ = memFS.MkdirAll("/home/test/.binaries/bat/current", 0755)
	if orch.isExistingInstallationHealthy(ctx, "bat", instRecordValidPath, tool, projCfg) {
		t.Error("expected unhealthy for missing binary in current dir")
	}

	// 6. Healthy installation when binary exists in current dir
	_ = memFS.WriteFile("/home/test/.binaries/bat/current/bat", []byte("bin"), 0755)
	if !orch.isExistingInstallationHealthy(ctx, "bat", instRecordValidPath, tool, projCfg) {
		t.Error("expected healthy for valid binary in current dir")
	}
}

func TestGenerateShellScriptsFeaturesAndTypes(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
		Features: config.FeaturesConfig{
			ShellInstall: &config.ShellInstallConfig{
				Zsh:        "enabled",
				Bash:       "disabled",
				Powershell: "disabled",
			},
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tool := &config.ToolConfig{
		Name: "script-tool",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases:   map[string]string{"ll": "ls -la"},
				Env:       map[string]string{"TEST_VAR": "val"},
				Functions: map[string]string{"f": "echo f"},
				Paths:     []interface{}{"/home/test/.bin"},
				Scripts: []config.ShellScript{
					{Kind: "once", Value: "echo once_script"},
					{Kind: "always", Value: "echo always_script"},
				},
				SourceFiles:     []string{"/home/test/source.zsh"},
				Sources:         []string{"source_func() { echo 1; }"},
				SourceFunctions: []string{"source_func"},
			},
			Bash: &config.ShellTypeConfig{
				Env: map[string]string{"TEST_VAR": "val"},
			},
		},
	}

	_ = memFS.WriteFile("/home/test/source.zsh", []byte("echo source"), 0644)

	err = orch.generateShellScripts(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("generateShellScripts failed: %v", err)
	}

	zshMain, err := memFS.ReadFile("/home/test/.generated/shell-scripts/main.zsh")
	if err != nil || !strings.Contains(string(zshMain), "ll") {
		t.Errorf("expected main.zsh to contain alias 'll', got %q, err=%v", string(zshMain), err)
	}
}

func TestGenerateToolsFullWorkflow(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	t1 := &config.ToolConfig{
		Name:     "tool1",
		Binaries: []interface{}{"bin1"},
	}
	t2 := &config.ToolConfig{
		Name:         "tool2",
		Binaries:     []interface{}{"bin2"},
		Dependencies: []string{"tool1"},
	}

	err = orch.GenerateTools(ctx, []*config.ToolConfig{t1, t2}, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools full workflow failed: %v", err)
	}

	existsTarget, _ := memFS.Exists("/home/test/.bin")
	if !existsTarget {
		t.Errorf("expected targetDir to exist")
	}

	zshMain, err := memFS.ReadFile("/home/test/.generated/shell-scripts/main.zsh")
	if err != nil || !strings.Contains(string(zshMain), "PATH") {
		t.Errorf("expected main.zsh generated")
	}
}

func TestInstallToolsWorkflow(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/manual-tool/current/mbin"},
	}
	_ = instReg.Register(mInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tool := &config.ToolConfig{
		Name:               "manual-tool",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"mbin"},
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("InstallTools failed: %v", err)
	}

	if mInst.installCount != 1 {
		t.Errorf("expected mock installer to be called once, got %d", mInst.installCount)
	}
}

func TestInstallToolNonExternalSuccessAndError(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	failingInst := &mockInstaller{
		name: "failing-method",
		err:  fmt.Errorf("installation failed"),
	}
	_ = instReg.Register(failingInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tFail := &config.ToolConfig{
		Name:               "fail-tool",
		InstallationMethod: "failing-method",
		Binaries:           []interface{}{"failbin"},
	}

	err = orch.InstallTool(ctx, tFail, projCfg)
	if err == nil || !strings.Contains(err.Error(), "installation failed") {
		t.Errorf("expected installation failed error, got %v", err)
	}

	succeedInst := &mockInstaller{
		name:     "succeed-method",
		binaries: []string{"/home/test/.binaries/succ-tool/current/succbin"},
	}
	_ = instReg.Register(succeedInst)

	_ = memFS.MkdirAll("/home/test/.binaries/succ-tool", 0755)

	tSucc := &config.ToolConfig{
		Name:               "succ-tool",
		InstallationMethod: "succeed-method",
		Binaries:           []interface{}{"succbin"},
	}

	err = orch.InstallTool(ctx, tSucc, projCfg)
	if err != nil {
		t.Fatalf("InstallTool non-external succeed failed: %v", err)
	}

	instRec, err := reg.GetToolInstallation(ctx, "succ-tool")
	if err != nil || instRec == nil {
		t.Fatalf("expected tool installation record in DB, got %v, err=%v", instRec, err)
	}
}

func TestInstallToolConflictingShimWarning(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/conflict-tool/current/cbin"},
	}
	_ = instReg.Register(mInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	_ = memFS.MkdirAll("/home/test/.bin", 0755)
	_ = memFS.WriteFile("/home/test/.bin/cbin", []byte("not a shim file content"), 0755)

	tConflict := &config.ToolConfig{
		Name:               "conflict-tool",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"cbin"},
	}

	err = orch.InstallTool(ctx, tConflict, projCfg)
	if err != nil {
		t.Fatalf("InstallTool with conflicting shim failed: %v", err)
	}
}

func TestInstallToolsAndCleanupErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	failingInst := &mockInstaller{
		name: "failing-inst",
		err:  fmt.Errorf("install failed"),
	}
	_ = instReg.Register(failingInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tFail := &config.ToolConfig{
		Name:               "fail-tool-2",
		InstallationMethod: "failing-inst",
		Binaries:           []interface{}{"failbin2"},
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tFail}, projCfg)
	if err == nil || !strings.Contains(err.Error(), "fail-tool-2") {
		t.Errorf("expected error installing fail-tool-2, got %v", err)
	}

	err = orch.CleanupStaleArtifacts(ctx, []*config.ToolConfig{tFail}, nil)
	if err != nil {
		t.Errorf("expected nil from CleanupStaleArtifacts with nil projCfg, got %v", err)
	}
}

func TestGenerateToolsAutoInstallAndDisabled(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/auto-tool/current/autobin"},
	}
	_ = instReg.Register(mInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tDisabled := &config.ToolConfig{
		Name:     "dis-tool",
		Disabled: true,
	}

	tAuto := &config.ToolConfig{
		Name:               "auto-tool",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"autobin"},
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tDisabled}, projCfg)
	if err != nil {
		t.Fatalf("InstallTools with disabled tool failed: %v", err)
	}

	err = orch.GenerateTools(ctx, []*config.ToolConfig{tAuto}, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools with auto-install tool failed: %v", err)
	}

	if mInst.installCount != 1 {
		t.Errorf("expected auto-install tool to be installed during GenerateTools, got count=%d", mInst.installCount)
	}
}

func TestOrchestratorPipelineErrorsAndEdgeCases(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/hook-tool/current/hookbin"},
	}
	_ = instReg.Register(mInst)

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. InstallTool with nil projCfg returns error
	err = orch.InstallTool(ctx, &config.ToolConfig{Name: "foo"}, nil)
	if err == nil {
		t.Errorf("expected error for nil projCfg")
	}

	// 2. UninstallTool with nil projCfg returns error
	err = orch.UninstallTool(ctx, &config.ToolConfig{Name: "foo"}, nil)
	if err == nil {
		t.Errorf("expected error for nil projCfg")
	}

	// 3. GenerateTool with nil projCfg returns error
	err = orch.GenerateTool(ctx, &config.ToolConfig{Name: "foo"}, nil)
	if err == nil {
		t.Errorf("expected error for nil projCfg")
	}

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	// 4. Shell-only tool installation (no InstallationMethod, no Binaries)
	shellOnlyTool := &config.ToolConfig{
		Name: "shell-tool",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Env: map[string]string{"SHELL_VAR": "val"},
			},
		},
	}
	err = orch.InstallTool(ctx, shellOnlyTool, projCfg)
	if err != nil {
		t.Fatalf("InstallTool shell-only tool failed: %v", err)
	}

	// 5. Completion generation with string path and map cmd
	_ = memFS.WriteFile("/home/test/dotfiles/comp.zsh", []byte("#compdef test"), 0644)
	compTool := &config.ToolConfig{
		Name:           "comp-tool",
		ConfigFilePath: "/home/test/dotfiles/comp-tool.tool.ts",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: "comp.zsh",
			},
			Bash: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "comp-tool completion bash",
				},
			},
		},
	}
	err = orch.GenerateCompletionsForTool(ctx, compTool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed: %v", err)
	}

	// 7. Test InstallTool type switches for all installer types
	allInstReg := installer.DefaultRegistry()
	orchAll := NewOrchestrator(log, memFS, runner, reg, allInstReg)

	for _, method := range []string{
		"github-release", "gitea-release", "cargo", "curl-binary",
		"curl-script", "curl-tar", "dmg", "manual", "zsh-plugin", "pkg", "brew",
	} {
		tc := &config.ToolConfig{
			Name:               "tool-" + method,
			InstallationMethod: method,
			InstallParams: map[string]interface{}{
				"repo":       "org/repo",
				"url":        "http://127.0.0.1/test.tar.gz",
				"binaryPath": "bin",
				"script":     "echo 1",
				"pkgName":    "pkg",
			},
		}
		_ = orchAll.InstallTool(ctx, tc, projCfg)
	}

	// 8. Test zsh-plugin and shell script generation options
	zshPluginTool := &config.ToolConfig{
		Name:               "zsh-syntax-highlighting",
		InstallationMethod: "zsh-plugin",
		ConfigFilePath:     "/home/test/dotfiles/zsh-plugin.tool.ts",
		InstallParams: map[string]interface{}{
			"repo": "zsh-users/zsh-syntax-highlighting",
		},
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Aliases:         map[string]string{"g": "git"},
				Functions:       map[string]string{"foo": "echo foo"},
				SourceFiles:     []string{"extra.zsh"},
				Sources:         []string{"echo inline"},
				SourceFunctions: []string{"__func"},
				Scripts: []config.ShellScript{
					{Kind: "always", Value: "echo always"},
					{Kind: "once", Value: "echo once"},
				},
				Completions: map[string]interface{}{
					"source": "comp.zsh",
					"bin":    "zsh-syntax-highlighting",
				},
			},
			Bash: &config.ShellTypeConfig{
				Aliases:     map[string]string{"b": "bash"},
				Functions:   map[string]string{"bar": "echo bar"},
				SourceFiles: []string{"extra.bash"},
				Sources:     []string{"echo inline bash"},
				Scripts: []config.ShellScript{
					{Kind: "once", Value: "echo once bash"},
				},
			},
			Powershell: &config.ShellTypeConfig{
				Aliases:     map[string]string{"p": "powershell"},
				Functions:   map[string]string{"baz": "echo baz"},
				SourceFiles: []string{"extra.ps1"},
				Sources:     []string{"echo inline ps1"},
				Scripts: []config.ShellScript{
					{Kind: "once", Value: "echo once ps1"},
				},
			},
		},
	}

	_ = memFS.WriteFile("/home/test/dotfiles/extra.zsh", []byte("# extra zsh"), 0644)
	_ = memFS.WriteFile("/home/test/dotfiles/extra.bash", []byte("# extra bash"), 0644)
	_ = memFS.WriteFile("/home/test/dotfiles/extra.ps1", []byte("# extra ps1"), 0644)
	_ = memFS.WriteFile("/home/test/dotfiles/comp.zsh", []byte("# compdef zsh"), 0644)

	err = orch.GenerateTools(ctx, []*config.ToolConfig{zshPluginTool}, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools with zsh-plugin tool failed: %v", err)
	}

	err = orchAll.syncTypeScriptTypes(ctx, []*config.ToolConfig{zshPluginTool}, projCfg)
	if err != nil {
		t.Fatalf("syncTypeScriptTypes failed: %v", err)
	}

	// 9. Test shouldSkipInstallation and version comparisons
	recordSkip := &registry.ToolInstallationRecord{
		ToolName:    "skip-tool",
		Version:     "v1.0.0",
		InstallPath: "/home/test/.binaries/skip-tool",
		InstalledAt: 123456789,
	}
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, recordSkip)
	})
	_ = memFS.MkdirAll("/home/test/.binaries/skip-tool", 0755)
	_ = memFS.MkdirAll("/home/test/.binaries/skip-tool/current", 0755)
	_ = memFS.WriteFile("/home/test/.binaries/skip-tool/current/skipbin", []byte("bin"), 0755)

	skipToolSameVer := &config.ToolConfig{
		Name:     "skip-tool",
		Version:  strPtr("1.0.0"),
		Binaries: []interface{}{"skipbin"},
	}
	skipped, err := orch.shouldSkipInstallation(ctx, skipToolSameVer, projCfg)
	if err != nil || !skipped {
		t.Errorf("expected skipToolSameVer to be skipped, skipped=%v, err=%v", skipped, err)
	}

	skipToolDiffVer := &config.ToolConfig{
		Name:     "skip-tool",
		Version:  strPtr("2.0.0"),
		Binaries: []interface{}{"skipbin"},
	}
	skippedDiff, err := orch.shouldSkipInstallation(ctx, skipToolDiffVer, projCfg)
	if err != nil || skippedDiff {
		t.Errorf("expected skipToolDiffVer not to be skipped, skipped=%v", skippedDiff)
	}
}

func TestGenerateToolsAndInstallToolsAllPaths(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	mInst := &mockInstaller{
		name:     "manual",
		binaries: []string{"/home/test/.binaries/auto-install-me/current/autobin"},
	}
	_ = instReg.Register(mInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	tDisabled := &config.ToolConfig{
		Name:     "disabled-tool",
		Disabled: true,
	}

	tWrongHost := &config.ToolConfig{
		Name:     "wrong-host-tool",
		Hostname: "nonexistent-host-xyz-123",
	}

	tNormal := &config.ToolConfig{
		Name:               "normal-tool",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"normbin"},
	}

	tAutoNotSkipped := &config.ToolConfig{
		Name:               "auto-install-me",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"autobin"},
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}

	// 1. GenerateTools with all tool variants
	tools := []*config.ToolConfig{tDisabled, tWrongHost, tNormal, tAutoNotSkipped}
	err = orch.GenerateTools(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools failed: %v", err)
	}

	// Now tAutoNotSkipped is installed in DB. Run GenerateTools again so auto-install is skipped and calls GenerateTool
	err = orch.GenerateTools(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools second run failed: %v", err)
	}

	// 2. InstallTools with all tool variants
	err = orch.InstallTools(ctx, tools, projCfg)
	if err != nil {
		t.Fatalf("InstallTools failed: %v", err)
	}
}

func strPtr(s string) *string {
	return &s
}

type mockFailingInstaller struct {
	mockInstaller
}

func (m *mockFailingInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return nil, fmt.Errorf("mock installation error")
}

func TestOrchestratorCoverageBoost(t *testing.T) {
	memFS := fs.NewMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	failingInst := &mockFailingInstaller{}
	failingInst.name = "failing-inst"
	_ = instReg.Register(failingInst)

	manualInst := &mockInstaller{name: "manual"}
	_ = instReg.Register(manualInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. Failing installer cleanup path
	tFailing := &config.ToolConfig{
		Name:               "failing-tool",
		InstallationMethod: "failing-inst",
		Binaries:           []interface{}{"failbin"},
	}
	err = orch.InstallTool(ctx, tFailing, projCfg)
	if err == nil {
		t.Errorf("expected error for failing-inst")
	}

	// 2. InstallTool with hooks
	_ = memFS.MkdirAll("/home/test/dotfiles", 0755)
	_ = memFS.WriteFile("/home/test/dotfiles/local-hook.sh", []byte("#!/bin/bash\necho local"), 0755)
	tHook := &config.ToolConfig{
		Name:               "hook-tool",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"hookbin"},
		ConfigFilePath:     "/home/test/dotfiles/hook.tool.ts",
		InstallParams: map[string]interface{}{
			"hooks": map[string]interface{}{
				"after-install": []interface{}{
					"echo after-install-hook",
					"./local-hook.sh",
				},
			},
		},
	}
	err = orch.InstallTool(ctx, tHook, projCfg)
	if err != nil {
		t.Fatalf("InstallTool with hooks failed: %v", err)
	}

	// 3. Stale shims, symlinks, copies cleanup
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "hook-tool",
			OperationType: "write",
			FileType:      "shim",
			FilePath:      "/home/test/.bin/stale-shim",
			CreatedAt:     1000,
		})
	})
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "hook-tool",
			OperationType: "symlink",
			FileType:      "symlink",
			FilePath:      "/home/test/stale-symlink",
			CreatedAt:     1000,
		})
	})
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName:      "hook-tool",
			OperationType: "write",
			FileType:      "copy",
			FilePath:      "/home/test/stale-copy",
			CreatedAt:     1000,
		})
	})
	_ = memFS.WriteFile("/home/test/.bin/stale-shim", []byte("stale"), 0755)
	_ = memFS.WriteFile("/home/test/stale-symlink", []byte("stale"), 0755)
	_ = memFS.WriteFile("/home/test/stale-copy", []byte("stale"), 0644)

	err = orch.CleanupStaleArtifacts(ctx, []*config.ToolConfig{tHook}, projCfg)
	if err != nil {
		t.Fatalf("CleanupStaleArtifacts failed: %v", err)
	}

	// 4. Dependency cycle errors in GenerateTools, InstallTools
	tCyclic1 := &config.ToolConfig{Name: "cycle1", Dependencies: []string{"cycle2"}}
	tCyclic2 := &config.ToolConfig{Name: "cycle2", Dependencies: []string{"cycle1"}}
	cyclic := []*config.ToolConfig{tCyclic1, tCyclic2}

	if err := orch.GenerateTools(ctx, cyclic, projCfg); err == nil {
		t.Errorf("expected error for cycle in GenerateTools")
	}
	if err := orch.InstallTools(ctx, cyclic, projCfg); err == nil {
		t.Errorf("expected error for cycle in InstallTools")
	}

	// 5. syncTypeScriptTypes binary extraction
	tTypes := &config.ToolConfig{
		Name: "type-tool",
		Binaries: []interface{}{
			"str-bin",
			map[string]interface{}{"name": "obj-bin"},
		},
	}
	err = orch.syncTypeScriptTypes(ctx, []*config.ToolConfig{tTypes}, projCfg)
	if err != nil {
		t.Fatalf("syncTypeScriptTypes failed: %v", err)
	}

	// Early return checks for syncTypeScriptTypes
	_ = orch.syncTypeScriptTypes(ctx, nil, nil)
	_ = orch.syncTypeScriptTypes(ctx, nil, &config.ProjectConfig{})

	// 9. CleanupStaleSymlinks and CleanupStaleCopies with ~ target
	symTool := &config.ToolConfig{
		Name: "sym-tool-tilde",
		Symlinks: []config.SymlinkConfig{
			{Source: "src", Target: "~/tilde-target"},
		},
	}
	_ = orch.CleanupStaleSymlinks(ctx, []*config.ToolConfig{symTool}, projCfg)

	copyTool := &config.ToolConfig{
		Name: "copy-tool-tilde",
		Copies: []config.CopyConfig{
			{Source: "src", Target: "~/tilde-copy"},
		},
	}
	_ = orch.CleanupStaleCopies(ctx, []*config.ToolConfig{copyTool}, projCfg)

	// 6. Manual tool without binaryPath and shim conflict
	manualNoBin := &config.ToolConfig{
		Name:               "manual-no-bin",
		InstallationMethod: "manual",
		Binaries:           []interface{}{"manbin"},
	}
	err = orch.GenerateTool(ctx, manualNoBin, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool manual without binaryPath failed: %v", err)
	}

	// Conflict shim without overwrite
	_ = memFS.WriteFile("/home/test/.bin/conflictbin", []byte("user-file"), 0755)
	conflictTool := &config.ToolConfig{
		Name:     "conflict-tool",
		Binaries: []interface{}{"conflictbin"},
	}
	err = orch.GenerateTool(ctx, conflictTool, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool with conflict failed: %v", err)
	}

	// 7. SetSymlinkFS, isAutoInstall string, unindentString, formatFunctionBody
	orch.SetSymlinkFS(memFS)
	if eval := orch.getSymlinkEvaluator(); eval == nil {
		t.Errorf("expected non-nil symlink evaluator")
	}

	tAutoStr := &config.ToolConfig{
		InstallParams: map[string]interface{}{"auto": "true"},
	}
	if !isAutoInstall(tAutoStr) {
		t.Errorf("expected isAutoInstall('true') to be true")
	}
	if isAutoInstall(nil) {
		t.Errorf("expected isAutoInstall(nil) to be false")
	}
	tAutoInvalid := &config.ToolConfig{
		InstallParams: map[string]interface{}{"auto": 12345},
	}
	if isAutoInstall(tAutoInvalid) {
		t.Errorf("expected isAutoInstall(invalid) to be false")
	}

	t.Run("findSystemBinary test", func(t *testing.T) {
		_, err := findSystemBinary("non-existent-binary-1234567")
		if err == nil {
			t.Errorf("expected error for non-existent binary")
		}
		path, err := findSystemBinary("sh")
		if err != nil || path == "" {
			t.Errorf("expected to find system binary sh")
		}
	})

	origArgs := os.Args
	os.Args = append(os.Args, "--overwrite")
	if !shouldOverwrite(ctx) {
		t.Errorf("expected shouldOverwrite with --overwrite flag to be true")
	}
	os.Args = origArgs

	if unindentString("   \n\n   ") != "" {
		t.Errorf("expected empty unindentString result")
	}
	if formatFunctionBody("   \n\n   ") != "" {
		t.Errorf("expected empty formatFunctionBody result")
	}

	// 8. getCliCommand with env & getTargetVersion with semver constraints
	_ = removeAll(memFS, "/nonexistent-path-xyz")
	_ = memFS.WriteFile("/remove-file.txt", []byte("data"), 0644)
	_ = removeAll(memFS, "/remove-file.txt")
	_ = memFS.MkdirAll("/dir-to-remove/subdir", 0755)
	_ = memFS.WriteFile("/dir-to-remove/subdir/file.txt", []byte("f"), 0644)
	_ = removeAll(memFS, "/dir-to-remove")
	t.Setenv("DOTFILES_CLI_COMMAND", "/custom/dotfiles")
	if orch.getCliCommand() != "/custom/dotfiles" {
		t.Errorf("getCliCommand with env failed")
	}

	constraintTool := &config.ToolConfig{
		Version: strPtr("^1.0.0"),
	}
	if orch.getTargetVersion(constraintTool) != "" {
		t.Errorf("expected empty target version for constraint ^1.0.0")
	}
}
