package vm

import (
	"bytes"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
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
		const entries = await ctx.fs.readdir("/sandbox/testdir");
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
	_, err = evaluateUnifiedBundle(log, memFS, "var x = 1;", "/cfg", &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/gen", BinariesDir: "/bin"}}, Target{})
	if err == nil || !strings.Contains(err.Error(), "missing or undefined") {
		t.Errorf("expected missing __loaderResult error, got %v", err)
	}

	// 5. Evaluate unified bundle with unmarshal error
	_, err = evaluateUnifiedBundle(log, memFS, "var __loaderResult = 12345;", "/cfg", &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/gen", BinariesDir: "/bin"}}, Target{})
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
	if resolved, err := filepath.EvalSymlinks(tmpDir); err == nil {
		tmpDir = resolved
	}
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

	expectedDir := filepath.ToSlash(tmpDir)
	if !strings.Contains(code, expectedDir) {
		t.Errorf("expected __dirname/import.meta.dirname to be replaced by %q in compiled code, got: %s", expectedDir, code)
	}
}

func TestCompileFileLoadersForVariousExtensions(t *testing.T) {
	tmpDir := t.TempDir()
	if resolved, err := filepath.EvalSymlinks(tmpDir); err == nil {
		tmpDir = resolved
	}

	exts := []struct {
		ext     string
		content string
	}{
		{".js", "module.exports = { dir: __dirname };"},
		{".mjs", "export default { dir: __dirname };"},
		{".cjs", "module.exports = { dir: __dirname };"},
		{".tsx", "export const elem = <div>{__dirname}</div>;"},
		{".jsx", "export const elem = <div>{__dirname}</div>;"},
	}

	for _, tc := range exts {
		filePath := filepath.Join(tmpDir, "test"+tc.ext)
		if err := os.WriteFile(filePath, []byte(tc.content), 0644); err != nil {
			t.Fatalf("writing %s: %v", filePath, err)
		}
		code, err := compileFile(filePath)
		if err != nil {
			t.Errorf("compileFile(%s) failed: %v", filePath, err)
			continue
		}
		expectedDir := filepath.ToSlash(tmpDir)
		if !strings.Contains(code, expectedDir) {
			t.Errorf("compileFile(%s) did not contain %q in output: %s", filePath, expectedDir, code)
		}
	}
}

// TestLoadTypeScriptConfigToolDirnameMatchesToolFileDirectory verifies that __dirname and
// import.meta.dirname in a tool file resolve to the tool file's own directory, while in the
// configuration file they resolve to the configuration file's directory.
func TestLoadTypeScriptConfigToolDirnameMatchesToolFileDirectory(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tmpDir := t.TempDir()
	if resolved, err := filepath.EvalSymlinks(tmpDir); err == nil {
		tmpDir = resolved
	}
	configDir := tmpDir
	toolsDir := filepath.Join(tmpDir, "tools", "bat")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools directory: %v", err)
	}

	configPath := filepath.Join(configDir, "dotfiles.config.ts")
	configSource := `
		import { defineConfig } from "@alexgorbatchev/dotfiles";
		export default defineConfig(() => ({
			paths: {
				dotfilesDir: __dirname,
				generatedDir: import.meta.dirname + "/.generated",
				toolConfigsDir: "./tools",
			},
		}));
	`
	if err := os.WriteFile(configPath, []byte(configSource), 0644); err != nil {
		t.Fatalf("writing config file: %v", err)
	}

	toolPath := filepath.Join(toolsDir, "bat.tool.ts")
	toolSource := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual", {
				binaryPath: __dirname + "/bin/bat",
				importMetaDir: import.meta.dirname,
			}).bin("bat"),
		);
	`
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}

	projCfg, toolCfgs, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}

	// In dotfiles.config.ts, __dirname and import.meta.dirname must resolve to configDir
	if projCfg.Paths.DotfilesDir != configDir {
		t.Errorf("dotfilesDir = %q, want configDir %q", projCfg.Paths.DotfilesDir, configDir)
	}
	if projCfg.Paths.GeneratedDir != filepath.Join(configDir, ".generated") {
		t.Errorf("generatedDir = %q, want %q", projCfg.Paths.GeneratedDir, filepath.Join(configDir, ".generated"))
	}

	// In bat.tool.ts, __dirname and import.meta.dirname must resolve to toolsDir
	tool, ok := toolCfgs["bat"]
	if !ok {
		t.Fatalf("expected tool 'bat' in toolCfgs, got: %v", toolCfgs)
	}
	gotBinaryPath, _ := tool.InstallParams["binaryPath"].(string)
	wantBinaryPath := filepath.ToSlash(filepath.Join(toolsDir, "bin", "bat"))
	if filepath.ToSlash(gotBinaryPath) != wantBinaryPath {
		t.Errorf("tool binaryPath = %q, want %q", gotBinaryPath, wantBinaryPath)
	}
	gotImportMetaDir, _ := tool.InstallParams["importMetaDir"].(string)
	wantImportMetaDir := filepath.ToSlash(toolsDir)
	if filepath.ToSlash(gotImportMetaDir) != wantImportMetaDir {
		t.Errorf("tool importMetaDir = %q, want %q", gotImportMetaDir, wantImportMetaDir)
	}
}

func TestEvaluateProjectConfigDirectErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	log := logger.New(logger.Config{Writer: io.Discard})

	// 1. Script execution error
	_, err := evaluateProjectConfig(log, memFS, "throw new Error('fail');", "/cfg/dotfiles.config.ts", Target{})
	if err == nil || !strings.Contains(err.Error(), "executing script") {
		t.Errorf("expected executing script error, got %v", err)
	}

	// 2. An export that is not a configuration object
	_, err = evaluateProjectConfig(log, memFS, "module.exports = 12345;", "/cfg/dotfiles.config.ts", Target{})
	if err == nil || !strings.Contains(err.Error(), "got the number 12345") {
		t.Errorf("expected the export to be refused by what it is, got %v", err)
	}

	// 3. A module the script took away
	_, err = evaluateProjectConfig(log, memFS, "module = undefined;", "/cfg/dotfiles.config.ts", Target{})
	if err == nil || !strings.Contains(err.Error(), "got no module") {
		t.Errorf("expected the missing module to be refused, got %v", err)
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

// TestLoaderShellScriptsKeepDeclarationOrder checks that sourceFile, source and
// sourceFunction are recorded in the same ordered scripts list as once and always,
// so the generator can emit them in the order the author called them.
func TestLoaderShellScriptsKeepDeclarationOrder(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.ts")
	configContent := `export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools" } };`
	_ = os.WriteFile(configPath, []byte(configContent), 0644)

	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)
	toolContent := `import { defineTool } from "@dotfiles/cli";
export default defineTool((install) =>
  install("manual")
    .bin("order-tool")
    .zsh((shell) =>
      shell
        .always("echo first")
        .sourceFile("init.zsh")
        .source("echo inline")
        .functions({ initTool: "echo init" })
        .sourceFunction("initTool")
        .once("echo once")
        .always("echo last"),
    ),
);`
	_ = os.WriteFile(filepath.Join(toolsDir, "order-tool.tool.ts"), []byte(toolContent), 0644)

	_, toolMap, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	tool, ok := toolMap["order-tool"]
	if !ok || tool.ShellConfigs == nil || tool.ShellConfigs.Zsh == nil {
		t.Fatalf("expected order-tool with a zsh shell config, got %v", slices.Sorted(maps.Keys(toolMap)))
	}

	want := []config.ShellScript{
		{Kind: "always", Value: "echo first"},
		{Kind: "sourceFile", Value: "init.zsh"},
		{Kind: "source", Value: "echo inline"},
		{Kind: "sourceFunction", Value: "initTool"},
		{Kind: "once", Value: "echo once"},
		{Kind: "always", Value: "echo last"},
	}
	if got := tool.ShellConfigs.Zsh.Scripts; !slices.Equal(got, want) {
		t.Errorf("zsh scripts = %+v, want %+v", got, want)
	}
	if got := tool.ShellConfigs.Zsh.Functions["initTool"]; got != "echo init" {
		t.Errorf("functions[initTool] = %q, want %q", got, "echo init")
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

// A tool file that calls something the authoring DSL does not provide must be told
// which file and which method are at fault. Goja reports only a line and column into
// the bundle the loader generates, which exists on no disk and means nothing to the
// author of a .tool.ts file.
func TestLoadTypeScriptConfigNamesFailingToolFileAndMethod(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tests := []struct {
		name       string
		call       string
		wantMethod string
	}{
		{
			name:       "property that is not a method",
			call:       `.binaries(["a", "b"])`,
			wantMethod: ".binaries()",
		},
		{
			name:       "member the builder does not have at all",
			call:       `.notAMethod("a")`,
			wantMethod: ".notAMethod()",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			toolsDir := filepath.Join(tmpDir, "tools")
			if err := os.MkdirAll(toolsDir, 0755); err != nil {
				t.Fatalf("creating tools dir: %v", err)
			}

			toolPath := filepath.Join(toolsDir, "probe.tool.ts")
			toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";
				export default defineTool((install) => install("manual", { binaryPath: "/usr/bin/true" })` + tt.call + `);`
			if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
				t.Fatalf("writing tool file: %v", err)
			}

			configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
			configContent := fmt.Sprintf(`export default { paths: { dotfilesDir: %q, toolConfigsDir: %q } };`, tmpDir, toolsDir)
			if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
				t.Fatalf("writing config file: %v", err)
			}

			_, _, err := LoadTypeScriptConfig(log, memFS, configPath)
			if err == nil {
				t.Fatal("expected loading to fail, got nil error")
			}
			for _, want := range []string{toolPath, tt.wantMethod} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("expected error to name %q, got: %v", want, err)
				}
			}
		})
	}
}

// Dependencies decide installation order, so every name a tool declares has to reach
// the configuration. Both call forms the declarations allow are recorded in the order
// they were written.
func TestLoaderRecordsEveryDeclaredDependency(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tests := []struct {
		name string
		call string
	}{
		{name: "several arguments", call: `.dependsOn("ghost-one", "ghost-two")`},
		{name: "an array argument", call: `.dependsOn(["ghost-one", "ghost-two"])`},
		{name: "one call per dependency", call: `.dependsOn("ghost-one").dependsOn("ghost-two")`},
		{name: "several arguments to depends", call: `.depends("ghost-one", "ghost-two")`},
		{name: "an array argument to depends", call: `.depends(["ghost-one", "ghost-two"])`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			toolsDir := filepath.Join(tmpDir, "tools")
			if err := os.MkdirAll(toolsDir, 0755); err != nil {
				t.Fatalf("creating tools dir: %v", err)
			}

			toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";
				export default defineTool((install) => install("manual", { binaryPath: "/usr/bin/true" })` + tt.call + `);`
			if err := os.WriteFile(filepath.Join(toolsDir, "ghost.tool.ts"), []byte(toolContent), 0644); err != nil {
				t.Fatalf("writing tool file: %v", err)
			}

			configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
			configContent := fmt.Sprintf(`export default { paths: { dotfilesDir: %q, toolConfigsDir: %q } };`, tmpDir, toolsDir)
			if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
				t.Fatalf("writing config file: %v", err)
			}

			_, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
			if err != nil {
				t.Fatalf("LoadTypeScriptConfig failed: %v", err)
			}

			tool, ok := toolConfigs["ghost"]
			if !ok {
				t.Fatalf("expected tool %q, got %v", "ghost", slices.Sorted(maps.Keys(toolConfigs)))
			}
			want := []string{"ghost-one", "ghost-two"}
			if !slices.Equal(tool.Dependencies, want) {
				t.Errorf("expected dependencies %v, got %v", want, tool.Dependencies)
			}
		})
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
		_, err := evaluateUnifiedBundle(log, memFS, "var x = 1;", "/tmp", &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/tmp/.gen", BinariesDir: "/tmp/bin"}}, Target{})
		if err == nil || !strings.Contains(err.Error(), "missing or undefined") {
			t.Errorf("expected error for missing __loaderResult, got: %v", err)
		}
	})

	t.Run("evaluateUnifiedBundle with runtime script error", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "throw new Error('bundle err');", "/tmp", &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/tmp/.gen", BinariesDir: "/tmp/bin"}}, Target{})
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
		if strings.Contains(res, `import projConfig`) {
			t.Errorf("expected generateEntryLoader not to import project config: %s", res)
		}
	})

	t.Run("evaluateProjectConfig json stringify error branch", func(t *testing.T) {
		_, err := evaluateProjectConfig(log, memFS, "module.exports = { toJSON: function() { throw new Error('json stringify err'); } };", "/tmp", Target{})
		if err == nil || !strings.Contains(err.Error(), "stringifying project config") {
			t.Errorf("expected stringifying error, got %v", err)
		}
	})

	t.Run("evaluateUnifiedBundle json stringify error branch", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "globalThis.__loaderResult = { toJSON: function() { throw new Error('json stringify err'); } };", "/tmp", &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/tmp/.gen", BinariesDir: "/tmp/bin"}}, Target{})
		if err == nil || !strings.Contains(err.Error(), "stringifying loader result") {
			t.Errorf("expected stringifying error, got %v", err)
		}
	})

	t.Run("evaluateUnifiedBundle unmarshaling error branch", func(t *testing.T) {
		_, err := evaluateUnifiedBundle(log, memFS, "globalThis.__loaderResult = { toolConfigs: 12345 };", "/tmp", &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/tmp/.gen", BinariesDir: "/tmp/bin"}}, Target{})
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

// A tool factory branching on the machine reads systemInfo. homeDir is the project's
// own home rather than the invoking user's, so a tool writing a dotfile lands where the
// configuration says; hostname is what .hostname() matches against.
func TestLoaderToolContextSystemInfo(t *testing.T) {
	tmpDir := t.TempDir()
	log := logger.New(logger.Config{Writer: io.Discard})

	homeDir := filepath.Join(tmpDir, "sandboxed-home")
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := fmt.Sprintf(
		`export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools", homeDir: %q } };`,
		homeDir,
	)
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing the configuration: %v", err)
	}

	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating the tools directory: %v", err)
	}
	toolContent := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install, ctx) =>
			install("manual", {
				binaryPath: ctx.systemInfo.homeDir + "|" + ctx.systemInfo.hostname + "|" + ctx.systemInfo.os,
			}).bin("probe"),
		);
	`
	if err := os.WriteFile(filepath.Join(toolsDir, "probe.tool.ts"), []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	_, toolConfigs, err := LoadTypeScriptConfig(log, fs.NewMemFS(), configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	probe, ok := toolConfigs["probe"]
	if !ok {
		t.Fatalf("tool %q was not loaded", "probe")
	}
	got, _ := probe.InstallParams["binaryPath"].(string)

	hostname, err := os.Hostname()
	if err != nil {
		t.Fatalf("reading the hostname: %v", err)
	}
	parts := strings.Split(got, "|")
	if len(parts) != 3 {
		t.Fatalf("tool factory saw %q, want three systemInfo members", got)
	}
	if parts[0] != homeDir {
		t.Errorf("systemInfo.homeDir = %q, want the configured home %q", parts[0], homeDir)
	}
	if parts[1] != hostname {
		t.Errorf("systemInfo.hostname = %q, want %q", parts[1], hostname)
	}
	if parts[2] == "" {
		t.Errorf("systemInfo.os = %q, want it to stay populated", parts[2])
	}
}

// TestLoadTypeScriptConfigPathDefaults pins where a configuration that leaves paths
// out puts the files the CLI writes. Every paths setting has a default, and the one
// the rest hang off, dotfilesDir, defaults to the directory of the configuration
// file, never to the working directory of whatever command triggered the load.
func TestLoadTypeScriptConfigPathDefaults(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	tests := []struct {
		name          string
		configContent string
	}{
		{
			name:          "configuration setting nothing at all",
			configContent: "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\nexport default defineConfig(() => ({}));",
		},
		{
			// Defaulting is per key: a configuration naming one paths setting still
			// gets the default of every setting it left out, dotfilesDir included.
			name:          "configuration setting only keys that have defaults",
			configContent: "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\nexport default defineConfig(() => ({ paths: { toolConfigsDir: \"./tools\" }, system: { sudoPrompt: \"password:\" } }));",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
			if err := os.WriteFile(configPath, []byte(tt.configContent), 0644); err != nil {
				t.Fatalf("writing configuration: %v", err)
			}

			projCfg, _, err := LoadTypeScriptConfig(log, fs.NewMemFS(), configPath)
			if err != nil {
				t.Fatalf("LoadTypeScriptConfig failed: %v", err)
			}

			if projCfg.Paths.DotfilesDir != tmpDir {
				t.Errorf("dotfilesDir = %q, want the configuration file's directory %q", projCfg.Paths.DotfilesDir, tmpDir)
			}
			wantGenerated := filepath.Join(tmpDir, ".generated")
			if projCfg.Paths.GeneratedDir != wantGenerated {
				t.Errorf("generatedDir = %q, want %q", projCfg.Paths.GeneratedDir, wantGenerated)
			}
			for _, derived := range []struct {
				name string
				got  string
				want string
			}{
				{"targetDir", projCfg.Paths.TargetDir, filepath.Join(wantGenerated, "bin")},
				{"binariesDir", projCfg.Paths.BinariesDir, filepath.Join(wantGenerated, "binaries")},
				{"shellScriptsDir", projCfg.Paths.ShellScriptsDir, filepath.Join(wantGenerated, "shell-scripts")},
			} {
				if derived.got != derived.want {
					t.Errorf("%s = %q, want %q", derived.name, derived.got, derived.want)
				}
			}
			if projCfg.Paths.HomeDir == "" {
				t.Error("homeDir = \"\", want the account's home directory")
			}
		})
	}
}

// TestLoadTypeScriptConfigRejectsUnresolvablePath proves the loader validates the
// configuration it finished assembling. paths.homeDir is the one anchor path whose
// default comes from the environment rather than from another setting, so emptying
// every variable os.UserHomeDir consults leaves it with no value to resolve to.
func TestLoadTypeScriptConfigRejectsUnresolvablePath(t *testing.T) {
	// One variable per platform family, so the subject is exercised wherever the
	// test runs instead of only on the platform it was written on.
	for _, homeVar := range []string{"HOME", "USERPROFILE", "home"} {
		t.Setenv(homeVar, "")
	}

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\nexport default defineConfig(() => ({}));"
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing configuration: %v", err)
	}

	_, _, err := LoadTypeScriptConfig(logger.New(logger.Config{Writer: io.Discard}), fs.NewMemFS(), configPath)
	if err == nil {
		t.Fatal("expected the load to fail, got nil")
	}
	if !strings.Contains(err.Error(), "paths.homeDir is required") {
		t.Errorf("error = %v, want it to name paths.homeDir", err)
	}
}

// TestLoadTypeScriptConfigRefusesNonConfigurationExport proves a configuration file that
// does not export a configuration object is refused where the file is still known,
// naming it and what it exported, rather than being handed on as a nil configuration for
// a caller to dereference.
func TestLoadTypeScriptConfigRefusesNonConfigurationExport(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	tests := []struct {
		name   string
		source string
		want   string
	}{
		{"undefined default export", "export default undefined;", "got undefined"},
		{"null default export", "export default null;", "got null"},
		{"number default export", "export default 42;", "got the number 42"},
		{"string default export", "export default \"nope\";", "got the string \"nope\""},
		{"array default export", "export default [];", "got an array"},
		{"factory returning a function", "export default () => () => ({ paths: {} });", "got a function"},
		{"factory returning a number", "export default () => 42;", "got the number 42"},
		{"named exports only", "export const paths = { dotfilesDir: \"/x\" };", "got no default export"},
		{"nothing exported", "export {};", "got no default export"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			configPath := filepath.Join(t.TempDir(), "dotfiles.config.ts")
			if err := os.WriteFile(configPath, []byte(tt.source), 0644); err != nil {
				t.Fatalf("writing configuration: %v", err)
			}

			projCfg, toolCfgs, err := LoadTypeScriptConfig(log, fs.NewMemFS(), configPath)
			if err == nil {
				t.Fatalf("expected the load to fail, got projCfg = %+v", projCfg)
			}
			if projCfg != nil || toolCfgs != nil {
				t.Errorf("expected no configuration to be returned, got %+v and %+v", projCfg, toolCfgs)
			}
			if !strings.Contains(err.Error(), configPath) {
				t.Errorf("error = %v, want it to name %q", err, configPath)
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("error = %v, want it to report %q", err, tt.want)
			}
			if !strings.Contains(err.Error(), "export default defineConfig") {
				t.Errorf("error = %v, want it to say what the file must export", err)
			}
		})
	}
}

// TestLoadTypeScriptConfigReportsAsyncToolFactoryFailure proves an async tool factory
// that fails is reported the way the synchronous one is -- naming the tool file and the
// error -- rather than dropping the tool from the configuration without a word.
func TestLoadTypeScriptConfigReportsAsyncToolFactoryFailure(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	tests := []struct {
		name string
		body string
		want string
	}{
		{"factory rejects", "throw new Error(\"factory exploded\");", "factory exploded"},
		{"awaited call rejects", "await Promise.reject(new Error(\"awaited exploded\"));", "awaited exploded"},
		{"binding does not exist", "await ctx.fs.readDir(\"/sandbox\");", "readDir"},
		{"factory never settles", "await new Promise(() => {});", "never finished"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
			configSource := "export default { paths: { dotfilesDir: " + strconv.Quote(tmpDir) +
				", homeDir: " + strconv.Quote(tmpDir) + ", targetDir: " + strconv.Quote(tmpDir) +
				", toolConfigsDir: \"./tools\" } };"
			if err := os.WriteFile(configPath, []byte(configSource), 0644); err != nil {
				t.Fatalf("writing configuration: %v", err)
			}

			toolsDir := filepath.Join(tmpDir, "tools")
			if err := os.MkdirAll(toolsDir, 0755); err != nil {
				t.Fatalf("creating tools directory: %v", err)
			}
			toolPath := filepath.Join(toolsDir, "boom.tool.ts")
			toolSource := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
				"export default defineTool(async (install, ctx) => {\n" + tt.body + "\nreturn install(\"manual\");\n});"
			if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
				t.Fatalf("writing tool file: %v", err)
			}

			_, toolCfgs, err := LoadTypeScriptConfig(log, fs.NewMemFS(), configPath)
			if err == nil {
				t.Fatalf("expected the load to fail, got tools %v", slices.Sorted(maps.Keys(toolCfgs)))
			}
			if !strings.Contains(err.Error(), toolPath) {
				t.Errorf("error = %v, want it to name %q", err, toolPath)
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("error = %v, want it to report %q", err, tt.want)
			}
		})
	}
}

// configFactoryContextBody is a configuration built entirely out of the context a
// configuration factory receives, so that a factory which is never called, or is called
// with something other than that context, cannot produce the expected path.
const configFactoryContextBody = "({ paths: { dotfilesDir: ctx.configFileDir + \"/\" + ctx.systemInfo.os + \"/\" + ctx.systemInfo.arch } })"

// TestLoadTypeScriptConfigResolvesConfigurationFactory proves both factory forms reach
// Go as the configuration they produce: the promise an asynchronous factory returns is
// settled rather than serialized as an empty object, and a bare function default export
// is called with the same context defineConfig hands its callback.
func TestLoadTypeScriptConfigResolvesConfigurationFactory(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	const defineConfigImport = "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n"

	// The target is given rather than taken from the host so that the expected path is
	// the same on every platform.
	target := Target{OS: "linux", Arch: "arm64"}

	tests := []struct {
		name   string
		source string
		want   func(configFileDir string) string
	}{
		{
			name:   "async defineConfig factory",
			source: defineConfigImport + "export default defineConfig(async () => ({ paths: { dotfilesDir: await Promise.resolve(\"/resolved/dotfiles\") } }));",
			want:   func(string) string { return "/resolved/dotfiles" },
		},
		{
			name:   "async defineConfig factory reading its context",
			source: defineConfigImport + "export default defineConfig(async (ctx) => " + configFactoryContextBody + ");",
			want:   func(dir string) string { return dir + "/linux/arm64" },
		},
		{
			name:   "synchronous defineConfig factory reading its context",
			source: defineConfigImport + "export default defineConfig((ctx) => " + configFactoryContextBody + ");",
			want:   func(dir string) string { return dir + "/linux/arm64" },
		},
		{
			name:   "bare function default export reading its context",
			source: "export default (ctx) => " + configFactoryContextBody + ";",
			want:   func(dir string) string { return dir + "/linux/arm64" },
		},
		{
			name:   "bare async function default export reading its context",
			source: "export default async (ctx) => " + configFactoryContextBody + ";",
			want:   func(dir string) string { return dir + "/linux/arm64" },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
			if err := os.WriteFile(configPath, []byte(tt.source), 0644); err != nil {
				t.Fatalf("writing configuration: %v", err)
			}

			projCfg, _, err := LoadTypeScriptConfig(log, fs.NewMemFS(), configPath, WithTarget(target))
			if err != nil {
				t.Fatalf("LoadTypeScriptConfig failed: %v", err)
			}
			if want := tt.want(tmpDir); projCfg.Paths.DotfilesDir != want {
				t.Errorf("paths.dotfilesDir = %q, want %q", projCfg.Paths.DotfilesDir, want)
			}
		})
	}
}

// TestLoadTypeScriptConfigReportsConfigurationFactoryFailure proves a configuration
// factory that fails fails the load, naming the configuration file and the error, rather
// than leaving a configuration in which every setting the file wrote is missing.
func TestLoadTypeScriptConfigReportsConfigurationFactoryFailure(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	const defineConfigImport = "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n"

	tests := []struct {
		name   string
		source string
		want   string
	}{
		{
			name:   "async defineConfig factory rejects",
			source: defineConfigImport + "export default defineConfig(async () => { throw new Error(\"config exploded\"); });",
			want:   "config exploded",
		},
		{
			name:   "async defineConfig factory awaits a rejection",
			source: defineConfigImport + "export default defineConfig(async () => { await Promise.reject(new Error(\"awaited exploded\")); return {}; });",
			want:   "awaited exploded",
		},
		{
			name:   "bare async function default export rejects",
			source: "export default async () => { throw new Error(\"bare exploded\"); };",
			want:   "bare exploded",
		},
		{
			name:   "bare function default export throws",
			source: "export default () => { throw new Error(\"sync exploded\"); };",
			want:   "sync exploded",
		},
		{
			name:   "async defineConfig factory never settles",
			source: defineConfigImport + "export default defineConfig(async () => { await new Promise(() => {}); return {}; });",
			want:   "never finished",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			configPath := filepath.Join(t.TempDir(), "dotfiles.config.ts")
			if err := os.WriteFile(configPath, []byte(tt.source), 0644); err != nil {
				t.Fatalf("writing configuration: %v", err)
			}

			projCfg, toolCfgs, err := LoadTypeScriptConfig(log, fs.NewMemFS(), configPath)
			if err == nil {
				t.Fatalf("expected the load to fail, got projCfg = %+v", projCfg)
			}
			if projCfg != nil || toolCfgs != nil {
				t.Errorf("expected no configuration to be returned, got %+v and %+v", projCfg, toolCfgs)
			}
			if !strings.Contains(err.Error(), configPath) {
				t.Errorf("error = %v, want it to name %q", err, configPath)
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("error = %v, want it to report %q", err, tt.want)
			}
		})
	}
}

// TestLoadTypeScriptConfigEvaluatesConfigurationOnlyOnce proves the configuration file
// is evaluated exactly once per load, so that asynchronous factories and top-level side
// effects are not executed twice.
func TestLoadTypeScriptConfigEvaluatesConfigurationOnlyOnce(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	tests := []struct {
		name   string
		source string
	}{
		{
			name: "async defineConfig factory",
			source: `import { defineConfig } from "@alexgorbatchev/dotfiles";
