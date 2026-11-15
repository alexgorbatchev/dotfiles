package orchestrator

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shell"
)

// A manual tool that declares .bin() but has neither a binaryPath nor a before-install
// hook gets no shim, as in v1: nothing could ever put a binary where the shim would
// point, so the command is expected to come from shell functions and the author is
// told so. Generation and the stale-shim cleanup derive the expected set from the
// same rule, so a second generate has nothing to remove and nothing to regenerate,
// and an installer result cannot smuggle a shim in either.
func TestManualToolWithoutBinaryPath_NoShimAndWarning(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	if err := instReg.Register(&mockInstaller{name: "manual", binaries: []string{"/home/user/.generated/binaries/tmux-sessionx/current/tmux-sessionx"}}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}

	orch := NewOrchestrator(log, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	toolManual := &config.ToolConfig{
		Name:               "tmux-sessionx",
		Binaries:           testutil.DeclaredBinaries("tmux-sessionx"),
		ConfigFilePath:     "/home/user/tools/tmux-sessionx.tool.ts",
		InstallationMethod: "manual",
	}
	const shimPath = "/home/user/bin/tmux-sessionx"

	for run := 1; run <= 2; run++ {
		if err := orch.GenerateTools(ctx, []*config.ToolConfig{toolManual}, projCfg); err != nil {
			t.Fatalf("GenerateTools run %d: %v", run, err)
		}
		if exists, _ := fsys.Exists(shimPath); exists {
			t.Fatalf("run %d generated a shim for a manual tool without binaryPath", run)
		}
	}
	if err := orch.InstallTool(ctx, toolManual, projCfg); err != nil {
		t.Fatalf("InstallTool: %v", err)
	}
	if exists, _ := fsys.Exists(shimPath); exists {
		t.Errorf("install generated a shim for a manual tool without binaryPath")
	}

	logs := logBuf.String()
	if !strings.Contains(logs, "Skipping shim generation") {
		t.Errorf("expected a warning that .bin() produced no shim, got:\n%s", logs)
	}
	if strings.Contains(logs, "Removing stale shim") {
		t.Errorf("generation and cleanup disagree: a shim was removed as stale:\n%s", logs)
	}
}

// The shim and the installer read the same binaryPath and must agree on where it points.
// A relative path with no tool file to be relative to falls back to the dotfiles
// directory, as v1's expandToolConfigPath did, and "~" is the project's home directory
// whichever filesystem the caller was handed.
func TestManualBinaryPathResolvesLikeTheInstaller(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		binaryPath string
		configFile string
		want       string
	}{
		{name: "relative without a tool file", binaryPath: "scripts/probe.sh", want: "/home/user/dotfiles/scripts/probe.sh"},
		{name: "relative to the tool file", binaryPath: "./probe.sh", configFile: "/home/user/dotfiles/tools/probe.tool.ts", want: "/home/user/dotfiles/tools/probe.sh"},
		{name: "home", binaryPath: "~/opt/probe.sh", want: "/home/user/opt/probe.sh"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := newMemFS()
			runner := exec.NewMockRunner()

			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("failed creating DB: %v", err)
			}
			defer sqlDB.Close()

			manualInst := installer.NewManualInstaller(memFS, nil)
			manualInst.BinDir = "/home/user/.generated/binaries/probe/current"
			instReg := installer.NewRegistry()
			instReg.Register(manualInst)

			log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: io.Discard})
			orch := NewOrchestrator(log, memFS, runner, registry.NewRegistry(sqlDB), instReg)
			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:         "/home/user",
					DotfilesDir:     "/home/user/dotfiles",
					TargetDir:       "/home/user/bin",
					BinariesDir:     "/home/user/.generated/binaries",
					ShellScriptsDir: "/home/user/.generated/shell-scripts",
					GeneratedDir:    "/home/user/.generated",
				},
			}

			_ = memFS.MkdirAll(filepath.Dir(tt.want), 0755)
			_ = memFS.WriteFile(tt.want, []byte("#!/bin/sh\necho probe"), 0755)

			tool := &config.ToolConfig{
				Name:               "probe",
				Binaries:           testutil.DeclaredBinaries("probe-bin-4f1d"),
				ConfigFilePath:     tt.configFile,
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": tt.binaryPath},
			}

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("GenerateTool failed: %v", err)
			}
			shim, err := memFS.ReadFile("/home/user/bin/probe-bin-4f1d")
			if err != nil {
				t.Fatalf("expected the shim to exist: %v", err)
			}
			wantExecutable := `TOOL_EXECUTABLE=/home/user/.generated/binaries/probe/current/probe-bin-4f1d`
			if !strings.Contains(string(shim), wantExecutable) {
				t.Errorf("generated shim lacks %s:\n%s", wantExecutable, shim)
			}

			if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("InstallTool failed: %v", err)
			}
			shimInstalled, err := memFS.ReadFile("/home/user/bin/probe-bin-4f1d")
			if err != nil {
				t.Fatalf("expected the shim to exist after install: %v", err)
			}
			if !strings.Contains(string(shimInstalled), wantExecutable) {
				t.Errorf("installed shim lacks %s:\n%s", wantExecutable, shimInstalled)
			}
			destLink := "/home/user/.generated/binaries/probe/current/probe-bin-4f1d"
			linkTarget, err := memFS.Readlink(destLink)
			if err != nil {
				t.Fatalf("expected binary symlink at %s: %v", destLink, err)
			}
			if linkTarget != tt.want {
				t.Errorf("expected symlink target %s, got %s", tt.want, linkTarget)
			}
		})
	}
}

