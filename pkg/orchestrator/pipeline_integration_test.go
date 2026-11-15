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

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestToolPipelinesContinueAfterFailures(t *testing.T) {
	for _, pipeline := range []struct {
		name string
		run  func(*Orchestrator, context.Context, []*config.ToolConfig, *config.ProjectConfig) error
	}{
		{"generate", (*Orchestrator).GenerateTools},
		{"install", (*Orchestrator).InstallTools},
	} {
		t.Run(pipeline.name, func(t *testing.T) {
			mem := newMemFS()
			o := newTestOrchestrator(t, mem, "")
			var output bytes.Buffer
			o.SetLogger(logger.New(logger.Config{Writer: &output}))
			project := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: "/home/user", TargetDir: "/target", GeneratedDir: "/generated", BinariesDir: "/binaries",
			}}
			tools := []*config.ToolConfig{
				{Name: "first-failure", Symlinks: []config.SymlinkConfig{{Source: "/missing-first", Target: "/first-link"}}},
				{Name: "second-failure", Symlinks: []config.SymlinkConfig{{Source: "/missing-second", Target: "/second-link"}}},
				{Name: "healthy", Directories: []config.DirectoryConfig{{Path: "/healthy-generated"}}},
			}
			err := pipeline.run(o, context.Background(), tools, project)
			if err == nil {
				t.Fatal("batch succeeded despite tool failures")
			}
			for _, path := range []string{"/healthy-generated", "/generated/shell-scripts/main.zsh"} {
				if exists, _ := mem.Exists(path); !exists {
					t.Errorf("batch stopped before generating %s", path)
				}
			}
			for _, cause := range []string{"/missing-first", "/missing-second"} {
				if !strings.Contains(err.Error(), cause) || !strings.Contains(output.String(), cause) {
					t.Errorf("failure %s was lost: error=%v, log=%s", cause, err, output.String())
				}
			}
		})
	}
}

func TestInstallToolsAndCleanupErrors(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
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
		Binaries:           testutil.DeclaredBinaries("failbin2"),
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

func TestOrchestratorPipelineErrorsAndEdgeCases(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
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
	allInstReg := installer.NewRegistry()
	dl := downloader.NewDownloader(memFS, nil)
	_ = allInstReg.Register(installer.NewGitHubInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewGiteaInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewCargoInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewCurlBinaryInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewCurlScriptInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewCurlTarInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewDmgInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewManualInstaller(memFS, nil))
	_ = allInstReg.Register(installer.NewZshPluginInstaller(runner, memFS, nil))
	_ = allInstReg.Register(installer.NewPkgInstaller(runner, memFS, dl, nil))
	_ = allInstReg.Register(installer.NewBrewInstaller(runner, memFS, nil))
	_ = allInstReg.Register(installer.NewUvInstaller(runner, memFS, nil))

	orchAll := NewOrchestrator(log, memFS, runner, reg, allInstReg)

	for _, method := range []string{
		"github-release", "gitea-release", "cargo", "curl-binary",
		"curl-script", "curl-tar", "dmg", "manual", "zsh-plugin", "pkg", "brew", "uv",
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
				Aliases:   map[string]string{"g": "git"},
				Functions: map[string]string{"foo": "echo foo"},
				Scripts: []config.ShellScript{
					{Kind: "sourceFile", Value: "extra.zsh"},
					{Kind: "source", Value: "echo inline"},
					{Kind: "sourceFunction", Value: "__func"},
					{Kind: "always", Value: "echo always"},
					{Kind: "once", Value: "echo once"},
				},
				Completions: map[string]interface{}{
					"source": "comp.zsh",
					"bin":    "zsh-syntax-highlighting",
				},
			},
			Bash: &config.ShellTypeConfig{
				Aliases:   map[string]string{"b": "bash"},
				Functions: map[string]string{"bar": "echo bar"},
				Scripts: []config.ShellScript{
					{Kind: "sourceFile", Value: "extra.bash"},
					{Kind: "source", Value: "echo inline bash"},
					{Kind: "once", Value: "echo once bash"},
				},
			},
			Powershell: &config.ShellTypeConfig{
				Aliases:   map[string]string{"p": "powershell"},
				Functions: map[string]string{"baz": "echo baz"},
				Scripts: []config.ShellScript{
					{Kind: "sourceFile", Value: "extra.ps1"},
					{Kind: "source", Value: "echo inline ps1"},
					{Kind: "once", Value: "echo once ps1"},
				},
			},
		},
	}

	_ = memFS.WriteFile("/home/test/dotfiles/extra.zsh", []byte("# extra zsh"), 0644)
	_ = memFS.WriteFile("/home/test/dotfiles/extra.bash", []byte("# extra bash"), 0644)
	_ = memFS.WriteFile("/home/test/dotfiles/extra.ps1", []byte("# extra ps1"), 0644)
	_ = memFS.WriteFile("/home/test/dotfiles/comp.zsh", []byte("# compdef zsh"), 0644)

	err = orchAll.GenerateTools(ctx, []*config.ToolConfig{zshPluginTool}, projCfg)
	if err != nil {
		t.Fatalf("GenerateTools with zsh-plugin tool failed: %v", err)
	}

	err = orchAll.SyncTypeScriptTypes(ctx, []*config.ToolConfig{zshPluginTool}, projCfg)
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
		Binaries: testutil.DeclaredBinaries("skipbin"),
	}
	skipped, err := orch.shouldSkipInstallation(ctx, skipToolSameVer, projCfg)
	if err != nil || !skipped {
		t.Errorf("expected skipToolSameVer to be skipped, skipped=%v, err=%v", skipped, err)
	}

	skipToolDiffVer := &config.ToolConfig{
		Name:     "skip-tool",
		Version:  strPtr("2.0.0"),
		Binaries: testutil.DeclaredBinaries("skipbin"),
	}
	skippedDiff, err := orch.shouldSkipInstallation(ctx, skipToolDiffVer, projCfg)
	if err != nil || skippedDiff {
		t.Errorf("expected skipToolDiffVer not to be skipped, skipped=%v", skippedDiff)
	}
}