export default defineConfig(async (ctx) => {
	const counterFile = ctx.configFileDir + "/eval-count.txt";
	let count = 0;
	if (fsExists(counterFile)) {
		count = parseInt(fsReadFile(counterFile), 10) || 0;
	}
	fsWriteFile(counterFile, String(count + 1));
	return { paths: { dotfilesDir: ctx.configFileDir } };
});`,
		},
		{
			name: "synchronous defineConfig factory",
			source: `import { defineConfig } from "@alexgorbatchev/dotfiles";
export default defineConfig((ctx) => {
	const counterFile = ctx.configFileDir + "/eval-count.txt";
	let count = 0;
	if (fsExists(counterFile)) {
		count = parseInt(fsReadFile(counterFile), 10) || 0;
	}
	fsWriteFile(counterFile, String(count + 1));
	return { paths: { dotfilesDir: ctx.configFileDir } };
});`,
		},
		{
			name: "bare async function export",
			source: `export default async (ctx) => {
	const counterFile = ctx.configFileDir + "/eval-count.txt";
	let count = 0;
	if (fsExists(counterFile)) {
		count = parseInt(fsReadFile(counterFile), 10) || 0;
	}
	fsWriteFile(counterFile, String(count + 1));
	return { paths: { dotfilesDir: ctx.configFileDir } };
};`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
			if err := os.WriteFile(configPath, []byte(tt.source), 0644); err != nil {
				t.Fatalf("writing configuration: %v", err)
			}

			// Add a tool config to verify tool discovery and bundling still work
			toolsDir := filepath.Join(tmpDir, "tools")
			if err := os.MkdirAll(toolsDir, 0755); err != nil {
				t.Fatalf("creating tools dir: %v", err)
			}
			toolPath := filepath.Join(toolsDir, "mytool.tool.ts")
			toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install, ctx) => {
	return install("manual", { dotfilesDir: ctx.projectConfig.paths.dotfilesDir }).bin("mytool");
});`
			if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
				t.Fatalf("writing tool file: %v", err)
			}

			projCfg, toolCfgs, err := LoadTypeScriptConfig(log, fs.NewOSFS(), configPath)
			if err != nil {
				t.Fatalf("LoadTypeScriptConfig failed: %v", err)
			}
			if projCfg == nil || toolCfgs["mytool"] == nil {
				t.Fatalf("expected valid projCfg and mytool tool config, got %v and %v", projCfg, toolCfgs)
			}

			counterPath := filepath.Join(tmpDir, "eval-count.txt")
			data, err := os.ReadFile(counterPath)
			if err != nil {
				t.Fatalf("reading counter file: %v", err)
			}
			if got := strings.TrimSpace(string(data)); got != "1" {
				t.Errorf("configuration was evaluated %s times, want 1", got)
			}
		})
	}
}