func TestManualToolWithTildeBinaryPath_GenerateToolAndInstall(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	rfs := fs.NewResolvedFS(newMemFS(), "/home/user")
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	instReg := installer.NewRegistry()
	manualInst := installer.NewManualInstaller(rfs, nil)
	manualInst.BinDir = "/home/user/.generated/binaries/claude-code/current"
	instReg.Register(manualInst)

	orch := NewOrchestrator(log, rfs, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	_ = rfs.MkdirAll("/home/user/.local/bin", 0755)
	_ = rfs.WriteFile("/home/user/.local/bin/claude", []byte("#!/bin/sh\necho claude"), 0755)

	toolClaude := &config.ToolConfig{
		Name:               "claude-code",
		Binaries:           testutil.DeclaredBinaries("claude"),
		ConfigFilePath:     "/home/user/dotfiles/tools/claude.tool.ts",
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"binaryPath": "~/.local/bin/claude",
			"symlink":    true,
		},
	}

	err = orch.GenerateTool(ctx, toolClaude, projCfg)
	if err != nil {
		t.Fatalf("GenerateTool failed: %v", err)
	}

	shimContent, err := rfs.ReadFile("/home/user/bin/claude")
	if err != nil {
		t.Fatalf("expected shim to exist: %v", err)
	}

	// TOOL_EXECUTABLE in shim should NOT contain /current/~/.local/bin/claude
	if strings.Contains(string(shimContent), "/current/~/.local/bin/claude") {
		t.Errorf("shim contains unexpanded tilde path: %s", string(shimContent))
	}
	wantExecutable := "TOOL_EXECUTABLE=/home/user/.generated/binaries/claude-code/current/claude"
	if !strings.Contains(string(shimContent), wantExecutable) {
		t.Errorf("expected TOOL_EXECUTABLE to be %s, got: %s", wantExecutable, string(shimContent))
	}

	// Now run InstallTool
	err = orch.InstallTool(ctx, toolClaude, projCfg)
	if err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	shimContentAfterInstall, err := rfs.ReadFile("/home/user/bin/claude")
	if err != nil {
		t.Fatalf("expected shim to exist after install: %v", err)
	}
	if !strings.Contains(string(shimContentAfterInstall), wantExecutable) {
		t.Errorf("expected TOOL_EXECUTABLE to be %s after install, got: %s", wantExecutable, string(shimContentAfterInstall))
	}

	// Verify symlink was created under binariesDir
	destLink := "/home/user/.generated/binaries/claude-code/current/claude"
	linkTarget, err := rfs.Readlink(destLink)
	if err != nil {
		t.Fatalf("expected binary symlink at %s: %v", destLink, err)
	}
	if linkTarget != "/home/user/.local/bin/claude" {
		t.Errorf("expected symlink target /home/user/.local/bin/claude, got %s", linkTarget)
	}
}

