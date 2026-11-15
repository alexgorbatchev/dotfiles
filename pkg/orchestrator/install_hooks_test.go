package orchestrator

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// writeHookedManualTool puts a manual .tool.ts on disk whose before-install hook runs
// the given body and whose after-install hook records where the tool ended up. The
// file has to be on the real disk because hooks are re-evaluated from it.
func writeHookedManualTool(t *testing.T, toolName, beforeInstallBody string) *config.ToolConfig {
	t.Helper()
	toolPath := filepath.Join(t.TempDir(), toolName+".tool.ts")
	body := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual")
				.hook("before-install", async ({ stagingDir, fileSystem, log }) => {
					` + beforeInstallBody + `
				})
				.hook("after-install", async ({ installedDir, fileSystem }) => {
					await fileSystem.mkdir("/home/user/markers");
					await fileSystem.writeFile("/home/user/markers/after-install", installedDir);
				}),
		);
	`
	if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}
	return &config.ToolConfig{
		Name:               toolName,
		ConfigFilePath:     toolPath,
		InstallationMethod: "manual",
		InstallParams:      map[string]interface{}{"hooks": []any{"before-install", "after-install"}},
	}
}

// A manual tool without binaryPath has nothing but its before-install hook to put
// files into stagingDir. When the hook does so the staged files are promoted and
// after-install runs; when it leaves the directory empty the install fails outright
// instead of promoting an empty directory, and after-install never runs.
func TestInstallTool_BeforeInstallHookStagesThePayload(t *testing.T) {
	t.Parallel()
	const toolName = "tmux-plugin"
	stagingDir := "/home/user/.generated/binaries/" + toolName + "/.staging"
	currentDir := "/home/user/.generated/binaries/" + toolName + "/current"
	afterInstallMarker := "/home/user/markers/after-install"

	tests := []struct {
		name              string
		beforeInstallBody string
		wantErrContains   string
	}{
		{
			name:              "hook stages files into stagingDir",
			beforeInstallBody: `await fileSystem.writeFile(stagingDir + "/plugin.tmux", "payload");`,
		},
		{
			name:              "hook leaves stagingDir empty",
			beforeInstallBody: `log.info("staging nothing");`,
			wantErrContains:   "staging directory " + stagingDir + " is empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
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
			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
			orch := NewOrchestrator(log, memFS, runner, reg, instReg)

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
			tool := writeHookedManualTool(t, toolName, tt.beforeInstallBody)

			err = orch.InstallTool(ctx, tool, projCfg)

			if stagingExists, _ := memFS.Exists(stagingDir); stagingExists {
				t.Errorf("staging directory %s was left behind", stagingDir)
			}
			markerExists, _ := memFS.Exists(afterInstallMarker)
			currentExists, _ := memFS.Exists(currentDir)
			record, recordErr := reg.GetToolInstallation(ctx, toolName)
			if recordErr != nil {
				t.Fatalf("reading installation record: %v", recordErr)
			}

			if tt.wantErrContains != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErrContains) {
					t.Fatalf("InstallTool error = %v, want it to contain %q", err, tt.wantErrContains)
				}
				if currentExists {
					t.Errorf("%s exists: an empty staging directory must not be promoted", currentDir)
				}
				if markerExists {
					t.Errorf("after-install ran for an install that failed")
				}
				if record != nil {
					t.Errorf("a failed install was recorded as installed: %+v", record)
				}
				return
			}

			if err != nil {
				t.Fatalf("InstallTool failed: %v", err)
			}
			payload, readErr := memFS.ReadFile(currentDir + "/plugin.tmux")
			if readErr != nil {
				t.Fatalf("staged file was not promoted to %s: %v", currentDir, readErr)
			}
			if string(payload) != "payload" {
				t.Errorf("promoted file contents = %q, want %q", string(payload), "payload")
			}
			marker, readErr := memFS.ReadFile(afterInstallMarker)
			if readErr != nil {
				t.Fatalf("after-install did not run: %v", readErr)
			}
			if string(marker) != currentDir {
				t.Errorf("after-install installedDir = %q, want %q", string(marker), currentDir)
			}
			if record == nil {
				t.Errorf("successful install was not recorded")
			}
		})
	}
}

// A manual tool with binaryPath pointing to {stagingDir}/... relies on its before-install
// hook to stage the binary. During install, {stagingDir} must resolve to .staging rather
// than current, and after promotion .staging is renamed to current and the shim generated.
func TestInstallTool_ManualHookStagingWithBinaryPath(t *testing.T) {
	t.Parallel()
	const toolName = "staged-tool"
	stagingDir := "/home/user/.generated/binaries/" + toolName + "/.staging"
	currentDir := "/home/user/.generated/binaries/" + toolName + "/current"
	afterInstallMarker := "/home/user/markers/after-install"

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
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

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

	toolPath := filepath.Join(t.TempDir(), toolName+".tool.ts")
	body := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install, ctx) =>
			install("manual", { binaryPath: ctx.stagingDir + "/payload/staged-tool" })
				.bin("staged-tool")
				.hook("before-install", async ({ stagingDir, fileSystem }) => {
					await fileSystem.mkdir(stagingDir + "/payload", { recursive: true });
					await fileSystem.writeFile(stagingDir + "/payload/staged-tool", "#!/bin/sh\necho staged\n");
				})
				.hook("after-install", async ({ installedDir, fileSystem }) => {
					await fileSystem.mkdir("/home/user/markers", { recursive: true });
					await fileSystem.writeFile("/home/user/markers/after-install", installedDir);
				}),
		);
	`
	if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}

	tool := &config.ToolConfig{
		Name:               toolName,
		ConfigFilePath:     toolPath,
		InstallationMethod: "manual",
		Binaries:           []interface{}{map[string]interface{}{"name": "staged-tool"}},
		InstallParams: map[string]interface{}{
			"binaryPath": "{stagingDir}/payload/staged-tool",
			"hooks":      []any{"before-install", "after-install"},
		},
	}

	err = orch.InstallTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	if stagingExists, _ := memFS.Exists(stagingDir); stagingExists {
		t.Errorf("staging directory %s was left behind", stagingDir)
	}
	currentExists, _ := memFS.Exists(currentDir)
	if !currentExists {
		t.Fatalf("current directory %s does not exist", currentDir)
	}

	binaryContent, readErr := memFS.ReadFile(filepath.Join(currentDir, "staged-tool"))
	if readErr != nil {
		t.Fatalf("reading promoted binary: %v", readErr)
	}
	if string(binaryContent) != "#!/bin/sh\necho staged\n" {
		t.Errorf("binary content = %q, want %q", string(binaryContent), "#!/bin/sh\necho staged\n")
	}

	marker, readErr := memFS.ReadFile(afterInstallMarker)
	if readErr != nil {
		t.Fatalf("after-install marker not found: %v", readErr)
	}
	if string(marker) != currentDir {
		t.Errorf("after-install installedDir = %q, want %q", string(marker), currentDir)
	}

	record, recordErr := reg.GetToolInstallation(ctx, toolName)
	if recordErr != nil || record == nil {
		t.Fatalf("reading installation record: %v", recordErr)
	}
}

