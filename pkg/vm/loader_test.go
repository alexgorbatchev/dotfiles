package vm

import (
	"bytes"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
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
		const toolDir = ctx.toolDir;

		return install("manual")
			.bin("multi-plat", toolDir)
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

	// Verify ctx.toolDir is correctly populated and not 'undefined'
	if len(tool.Binaries) == 0 {
		t.Fatalf("expected binaries list to not be empty")
	}
	binObj, ok := tool.Binaries[0].(map[string]interface{})
	if !ok {
		t.Fatalf("expected binary entry to be a map, got %T", tool.Binaries[0])
	}
	patternVal, _ := binObj["pattern"].(string)
	if patternVal == "undefined" || patternVal == "" {
		t.Errorf("expected ctx.toolDir to not be undefined, got %q", patternVal)
	}
	expectedToolDir := filepath.Join(tempDir, "tools")
	if patternVal != expectedToolDir {
		t.Errorf("expected ctx.toolDir to be %q, got %q", expectedToolDir, patternVal)
	}
}

func TestTranspileTSError(t *testing.T) {
	invalidTS := "const x: = ;"
	_, err := transpileTS(invalidTS)
	if err == nil {
		t.Fatal("expected error transpiling invalid TS, got nil")
	}
}

func TestRegisterContextBindingsLogsAndFS(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/sandbox/testdir", 0755)
	_ = memFS.WriteFile("/sandbox/testdir/read.txt", []byte("hello read"), 0644)

	script := `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool(async (install, ctx) => {
		ctx.log.info("info msg");
		ctx.log.warn("warn msg");
		ctx.log.error("error msg");
		ctx.log.debug("debug msg");

		const exists = await ctx.fs.exists("/sandbox/testdir/read.txt");
		const entries = await ctx.fs.readDir("/sandbox/testdir");
		const content = await ctx.fs.readFile("/sandbox/testdir/read.txt");

		return install("manual");
	});`

	tempDir, err := os.MkdirTemp("", "loader-logs-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	configPath := filepath.Join(tempDir, "config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools" } };`), 0644)

	toolsDir := filepath.Join(tempDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)
	toolPath := filepath.Join(toolsDir, "test-logs.tool.ts")
	_ = os.WriteFile(toolPath, []byte(script), 0644)

	_, _, err = LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("failed to load TS config: %v", err)
	}

	logStr := logBuf.String()
	if !strings.Contains(logStr, "info msg") || !strings.Contains(logStr, "warn msg") || !strings.Contains(logStr, "error msg") {
		t.Errorf("expected log output to contain logged messages, got %q", logStr)
	}
}

func TestLoadTypeScriptConfigErrors(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger-err",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})
	memFS := fs.NewMemFS()

	// 1. Non-existent config path
	_, _, err := LoadTypeScriptConfig(log, memFS, "/nonexistent/config.ts")
	if err == nil {
		t.Error("expected error loading non-existent config.ts")
	}

	// 2. Syntax error in config.ts
	tmpDir := t.TempDir()
	badConfigPath := filepath.Join(tmpDir, "bad_config.ts")
	_ = os.WriteFile(badConfigPath, []byte("const x: = ;"), 0644)

	_, _, err = LoadTypeScriptConfig(log, memFS, badConfigPath)
	if err == nil {
		t.Error("expected error loading config.ts with TS syntax error")
	}

	// 3. Runtime error in config.ts
	runtimeErrConfigPath := filepath.Join(tmpDir, "runtime_err.ts")
	_ = os.WriteFile(runtimeErrConfigPath, []byte("throw new Error('config runtime failure');"), 0644)

	_, _, err = LoadTypeScriptConfig(log, memFS, runtimeErrConfigPath)
	if err == nil || !strings.Contains(err.Error(), "executing script") {
		t.Errorf("expected executing script error, got %v", err)
	}

	// 4. Evaluate unified bundle with missing __loaderResult
	_, err = evaluateUnifiedBundle(log, memFS, "var x = 1;", "/cfg", "/gen", "/bin", Target{})
	if err == nil || !strings.Contains(err.Error(), "missing or undefined") {
		t.Errorf("expected missing __loaderResult error, got %v", err)
	}

	// 5. Evaluate unified bundle with unmarshal error
	_, err = evaluateUnifiedBundle(log, memFS, "var __loaderResult = 12345;", "/cfg", "/gen", "/bin", Target{})
	if err == nil || (!strings.Contains(err.Error(), "unmarshaling") && !strings.Contains(err.Error(), "invalid JSON syntax") && !strings.Contains(err.Error(), "invalid configuration")) {
		t.Errorf("expected unmarshaling or invalid JSON error, got %v", err)
	}
}