func TestManualToolMultiCallBinary_ShimsTargetPerNameFiles(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()

	manualInst := installer.NewManualInstaller(memFS, nil)
	manualInst.BinDir = "/home/user/.generated/binaries/rust/current"
	instReg := installer.NewRegistry()
	instReg.Register(manualInst)

	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: io.Discard})
	orch := NewOrchestrator(log, memFS, runner, registry.NewRegistry(sqlDB), instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			DotfilesDir:     "/home/user/dotfiles",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	rustupPath := "/home/user/.cargo/bin/rustup"
	_ = memFS.MkdirAll(filepath.Dir(rustupPath), 0755)
	_ = memFS.WriteFile(rustupPath, []byte("#!/bin/sh\necho rustup"), 0755)

	tool := &config.ToolConfig{
		Name:               "rust",
		Binaries:           testutil.DeclaredBinaries("rustup", "cargo"),
		ConfigFilePath:     "/home/user/dotfiles/tools/rust.tool.ts",
		InstallationMethod: "manual",
		InstallParams:      map[string]interface{}{"binaryPath": "~/.cargo/bin/rustup"},
	}

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool failed: %v", err)
	}

	for _, name := range []string{"rustup", "cargo"} {
		shim, err := memFS.ReadFile("/home/user/bin/" + name)
		if err != nil {
			t.Fatalf("expected shim for %s to exist: %v", name, err)
		}
		want := `TOOL_EXECUTABLE=/home/user/.generated/binaries/rust/current/` + name + ``
		if !strings.Contains(string(shim), want) {
			t.Errorf("generated shim for %s lacks %s:\n%s", name, want, shim)
		}
	}

	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	for _, name := range []string{"rustup", "cargo"} {
		shim, err := memFS.ReadFile("/home/user/bin/" + name)
		if err != nil {
			t.Fatalf("expected shim for %s to exist after install: %v", name, err)
		}
		want := `TOOL_EXECUTABLE=/home/user/.generated/binaries/rust/current/` + name + ``
		if !strings.Contains(string(shim), want) {
			t.Errorf("installed shim for %s lacks %s:\n%s", name, want, shim)
		}

		destLink := "/home/user/.generated/binaries/rust/current/" + name
		target, err := memFS.Readlink(destLink)
		if err != nil {
			t.Fatalf("expected symlink at %s: %v", destLink, err)
		}
		if target != rustupPath {
			t.Errorf("expected symlink target %s, got %s", rustupPath, target)
		}
	}
}