func TestBuildHookEnv(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()
	reg := registry.NewRegistry(database)

	instReg := installer.NewRegistry()
	inst := &mockInstaller{
		name:     "custom",
		binaries: []string{"/home/test/.binaries/my-tool/current/my-tool", "nested/sub-bin"},
	}
	_ = instReg.Register(inst)

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

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

	tool := &config.ToolConfig{
		Name:               "my-tool",
		InstallationMethod: "custom",
		ConfigFilePath:     "/home/test/dotfiles/tools/my-tool.tool.ts",
		Binaries:           testutil.DeclaredBinaries("my-tool"),
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Env: map[string]string{
					"CUSTOM_TOOL_ENV": "active-zsh",
				},
			},
			Bash: &config.ShellTypeConfig{
				Env: map[string]string{
					"CUSTOM_BASH_ENV": "active-bash",
				},
			},
		},
	}

	// 1. Test buildHookEnv
	res := &installer.InstallResult{
		Binaries: []string{
			"/home/test/.binaries/my-tool/current/my-tool",
			"nested/sub-bin",
		},
	}

	envSlice := orch.buildHookEnv(tool, projCfg, res)
	envMap := make(map[string]string)
	for _, kv := range envSlice {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}

	// PATH verification
	pathVal, hasPath := envMap["PATH"]
	if !hasPath {
		t.Fatalf("buildHookEnv output missing PATH")
	}

	toolDestDir := "/home/test/.binaries/my-tool/current"
	targetDir := "/home/test/.bin"
	nestedDir := "/home/test/.binaries/my-tool/current/nested"

	if !strings.Contains(pathVal, toolDestDir) {
		t.Errorf("expected PATH to contain toolDestDir %q, got: %s", toolDestDir, pathVal)
	}
	if !strings.Contains(pathVal, targetDir) {
		t.Errorf("expected PATH to contain targetDir %q, got: %s", targetDir, pathVal)
	}
	if !strings.Contains(pathVal, nestedDir) {
		t.Errorf("expected PATH to contain nestedDir %q, got: %s", nestedDir, pathVal)
	}
	if !strings.Contains(pathVal, "/opt/homebrew/bin") {
		t.Errorf("expected PATH to contain /opt/homebrew/bin, got: %s", pathVal)
	}

	// Tool shell env vars verification
	if envMap["CUSTOM_TOOL_ENV"] != "active-zsh" {
		t.Errorf("expected CUSTOM_TOOL_ENV=active-zsh, got %q", envMap["CUSTOM_TOOL_ENV"])
	}
	if envMap["CUSTOM_BASH_ENV"] != "active-bash" {
		t.Errorf("expected CUSTOM_BASH_ENV=active-bash, got %q", envMap["CUSTOM_BASH_ENV"])
	}

	// Nil safety checks
	nilEnv := orch.buildHookEnv(nil, nil, nil)
	if len(nilEnv) == 0 {
		t.Errorf("expected non-empty env even with nil params")
	}
}
