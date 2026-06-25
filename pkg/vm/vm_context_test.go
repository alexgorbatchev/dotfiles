package vm

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestVMContextAndFSBindings(t *testing.T) {
	// Initialize in-memory filesystem and mock log output buffer
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Name:   "test-logger",
		Level:  logger.LogLevelVerbose,
		Writer: &logBuf,
	})

	memFS := fs.NewMemFS()
	_ = memFS.MkdirAll("/sandbox/tools", 0755)
	_ = memFS.WriteFile("/sandbox/tools/test.txt", []byte("hello virtual fs"), 0644)

	t.Run("should inject fully-populated ctx parameter to defineTool callback", func(t *testing.T) {
		// Define a mock .tool.ts config that uses ctx.log, ctx.systemInfo, and ctx.fs
		script := `
		import { defineTool } from "@dotfiles/cli";
		export default defineTool((install, ctx) => {
			ctx.log.info("evaluated " + ctx.toolName);
			ctx.log.warn("platform: " + ctx.systemInfo.os + "-" + ctx.systemInfo.arch);
			
			if (ctx.fs.exists("/sandbox/tools/test.txt")) {
				ctx.log.debug("content: " + ctx.fs.readFile("/sandbox/tools/test.txt"));
			}
			
			return install("manual");
		});`

		// Setup a config.ts file that imports this tool, evaluated by LoadTypeScriptConfig
		tempDir, err := os.MkdirTemp("", "vm-context-test")
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

		toolPath := filepath.Join(toolsDir, "test-tool.tool.ts")
		if err := os.WriteFile(toolPath, []byte(script), 0644); err != nil {
			t.Fatalf("failed to write test-tool.tool.ts: %v", err)
		}

		// Dynamically compile and load the TypeScript configuration!
		projCfg, toolConfigs, err := LoadTypeScriptConfig(log, memFS, configPath)
		if err != nil {
			t.Fatalf("failed to load TS config: %v", err)
		}

		if projCfg == nil {
			t.Fatal("expected non-nil project configuration")
		}

		tool, exists := toolConfigs["test-tool"]
		if !exists {
			t.Fatal("expected test-tool to be loaded")
		}

		if tool.InstallationMethod != "manual" {
			t.Errorf("expected installationMethod 'manual', got %q", tool.InstallationMethod)
		}

		// Verify logger bridging
		logs := logBuf.String()
		if !strings.Contains(logs, "evaluated test-tool") {
			t.Errorf("expected logs to contain 'evaluated test-tool', got:\n%s", logs)
		}
		if !strings.Contains(logs, "platform:") {
			t.Errorf("expected logs to contain platform info, got:\n%s", logs)
		}
		if !strings.Contains(logs, "content: hello virtual fs") {
			t.Errorf("expected logs to contain 'content: hello virtual fs', got:\n%s", logs)
		}
	})
}