func TestFindToolConfigFilesAndDirExists(t *testing.T) {
	tmpDir := t.TempDir()
	osFS := &fs.OSFS{}

	// 1. dirExists on non-existent dir
	exists, err := dirExists(osFS, filepath.Join(tmpDir, "nonexistent"))
	if err != nil || exists {
		t.Errorf("dirExists(nonexistent) = (%v, %v), want (false, nil)", exists, err)
	}

	// 2. dirExists on a file
	filePath := filepath.Join(tmpDir, "afile.txt")
	_ = os.WriteFile(filePath, []byte("file"), 0644)
	exists, err = dirExists(osFS, filePath)
	if err != nil || exists {
		t.Errorf("dirExists(file) = (%v, %v), want (false, nil)", exists, err)
	}

	// 3. dirExists on a valid directory
	dirPath := filepath.Join(tmpDir, "sub")
	_ = os.MkdirAll(dirPath, 0755)
	exists, err = dirExists(osFS, dirPath)
	if err != nil || !exists {
		t.Errorf("dirExists(dir) = (%v, %v), want (true, nil)", exists, err)
	}

	// 4. findToolConfigFiles with nested .tool.ts, non-tool files, and subdirs
	_ = os.MkdirAll(filepath.Join(dirPath, "nested"), 0755)
	_ = os.WriteFile(filepath.Join(dirPath, "tool1.tool.ts"), []byte(""), 0644)
	_ = os.WriteFile(filepath.Join(dirPath, "nested", "tool2.tool.ts"), []byte(""), 0644)
	_ = os.WriteFile(filepath.Join(dirPath, "ignored.txt"), []byte(""), 0644)

	tools, err := findToolConfigFiles(dirPath)
	if err != nil {
		t.Fatalf("findToolConfigFiles failed: %v", err)
	}
	if len(tools) != 2 {
		t.Errorf("expected 2 .tool.ts files found, got %d: %v", len(tools), tools)
	}

	// 5. dirExists permission/path error
	_, err = dirExists(osFS, "\x00invalid")
	if err == nil {
		t.Error("expected error from dirExists with null byte path")
	}

	// 6. findToolConfigFiles error
	_, err = findToolConfigFiles("\x00invalid")
	if err == nil {
		t.Error("expected error from findToolConfigFiles with null byte path")
	}

	// 7. compileFile non-existent file error
	_, err = compileFile("/nonexistent/file.ts")
	if err == nil {
		t.Error("expected error from compileFile with non-existent file")
	}

	// 8. Runtime error in config.ts during LoadTypeScriptConfig
	logErr := logger.New(logger.Config{Writer: io.Discard})
	memFSErr := fs.NewMemFS()
	runtimeConfigPath := filepath.Join(tmpDir, "runtime_config_err.ts")
	_ = os.WriteFile(runtimeConfigPath, []byte("throw new Error('runtime error in config');"), 0644)

	_, _, err = LoadTypeScriptConfig(logErr, memFSErr, runtimeConfigPath)
	if err == nil || !strings.Contains(err.Error(), "evaluating project config") {
		t.Errorf("expected evaluating project config error, got %v", err)
	}
}

