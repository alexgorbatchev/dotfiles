package vm

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
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
	_, err = evaluateUnifiedBundle(log, memFS, "var x = 1;", "/cfg", "/gen", "/bin")
	if err == nil || !strings.Contains(err.Error(), "missing or undefined") {
		t.Errorf("expected missing __loaderResult error, got %v", err)
	}

	// 5. Evaluate unified bundle with unmarshal error
	_, err = evaluateUnifiedBundle(log, memFS, "var __loaderResult = 12345;", "/cfg", "/gen", "/bin")
	if err == nil || !strings.Contains(err.Error(), "unmarshaling loader result") {
		t.Errorf("expected unmarshaling loader result error, got %v", err)
	}
}

func TestFindToolConfigFilesAndDirExists(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. dirExists on non-existent dir
	exists, err := dirExists(filepath.Join(tmpDir, "nonexistent"))
	if err != nil || exists {
		t.Errorf("dirExists(nonexistent) = (%v, %v), want (false, nil)", exists, err)
	}

	// 2. dirExists on a file
	filePath := filepath.Join(tmpDir, "afile.txt")
	_ = os.WriteFile(filePath, []byte("file"), 0644)
	exists, err = dirExists(filePath)
	if err != nil || exists {
		t.Errorf("dirExists(file) = (%v, %v), want (false, nil)", exists, err)
	}

	// 3. dirExists on a valid directory
	dirPath := filepath.Join(tmpDir, "sub")
	_ = os.MkdirAll(dirPath, 0755)
	exists, err = dirExists(dirPath)
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
	_, err = dirExists("\x00invalid")
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
	_, err := evaluateProjectConfig(log, memFS, "throw new Error('fail');", "/cfg")
	if err == nil || !strings.Contains(err.Error(), "executing script") {
		t.Errorf("expected executing script error, got %v", err)
	}

	// 2. Unmarshal error
	_, err = evaluateProjectConfig(log, memFS, "module.exports = 12345;", "/cfg")
	if err == nil || !strings.Contains(err.Error(), "unmarshaling JSON") {
		t.Errorf("expected unmarshaling error, got %v", err)
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

	if len(toolMap) != 2 {
		t.Errorf("expected 2 tools in toolMap, got %d", len(toolMap))
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
