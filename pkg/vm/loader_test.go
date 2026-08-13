package vm

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestLoaderFileSystemWriteOperations(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/sandbox/tools", 0755)
	_ = memFS.WriteFile("/sandbox/tools/test-to-delete.txt", []byte("delete me"), 0644)

	script := `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool(async (install, ctx) => {
		await ctx.fs.writeFile("/sandbox/tools/written.txt", "written content");
		await ctx.fs.mkdir("/sandbox/tools/nested-dir");
		await ctx.fs.rm("/sandbox/tools/test-to-delete.txt");
		return install("manual");
	});`

	tempDir, err := os.MkdirTemp("", "loader-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	configPath := filepath.Join(tempDir, "config.ts")
	configContent := `export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools" } };`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolsDir := filepath.Join(tempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}

	toolPath := filepath.Join(toolsDir, "test-write.tool.ts")
	if err := os.WriteFile(toolPath, []byte(script), 0644); err != nil {
		t.Fatalf("failed to write test-write.tool.ts: %v", err)
	}

	_, _, err = LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("failed to load TS config: %v", err)
	}

	// 1. Verify written.txt
	writtenData, err := memFS.ReadFile("/sandbox/tools/written.txt")
	if err != nil {
		t.Errorf("expected written.txt to exist: %v", err)
	} else if string(writtenData) != "written content" {
		t.Errorf("expected written.txt content to be 'written content', got %q", string(writtenData))
	}

	// 2. Verify nested-dir
	dirExists, err := memFS.Exists("/sandbox/tools/nested-dir")
	if err != nil {
		t.Errorf("error checking if nested-dir exists: %v", err)
	} else if !dirExists {
		t.Errorf("expected nested-dir to exist on virtual FS")
	}

	// 3. Verify test-to-delete.txt
	deleteExists, err := memFS.Exists("/sandbox/tools/test-to-delete.txt")
	if err != nil {
		t.Errorf("error checking if deleted file exists: %v", err)
	} else if deleteExists {
		t.Errorf("expected test-to-delete.txt to be removed, but it still exists")
	}
}

func TestLoaderAPIFeatures(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()

	script := `
	import { defineTool, dedentString, Platform, Architecture } from "@dotfiles/cli";

	export default defineTool((install, ctx) => {
		const formatted = dedentString` + "`" + `
			first line
			second line
		` + "`" + `;

		const genDir = ctx.projectConfig.paths.generatedDir;

		return install("manual")
			.bin("multi-plat", genDir)
			.platform(Platform.MacOS, (install) => install("brew", { formula: "mac-pkg" }))
			.platform(Platform.Linux, Architecture.Arm64, (install) => install("apt", { package: "linux-arm64-pkg" }))
			.platform(Platform.Linux, Architecture.X86_64, (install) => install("apt", { package: "linux-x64-pkg" }));
	});`

	tempDir, err := os.MkdirTemp("", "loader-api-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	configPath := filepath.Join(tempDir, "config.ts")
	configContent := `export default { paths: { generatedDir: "/custom/generated", toolConfigsDir: "./tools" } };`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolsDir := filepath.Join(tempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}

	toolPath := filepath.Join(toolsDir, "multi-plat.tool.ts")
	if err := os.WriteFile(toolPath, []byte(script), 0644); err != nil {
		t.Fatalf("failed to write multi-plat.tool.ts: %v", err)
	}

	projCfg, toolMap, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("failed to load TS config: %v", err)
	}

	if projCfg == nil {
		t.Fatal("expected non-nil projCfg")
	}

	tool, exists := toolMap["multi-plat"]
	if !exists {
		t.Fatalf("expected multi-plat tool to exist")
	}

	if tool.Disabled {
		t.Errorf("expected tool multi-plat to be enabled for current platform, but got disabled")
	}

	if tool.InstallationMethod == "" {
		t.Errorf("expected installationMethod to be set for current platform, got empty string")
	}
}