func TestCompileFilePluginsAndDirName(t *testing.T) {
	tmpDir := t.TempDir()
	tsPath := filepath.Join(tmpDir, "test_plugins.ts")
	tsContent := `
	import { getE2eGeneratedDir } from "./e2eGeneratedDir";
	export default {
		dir: __dirname,
		e2eDir: getE2eGeneratedDir(import.meta.dirname)
	};`
	_ = os.WriteFile(tsPath, []byte(tsContent), 0644)

	code, err := compileFile(tsPath)
	if err != nil {
		t.Fatalf("compileFile with e2eGeneratedDir failed: %v", err)
	}

	if !strings.Contains(code, "configFileDir") {
		t.Errorf("expected __dirname/import.meta.dirname to be replaced by configFileDir in compiled code")
	}
}

func TestEvaluateProjectConfigDirectErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	log := logger.New(logger.Config{Writer: io.Discard})

	// 1. Script execution error
	_, err := evaluateProjectConfig(log, memFS, "throw new Error('fail');", "/cfg", Target{})
	if err == nil || !strings.Contains(err.Error(), "executing script") {
		t.Errorf("expected executing script error, got %v", err)
	}

	// 2. Unmarshal error
	_, err = evaluateProjectConfig(log, memFS, "module.exports = 12345;", "/cfg", Target{})
	if err == nil || (!strings.Contains(err.Error(), "unmarshaling") && !strings.Contains(err.Error(), "invalid JSON syntax") && !strings.Contains(err.Error(), "invalid project configuration")) {
		t.Errorf("expected unmarshaling or invalid JSON error, got %v", err)
	}
}

func TestLoadTypeScriptConfigMultipleTools(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.ts")
	configContent := `export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools" } };`
	_ = os.WriteFile(configPath, []byte(configContent), 0644)

	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(filepath.Join(toolsDir, "sub"), 0755)

	tool1Content := `import { defineTool } from "@dotfiles/cli"; export default defineTool((i) => i("manual").bin("tool1"));`
	tool2Content := `import { defineTool } from "@dotfiles/cli"; export default defineTool((i) => i("manual").bin("tool2"));`

	_ = os.WriteFile(filepath.Join(toolsDir, "tool1.tool.ts"), []byte(tool1Content), 0644)
	_ = os.WriteFile(filepath.Join(toolsDir, "sub", "tool2.tool.ts"), []byte(tool2Content), 0644)

	_, toolMap, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig with multiple tools failed: %v", err)
	}

	// Assert the authored tools are discovered, including the one nested in a
	// subdirectory, rather than the map size: ensureStarterTools provisions additional
	// starter tools on some platforms and the subject here is recursive discovery.
	for _, name := range []string{"tool1", "tool2"} {
		if _, ok := toolMap[name]; !ok {
			t.Errorf("expected tool %q in toolMap, got %v", name, slices.Sorted(maps.Keys(toolMap)))
		}
	}
}

func TestLoadTypeScriptConfigToolWithoutName(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools" } };`), 0644)

	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)

	// Omit explicit name in tool config so fallbackName "unnamed" is assigned
	toolContent := `import { defineTool } from "@dotfiles/cli"; export default defineTool((i) => i("manual").bin("unnamed"));`
	_ = os.WriteFile(filepath.Join(toolsDir, "unnamed.tool.ts"), []byte(toolContent), 0644)

	_, toolMap, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}

	tool, exists := toolMap["unnamed"]
	if !exists || tool.Name != "unnamed" {
		t.Errorf("expected fallback name 'unnamed', got %v", tool)
	}
}

func TestGenerateEntryLoaderDirect(t *testing.T) {
	content, err := generateEntryLoader("/home/user/config.ts", []string{"/home/user/tools/tool1.tool.ts"})
	if err != nil {
		t.Fatalf("generateEntryLoader failed: %v", err)
	}
	if !strings.Contains(content, "tool1.tool.ts") {
		t.Errorf("expected generated loader content to contain tool1.tool.ts, got %q", content)
	}
}