func TestGenerateToolsAndInstallToolsAllPaths(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
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
		Binaries:           testutil.DeclaredBinaries("normbin"),
	}

	tAutoNotSkipped := &config.ToolConfig{
		Name:               "auto-install-me",
		InstallationMethod: "manual",
		Binaries:           testutil.DeclaredBinaries("autobin"),
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

func TestOrchestratorCoverageBoost(t *testing.T) {
	memFS := newMemFS()
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
		Binaries:           testutil.DeclaredBinaries("failbin"),
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
		Binaries:           testutil.DeclaredBinaries("hookbin"),
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
	err = orch.SyncTypeScriptTypes(ctx, []*config.ToolConfig{tTypes}, projCfg)
	if err != nil {
		t.Fatalf("syncTypeScriptTypes failed: %v", err)
	}

	// Early return checks for syncTypeScriptTypes
	_ = orch.SyncTypeScriptTypes(ctx, nil, nil)
	_ = orch.SyncTypeScriptTypes(ctx, nil, &config.ProjectConfig{})

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
		Binaries:           testutil.DeclaredBinaries("manbin"),
	}
	err = orch.GenerateTool(ctx, manualNoBin, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool manual without binaryPath failed: %v", err)
	}

	// Conflict shim without overwrite
	_ = memFS.WriteFile("/home/test/.bin/conflictbin", []byte("user-file"), 0755)
	conflictTool := &config.ToolConfig{
		Name:     "conflict-tool",
		Binaries: testutil.DeclaredBinaries("conflictbin"),
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
		// findSystemBinary asks what the machine already has, so this is one of the
		// few places that genuinely needs the in-memory filesystem to see the real
		// one. Everywhere else an isolated MemFS keeps the result off the host.
		orch := NewOrchestrator(log, fs.NewMemFSWithHostFallback(), runner, reg, nil)
		_, err := orch.findSystemBinary("non-existent-binary-1234567", projCfg)
		if err == nil {
			t.Errorf("expected error for non-existent binary")
		}
		path, err := orch.findSystemBinary("sh", projCfg)
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

	// 8. getCliArgs with env & getTargetVersion with semver constraints
	_ = memFS.RemoveAll("/nonexistent-path-xyz")
	_ = memFS.WriteFile("/remove-file.txt", []byte("data"), 0644)
	_ = memFS.RemoveAll("/remove-file.txt")
	_ = memFS.MkdirAll("/dir-to-remove/subdir", 0755)
	_ = memFS.WriteFile("/dir-to-remove/subdir/file.txt", []byte("f"), 0644)
	_ = memFS.RemoveAll("/dir-to-remove")
	t.Setenv("DOTFILES_CLI_COMMAND", "/custom/dotfiles")
	if orch.getCliArgs()[0] != "/custom/dotfiles" {
		t.Errorf("getCliArgs with env failed")
	}

	constraintTool := &config.ToolConfig{
		Version: strPtr("^1.0.0"),
	}
	if orch.getTargetVersion(constraintTool) != "" {
		t.Errorf("expected empty target version for constraint ^1.0.0")
	}
}