// TestManualBinaryPathRejectsUnresolvablePlaceholder pins that a manual tool whose
// binaryPath holds a placeholder nothing can fill stops the run. Left in place the token
// makes binaryPath relative, and both pipelines would shim whatever the directory the
// command was run from happens to hold.
func TestManualBinaryPathRejectsUnresolvablePlaceholder(t *testing.T) {
	t.Parallel()
	run := map[string]func(*Orchestrator, context.Context, *config.ToolConfig, *config.ProjectConfig) error{
		"generate": func(o *Orchestrator, ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.GenerateTool(ctx, tool, projCfg)
		},
		"install": func(o *Orchestrator, ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.InstallTool(ctx, tool, projCfg)
		},
	}

	for _, pipeline := range []string{"generate", "install"} {
		t.Run(pipeline, func(t *testing.T) {
			ctx := context.Background()
			fsys := newMemFS()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening the registry database: %v", err)
			}
			defer sqlDB.Close()

			instReg := installer.NewRegistry()
			if err := instReg.Register(&mockInstaller{name: "manual"}); err != nil {
				t.Fatalf("registering the installer: %v", err)
			}
			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
			orch := NewOrchestrator(log, fsys, exec.NewMockRunner(), registry.NewRegistry(sqlDB), instReg)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:         "/home/user",
					TargetDir:       "/home/user/.generated/bin",
					BinariesDir:     "/home/user/.generated/binaries",
					ShellScriptsDir: "/home/user/.generated/shell-scripts",
					GeneratedDir:    "/home/user/.generated",
				},
			}

			tool := &config.ToolConfig{
				Name:               "bat",
				Binaries:           testutil.DeclaredBinaries("bat"),
				ConfigFilePath:     "/home/user/tools/bat.tool.ts",
				InstallationMethod: "manual",
				InstallParams:      map[string]interface{}{"binaryPath": "{configFileDir}/bat"},
			}

			err = run[pipeline](orch, ctx, tool, projCfg)
			if err == nil {
				t.Fatalf("%s = nil, want it to fail on the unresolvable placeholder", pipeline)
			}
			for _, want := range []string{"bat", "binaryPath", "{configFileDir}"} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("%s = %v, want it to name %q", pipeline, err, want)
				}
			}
		})
	}
}

func TestManualTool_ShimTargetUnifiedBetweenInstallAndGenerate(t *testing.T) {
	t.Parallel()
	const toolName = "hooked-manual"

	ctx := context.Background()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	instReg := installer.NewRegistry()
	_ = instReg.Register(installer.NewManualInstaller(memFS, nil))

	log := logger.New(logger.Config{Writer: io.Discard})
	orch := NewOrchestrator(log, memFS, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  "/home/user/dotfiles",
			TargetDir:    "/home/user/.bin",
			BinariesDir:  "/home/user/.generated/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	toolFile := filepath.Join(t.TempDir(), toolName+".tool.ts")
	toolBody := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual")
				.bin("mycmd", "bin/nested-cmd")
				.hook("before-install", async ({ stagingDir, fileSystem }) => {
					await fileSystem.mkdir(stagingDir + "/bin");
					await fileSystem.writeFile(stagingDir + "/bin/nested-cmd", "#!/bin/sh\necho ok");
				}),
		);
	`
	if err := os.WriteFile(toolFile, []byte(toolBody), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}

	tool := &config.ToolConfig{
		Name:               toolName,
		ConfigFilePath:     toolFile,
		InstallationMethod: "manual",
		Binaries: []interface{}{
			map[string]interface{}{"name": "mycmd", "pattern": "bin/nested-cmd"},
		},
		InstallParams: map[string]interface{}{"hooks": []any{"before-install"}},
	}

	// 1. InstallTool
	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool() error = %v", err)
	}

	// Check installed shim target
	shimPath := "/home/user/.bin/mycmd"
	shimBytes, err := memFS.ReadFile(shimPath)
	if err != nil {
		t.Fatalf("reading shim after install: %v", err)
	}
	expectedTarget := "/home/user/.generated/binaries/" + toolName + "/current/mycmd"
	expectedExecutable := "TOOL_EXECUTABLE=" + shell.Quote(expectedTarget)
	if !strings.Contains(string(shimBytes), expectedExecutable) {
		t.Fatalf("InstallTool shim target mismatch:\nwant to contain %s\ngot:\n%s", expectedExecutable, string(shimBytes))
	}

	// Verify the promoted binary exists at the target
	exists, err := memFS.Exists(expectedTarget)
	if err != nil || !exists {
		t.Fatalf("promoted binary missing at %s", expectedTarget)
	}

	// 2. GenerateTool (state generate)
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool() error = %v", err)
	}

	// Check generated shim target matches
	genShimBytes, err := memFS.ReadFile(shimPath)
	if err != nil {
		t.Fatalf("reading shim after generate: %v", err)
	}
	if !strings.Contains(string(genShimBytes), expectedExecutable) {
		t.Fatalf("GenerateTool shim target mismatch:\nwant to contain %s\ngot:\n%s", expectedExecutable, string(genShimBytes))
	}
}