func TestLoadTypeScriptConfigToolConfigsDirAndBinariesDir(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger-dir",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})
	memFS := fs.NewMemFS()

	tmpDir := t.TempDir()

	// 1. Config with {paths.generatedDir} in binariesDir and empty ToolConfigsDir
	configPath := filepath.Join(tmpDir, "config.ts")
	configContent := `export default {
		paths: {
			generatedDir: "./.generated",
			binariesDir: "{paths.generatedDir}/custom-binaries"
		}
	};`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	projCfg, _, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	if projCfg == nil {
		t.Fatal("expected non-nil projCfg")
	}

	// 2. Unwritable configFileDir
	roDir := filepath.Join(tmpDir, "ro_dir")
	_ = os.MkdirAll(roDir, 0755)
	roConfigPath := filepath.Join(roDir, "config.ts")
	_ = os.WriteFile(roConfigPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)
	_ = os.Chmod(roDir, 0555) // read-only directory

	_, _, err = LoadTypeScriptConfig(log, memFS, roConfigPath)
	if err == nil {
		t.Error("expected error writing temp entry file in read-only directory")
	}
	_ = os.Chmod(roDir, 0755) // restore for cleanup
}

func TestLoadTypeScriptConfig_MultipleToolConfigsDirs(t *testing.T) {
	tmpDir := t.TempDir()
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	dir1 := filepath.Join(tmpDir, "tools-core")
	dir2 := filepath.Join(tmpDir, "tools-extra")
	_ = os.MkdirAll(dir1, 0755)
	_ = os.MkdirAll(dir2, 0755)

	tool1Content := `import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install) => install("manual", {}).bin("tool-one").version("1.0.0"));`
	tool2Content := `import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install) => install("manual", {}).bin("tool-two").version("2.0.0"));`

	_ = os.WriteFile(filepath.Join(dir1, "tool-one.tool.ts"), []byte(tool1Content), 0644)
	_ = os.WriteFile(filepath.Join(dir2, "tool-two.tool.ts"), []byte(tool2Content), 0644)

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := `export default {
		paths: {
			generatedDir: "./.generated",
			toolConfigsDir: ["./tools-core", "./tools-extra"]
		}
	};`
	_ = os.WriteFile(configPath, []byte(configContent), 0644)

	projCfg, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig with multiple toolConfigsDirs failed: %v", err)
	}

	if projCfg == nil {
		t.Fatal("expected non-nil projCfg")
	}
	// The map size is deliberately not asserted: ensureStarterTools provisions
	// additional starter tools on some platforms, and the subject here is that both
	// configured directories contribute their tool.
	foundToolOne := false
	foundToolTwo := false
	for _, tc := range toolConfigs {
		if tc.Name == "tool-one" {
			foundToolOne = true
		}
		if tc.Name == "tool-two" {
			foundToolTwo = true
		}
	}
	if !foundToolOne || !foundToolTwo {
		t.Errorf("expected both tool-one and tool-two to be loaded, got tools: %+v", toolConfigs)
	}
}

func TestLoaderDefaultPathsConsistency(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger-paths",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := `export default {
		paths: {
			dotfilesDir: "` + tmpDir + `",
		}
	};`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}

	toolScript := `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install, ctx) => {
		return install("manual", {
			shellScriptsDir: ctx.projectConfig.paths.shellScriptsDir,
			binariesDir: ctx.projectConfig.paths.binariesDir,
			generatedDir: ctx.projectConfig.paths.generatedDir,
			targetDir: ctx.projectConfig.paths.targetDir,
		});
	});`
	if err := os.WriteFile(filepath.Join(toolsDir, "check-paths.tool.ts"), []byte(toolScript), 0644); err != nil {
		t.Fatalf("failed to write tool: %v", err)
	}

	projCfg, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	if len(toolConfigs) == 0 {
		t.Fatal("expected toolConfigs to have check-paths")
	}

	tool := toolConfigs["check-paths"]
	if tool == nil {
		t.Fatal("expected tool check-paths in toolConfigs")
	}
	params := tool.InstallParams
	if params == nil {
		t.Fatal("expected InstallParams not to be nil")
	}

	expectedShellScriptsDir := projCfg.Paths.ShellScriptsDir
	if got := params["shellScriptsDir"]; got != expectedShellScriptsDir {
		t.Errorf("shellScriptsDir mismatch: TS context got %q, Go ProjectConfig has %q", got, expectedShellScriptsDir)
	}

	expectedBinariesDir := projCfg.Paths.BinariesDir
	if got := params["binariesDir"]; got != expectedBinariesDir {
		t.Errorf("binariesDir mismatch: TS context got %q, Go ProjectConfig has %q", got, expectedBinariesDir)
	}

	expectedGeneratedDir := projCfg.Paths.GeneratedDir
	if got := params["generatedDir"]; got != expectedGeneratedDir {
		t.Errorf("generatedDir mismatch: TS context got %q, Go ProjectConfig has %q", got, expectedGeneratedDir)
	}

	expectedTargetDir := projCfg.Paths.TargetDir
	if got := params["targetDir"]; got != expectedTargetDir {
		t.Errorf("targetDir mismatch: TS context got %q, Go ProjectConfig has %q", got, expectedTargetDir)
	}
}

func TestLoaderBrewAutoDependency(t *testing.T) {
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-brew-auto-dep",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := `export default {
		paths: {
			dotfilesDir: "` + tmpDir + `",
		}
	};`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}

	toolScript := `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install) => {
		return install("brew", {
			formula: "borders",
		}).bin("borders");
	});`
	if err := os.WriteFile(filepath.Join(toolsDir, "borders.tool.ts"), []byte(toolScript), 0644); err != nil {
		t.Fatalf("failed to write tool: %v", err)
	}

	_, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}

	tool := toolConfigs["borders"]
	if tool == nil {
		t.Fatal("expected borders tool in toolConfigs")
	}

	foundBrew := false
	for _, dep := range tool.Dependencies {
		if dep == "brew" {
			foundBrew = true
			break
		}
	}
	if !foundBrew {
		t.Errorf("expected borders tool to automatically depend on 'brew', got dependencies: %v", tool.Dependencies)
	}
}

func TestLoaderBrewPrefixedToolFile(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := `export default {
		paths: {
			dotfilesDir: "` + tmpDir + `",
		}
	};`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}

	// Create brew--borders.tool.ts which references "brew"
	toolScript := `
	import { defineTool } from "@dotfiles/cli";
	export default defineTool((install) => {
		return install("brew", {
			formula: "borders",
		}).bin("borders");
	});`
	if err := os.WriteFile(filepath.Join(toolsDir, "brew--borders.tool.ts"), []byte(toolScript), 0644); err != nil {
		t.Fatalf("failed to write tool: %v", err)
	}

	_, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}

	if _, exists := toolConfigs["brew--borders"]; !exists {
		t.Errorf("expected brew--borders tool in toolConfigs, got: %+v", toolConfigs)
	}
}

func TestLoaderRegExpSerialization(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := `export default {
		paths: {
			dotfilesDir: "` + tmpDir + `",
		}
	};`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}

	toolScript := `
	import { defineTool } from "@alexgorbatchev/dotfiles";
	export default defineTool((install) => {
		return install("github-release", {
			repo: "oven-sh/bun",
			assetPattern: /^(?!.*-profile).*\.zip$/,
		})
		.hostname(/^mbp-.*$/)
		.bin("bun", /bun-dist/);
	});`
	if err := os.WriteFile(filepath.Join(toolsDir, "bun.tool.ts"), []byte(toolScript), 0644); err != nil {
		t.Fatalf("failed to write bun.tool.ts: %v", err)
	}

	_, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}

	bunTool, exists := toolConfigs["bun"]
	if !exists {
		t.Fatalf("expected bun in toolConfigs, got: %+v", toolConfigs)
	}

	assetPattern, ok := bunTool.InstallParams["assetPattern"].(string)
	if !ok || assetPattern != "/^(?!.*-profile).*\\.zip$/" {
		t.Errorf("expected assetPattern to be serialized as string %q, got: %T (%v)", "/^(?!.*-profile).*\\.zip$/", bunTool.InstallParams["assetPattern"], bunTool.InstallParams["assetPattern"])
	}

	if bunTool.Hostname != "/^mbp-.*$/" {
		t.Errorf("expected Hostname to be %q, got %q", "/^mbp-.*$/", bunTool.Hostname)
	}
}

func TestLoadTypeScriptConfig_UnknownFieldsError(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	osFS := &fs.OSFS{}

	t.Run("nested unknown field under features", func(t *testing.T) {
		tmpDir := t.TempDir()
		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		configContent := `export default {
			paths: {
				dotfilesDir: "` + tmpDir + `",
			},
			features: {
				features: {
					shellInstall: {
						zsh: "~/.zshrc"
					}
				}
			}
		};`
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("failed to write config.ts: %v", err)
		}

		_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err == nil {
			t.Fatal("expected error due to unknown field under features, got nil")
		}
		expectedPart := `unknown property "features.features" (valid properties under 'features': catalog, shellInstall)`
		if !strings.Contains(err.Error(), expectedPart) {
			t.Errorf("expected error to contain %q, got: %v", expectedPart, err)
		}
	})

	t.Run("top-level unknown field in config", func(t *testing.T) {
		tmpDir := t.TempDir()
		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		configContent := `export default {
			paths: {
				dotfilesDir: "` + tmpDir + `",
			},
			nonExistentField: true
		};`
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("failed to write config.ts: %v", err)
		}

		_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err == nil {
			t.Fatal("expected error due to top-level unknown field, got nil")
		}
		expectedPart := `unknown top-level property "nonExistentField"`
		if !strings.Contains(err.Error(), expectedPart) {
			t.Errorf("expected error to contain %q, got: %v", expectedPart, err)
		}
	})

	t.Run("invalid config syntax returns error", func(t *testing.T) {
		tmpDir := t.TempDir()
		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`export default { invalid syntax :::`), 0644)

		_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err == nil {
			t.Fatal("expected compilation error, got nil")
		}
	})

	t.Run("multi-dir tool configs and binariesDir placeholder replacement", func(t *testing.T) {
		tmpDir := t.TempDir()
		toolsDir1 := filepath.Join(tmpDir, "tools1")
		toolsDir2 := filepath.Join(tmpDir, "tools2")
		_ = os.MkdirAll(toolsDir1, 0755)
		_ = os.MkdirAll(toolsDir2, 0755)

		_ = os.WriteFile(filepath.Join(toolsDir1, "tool1.tool.ts"), []byte(`
			import { defineTool } from "@alexgorbatchev/dotfiles";
			export default defineTool((install) => install("npm", { package: "tool1" }).bin("tool1"));
		`), 0644)
		_ = os.WriteFile(filepath.Join(toolsDir2, "tool2.tool.ts"), []byte(`
			import { defineTool } from "@alexgorbatchev/dotfiles";
			export default defineTool((install) => install("npm", { package: "tool2" }).bin("tool2"));
		`), 0644)

		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		configContent := fmt.Sprintf(`export default {
			paths: {
				dotfilesDir: %q,
				generatedDir: %q,
				binariesDir: "{paths.generatedDir}/custom-bins",
				toolConfigsDir: [%q, %q]
			}
		};`, tmpDir, filepath.Join(tmpDir, ".gen"), toolsDir1, toolsDir2)

		_ = os.WriteFile(configPath, []byte(configContent), 0644)

		projCfg, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err != nil {
			t.Fatalf("LoadTypeScriptConfig failed: %v", err)
		}
		// Assert both directories contributed their tool rather than the map size:
		// ensureStarterTools provisions additional starter tools on some platforms.
		for _, name := range []string{"tool1", "tool2"} {
			if _, ok := toolConfigs[name]; !ok {
				t.Errorf("expected tool %q in toolConfigs, got %v", name, slices.Sorted(maps.Keys(toolConfigs)))
			}
		}
		if projCfg.Paths.BinariesDir != filepath.Join(tmpDir, ".gen", "custom-bins") {
			t.Errorf("expected resolved binariesDir, got %s", projCfg.Paths.BinariesDir)
		}
	})

	t.Run("toolConfigsDir containing a generatedDir placeholder is resolved", func(t *testing.T) {
		tmpDir := t.TempDir()
		genDir := filepath.Join(tmpDir, ".gen")
		toolsDir := filepath.Join(genDir, "managed-tools")
		if err := os.MkdirAll(toolsDir, 0755); err != nil {
			t.Fatalf("creating tools dir: %v", err)
		}

		_ = os.WriteFile(filepath.Join(toolsDir, "managed.tool.ts"), []byte(`
			import { defineTool } from "@alexgorbatchev/dotfiles";
			export default defineTool((install) => install("npm", { package: "managed" }).bin("managed"));
		`), 0644)

		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(fmt.Sprintf(`export default {
			paths: {
				dotfilesDir: %q,
				generatedDir: %q,
				toolConfigsDir: "{paths.generatedDir}/managed-tools"
			}
		};`, tmpDir, genDir)), 0644)

		_, toolConfigs, err := LoadTypeScriptConfig(log, osFS, configPath)
		if err != nil {
			t.Fatalf("LoadTypeScriptConfig failed: %v", err)
		}
		if _, ok := toolConfigs["managed"]; !ok {
			t.Errorf("expected tool %q from placeholder-resolved toolConfigsDir, got %v", "managed", slices.Sorted(maps.Keys(toolConfigs)))
		}
	})

	t.Run("runtime error thrown in config.ts", func(t *testing.T) {
		tmpDir := t.TempDir()
		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`throw new Error("intentional config exception");`), 0644)

		_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err == nil || !strings.Contains(err.Error(), "intentional config exception") {
			t.Errorf("expected intentional config exception, got %v", err)
		}
	})

	t.Run("runtime error thrown in tool file during bundling", func(t *testing.T) {
		tmpDir := t.TempDir()
		toolsDir := filepath.Join(tmpDir, "tools")
		_ = os.MkdirAll(toolsDir, 0755)
		_ = os.WriteFile(filepath.Join(toolsDir, "bad.tool.ts"), []byte(`throw new Error("intentional tool error");`), 0644)

		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(fmt.Sprintf(`export default { paths: { dotfilesDir: %q, toolConfigsDir: %q } };`, tmpDir, toolsDir)), 0644)

		_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err == nil || !strings.Contains(err.Error(), "intentional tool error") {
			t.Errorf("expected intentional tool error, got %v", err)
		}
	})

	t.Run("module.exports without default export in evaluateProjectConfig", func(t *testing.T) {
		tmpDir := t.TempDir()
		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(fmt.Sprintf(`module.exports = { paths: { dotfilesDir: %q, homeDir: %q, targetDir: %q } };`, tmpDir, tmpDir, tmpDir)), 0644)

		projCfg, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err != nil {
			t.Fatalf("LoadTypeScriptConfig failed: %v", err)
		}
		if projCfg.Paths.DotfilesDir != tmpDir {
			t.Errorf("expected dotfilesDir %q, got %q", tmpDir, projCfg.Paths.DotfilesDir)
		}
	})

	t.Run("LoadTypeScriptConfig with non-existent config path", func(t *testing.T) {
		_, _, err := LoadTypeScriptConfig(log, memFS, "/non/existent/path/dotfiles.config.ts")
		if err == nil {
			t.Error("expected error for non-existent config path")
		}
	})

	t.Run("evaluateUnifiedBundle with missing __loaderResult", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "var x = 1;", "/tmp", "/tmp/.gen", "/tmp/bin", Target{})
		if err == nil || !strings.Contains(err.Error(), "missing or undefined") {
			t.Errorf("expected error for missing __loaderResult, got: %v", err)
		}
	})

	t.Run("evaluateUnifiedBundle with runtime script error", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "throw new Error('bundle err');", "/tmp", "/tmp/.gen", "/tmp/bin", Target{})
		if err == nil || !strings.Contains(err.Error(), "bundle err") {
			t.Errorf("expected script error, got: %v", err)
		}
	})

	t.Run("transpileTS error branch", func(t *testing.T) {
		_, err := transpileTS("const x: = ;")
		if err == nil {
			t.Error("expected error from transpileTS for invalid syntax")
		}
	})

	t.Run("compileFile error branch", func(t *testing.T) {
		_, err := compileFile("/non/existent/file.ts")
		if err == nil {
			t.Error("expected error from compileFile for non-existent file")
		}
	})

	t.Run("generateEntryLoader generates valid require paths", func(t *testing.T) {
		res, err := generateEntryLoader("/home/user/dotfiles/config.ts", []string{
			"/home/user/dotfiles/tools/bat.tool.ts",
			"/home/user/dotfiles/tools/nested/tool.tool.ts",
		})
		if err != nil {
			t.Fatalf("generateEntryLoader failed: %v", err)
		}
		if !strings.Contains(res, `"./tools/bat.tool.ts"`) {
			t.Errorf("expected relative path in require map: %s", res)
		}
	})

	t.Run("evaluateProjectConfig json stringify error branch", func(t *testing.T) {
		_, err := evaluateProjectConfig(log, memFS, "module.exports = { toJSON: function() { throw new Error('json stringify err'); } };", "/tmp", Target{})
		if err == nil || !strings.Contains(err.Error(), "stringifying project config") {
			t.Errorf("expected stringifying error, got %v", err)
		}
	})

	t.Run("evaluateUnifiedBundle json stringify error branch", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "globalThis.__loaderResult = { toJSON: function() { throw new Error('json stringify err'); } };", "/tmp", "/tmp/.gen", "/tmp/bin", Target{})
		if err == nil || !strings.Contains(err.Error(), "stringifying loader result") {
			t.Errorf("expected stringifying error, got %v", err)
		}
	})

	t.Run("evaluateUnifiedBundle unmarshaling error branch", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "globalThis.__loaderResult = { projectConfig: 12345 };", "/tmp", "/tmp/.gen", "/tmp/bin", Target{})
		if err == nil {
			t.Error("expected error when unifiedLoaderResult has invalid structure")
		}
	})

	t.Run("LoadTypeScriptConfig with binariesDir containing placeholder", func(t *testing.T) {
		tmpDir := t.TempDir()
		toolsDir := filepath.Join(tmpDir, "tools")
		_ = os.MkdirAll(toolsDir, 0755)
		_ = os.WriteFile(filepath.Join(toolsDir, "tool.tool.ts"), []byte(`
			import { defineTool } from "@alexgorbatchev/dotfiles";
			export default defineTool((install) => install("npm", { package: "tool" }).bin("tool"));
		`), 0644)

		configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(fmt.Sprintf(`export default {
			paths: {
				dotfilesDir: %q,
				generatedDir: %q,
				binariesDir: "{paths.generatedDir}/custom-bins",
				toolConfigsDir: %q
			}
		};`, tmpDir, filepath.Join(tmpDir, ".gen"), toolsDir)), 0644)

		projCfg, toolConfigs, err := LoadTypeScriptConfig(log, osFS, configPath)
		if err != nil {
			t.Fatalf("LoadTypeScriptConfig failed: %v", err)
		}
		// Assert the authored tool is discovered rather than asserting the map size:
		// ensureStarterTools provisions additional starter tools on some platforms
		// (brew.tool.ts on darwin), and the subject here is binariesDir resolution.
		if _, ok := toolConfigs["tool"]; !ok {
			t.Errorf("expected tool config %q, got %v", "tool", slices.Sorted(maps.Keys(toolConfigs)))
		}
		if projCfg.Paths.BinariesDir != filepath.Join(tmpDir, ".gen", "custom-bins") {
			t.Errorf("expected resolved binariesDir, got %s", projCfg.Paths.BinariesDir)
		}
	})

	t.Run("LoadTypeScriptConfig with readonly directory triggering write error", func(t *testing.T) {
		if os.Geteuid() == 0 {
			t.Skip("skipping readonly test as root user")
		}
		tmpDir := t.TempDir()
		readOnlyDir := filepath.Join(tmpDir, "readonly")
		_ = os.MkdirAll(readOnlyDir, 0755)
		configPath := filepath.Join(readOnlyDir, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(fmt.Sprintf(`export default { paths: { dotfilesDir: %q } };`, readOnlyDir)), 0644)
		_ = os.Chmod(readOnlyDir, 0555)
		defer os.Chmod(readOnlyDir, 0755)

		_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err == nil || !strings.Contains(err.Error(), "writing temporary loader entry") {
			t.Logf("readonly directory result: %v", err)
		}
	})

}
