package vm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// resolveTestTool writes a tool file and returns a configuration recording the
// resolvers the loader would have recorded for it.
func resolveTestTool(t *testing.T, body string, params ...string) *config.ToolConfig {
	t.Helper()
	tool := writeToolFile(t, body)
	recorded := make([]any, 0, len(params))
	for _, p := range params {
		recorded = append(recorded, p)
	}
	tool.InstallParams["resolvers"] = recorded
	return tool
}

func resolveParam(t *testing.T, tool *config.ToolConfig, param string, extra map[string]any) json.RawMessage {
	t.Helper()
	value, err := ResolveInstallParam(context.Background(), ResolveRequest{
		Log:     logger.New(logger.Config{Writer: os.Stderr}),
		FS:      fs.NewMemFS(),
		Runner:  exec.NewMockRunner(),
		Tool:    tool,
		ProjCfg: hookTestProjectConfig(t),
		Param:   param,
		Context: extra,
	})
	if err != nil {
		t.Fatalf("ResolveInstallParam(%q) returned error: %v", param, err)
	}
	return value
}

// The point of resolving at install time: the resolver sees paths that only exist once
// the installation is under way, not the placeholders the configuration was read with.
func TestResolveInstallParam_ReceivesInstallTimeContext(t *testing.T) {
	tool := resolveTestTool(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("curl-script", {
				url: "https://example.test/install.sh",
				args: (ctx) => ["--script", ctx.scriptPath, "--into", ctx.stagingDir, "--home", ctx.projectConfig.paths.homeDir],
			}),
		);
	`, "args")

	projCfg := hookTestProjectConfig(t)
	value, err := ResolveInstallParam(context.Background(), ResolveRequest{
		Log:     logger.New(logger.Config{Writer: os.Stderr}),
		FS:      fs.NewMemFS(),
		Runner:  exec.NewMockRunner(),
		Tool:    tool,
		ProjCfg: projCfg,
		Param:   "args",
		Context: map[string]any{"scriptPath": "/staging/sample-install.sh", "stagingDir": "/staging"},
	})
	if err != nil {
		t.Fatalf("ResolveInstallParam returned error: %v", err)
	}

	var got []string
	if err := json.Unmarshal(value, &got); err != nil {
		t.Fatalf("resolver produced %s, which is not a string list: %v", value, err)
	}
	want := []string{"--script", "/staging/sample-install.sh", "--into", "/staging", "--home", projCfg.Paths.HomeDir}
	if len(got) != len(want) {
		t.Fatalf("args = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("args = %v, want %v", got, want)
		}
	}
}

// A resolver may be async, as v1's resolveValue awaited one.
func TestResolveInstallParam_AwaitsAsyncResolver(t *testing.T) {
	tool := resolveTestTool(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("curl-script", {
				url: "https://example.test/install.sh",
				env: async (ctx) => ({ SCRIPT: ctx.scriptPath, PREFIX: ctx.stagingDir }),
			}),
		);
	`, "env")

	value := resolveParam(t, tool, "env", map[string]any{"scriptPath": "/staging/s.sh", "stagingDir": "/staging"})

	var got map[string]string
	if err := json.Unmarshal(value, &got); err != nil {
		t.Fatalf("resolver produced %s, which is not a string map: %v", value, err)
	}
	if got["SCRIPT"] != "/staging/s.sh" || got["PREFIX"] != "/staging" {
		t.Errorf("env = %v", got)
	}
}

// A resolver that throws must fail the installation with its own message rather than
// the installer silently running the script with no arguments.
func TestResolveInstallParam_FailureIsReported(t *testing.T) {
	tool := resolveTestTool(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("curl-script", {
				url: "https://example.test/install.sh",
				args: () => {
					throw new Error("deliberate resolver failure");
				},
			}),
		);
	`, "args")

	_, err := ResolveInstallParam(context.Background(), ResolveRequest{
		Log:     logger.New(logger.Config{Writer: os.Stderr}),
		FS:      fs.NewMemFS(),
		Runner:  exec.NewMockRunner(),
		Tool:    tool,
		ProjCfg: hookTestProjectConfig(t),
		Param:   "args",
	})
	if err == nil {
		t.Fatalf("expected the resolver failure to be reported")
	}
	if !strings.Contains(err.Error(), "deliberate resolver failure") {
		t.Errorf("error = %v, want it to carry the resolver's own message", err)
	}
}

// HasResolver answers from what the loader recorded, without re-reading the file.
func TestHasResolver(t *testing.T) {
	tool := &config.ToolConfig{
		Name:          "sample",
		InstallParams: map[string]any{"resolvers": []any{"args"}},
	}
	if !HasResolver(tool, "args") {
		t.Errorf("HasResolver(args) = false, want true")
	}
	if HasResolver(tool, "env") {
		t.Errorf("HasResolver(env) = true, want false")
	}
	if HasResolver(nil, "args") {
		t.Errorf("HasResolver on a nil tool = true, want false")
	}
	if HasResolver(&config.ToolConfig{Name: "bare"}, "args") {
		t.Errorf("HasResolver on a tool without install parameters = true, want false")
	}
}

// Asking for a parameter the loader recorded no resolver for, or for a tool whose file
// cannot be found, is a wiring mistake that must be reported rather than answered with
// an empty value the installer would then act on.
func TestResolveInstallParam_RejectsWhatItCannotAnswer(t *testing.T) {
	withResolver := resolveTestTool(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) => install("curl-script", { url: "https://example.test/i.sh" }));
	`, "args")

	tests := []struct {
		name string
		tool *config.ToolConfig
		want string
	}{
		{
			name: "no resolver was recorded",
			tool: withResolver,
			want: "recorded no resolver",
		},
		{
			name: "the tool has no configuration file",
			tool: &config.ToolConfig{Name: "pathless", InstallParams: map[string]any{"resolvers": []any{"env"}}},
			want: "no path to it",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ResolveInstallParam(context.Background(), ResolveRequest{
				Log:     logger.New(logger.Config{Writer: os.Stderr}),
				FS:      fs.NewMemFS(),
				Runner:  exec.NewMockRunner(),
				Tool:    tt.tool,
				ProjCfg: hookTestProjectConfig(t),
				Param:   "env",
			})
			if err == nil {
				t.Fatalf("expected an error")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("error = %v, want it to mention %q", err, tt.want)
			}
		})
	}
}

// TestResolveInstallParam_RetainedEvaluatorExecutesWithoutReevaluatingToolFile proves
// that resolving an install parameter using a retained Evaluator runs the resolver function
// in the load VM without re-evaluating the tool file.
func TestResolveInstallParam_RetainedEvaluatorExecutesWithoutReevaluatingToolFile(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools dir: %v", err)
	}

	configContent := fmt.Sprintf(`
import { defineConfig } from "@alexgorbatchev/dotfiles";
export default defineConfig({
	paths: {
		dotfilesDir: %q,
		homeDir: %q,
		targetDir: %q,
		toolConfigsDir: %q,
	},
});
`, tmpDir, tmpDir, filepath.Join(tmpDir, "bin"), toolsDir)
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	toolContent := `
import { defineTool } from "@alexgorbatchev/dotfiles";

let bodyRunCount = 0;

export default defineTool((install, ctx) => {
	bodyRunCount++;
	ctx.log.info("RESOLVE_TOOL_BODY_EVALUATED_COUNT: " + bodyRunCount);
	return install("curl-script", {
		url: "https://example.test/install.sh",
		args: (c) => ["--runs", String(bodyRunCount)],
	});
});
`
	toolPath := filepath.Join(toolsDir, "resolve-tool.tool.ts")
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing tool: %v", err)
	}

	var logBuf bytes.Buffer
	testLogger := logger.New(logger.Config{Writer: &logBuf})
	memFS := fs.NewMemFS()

	projCfg, tools, eval, err := LoadTypeScriptConfig(testLogger, fs.NewOSFS(), configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	tool := tools["resolve-tool"]
	if tool == nil {
		t.Fatalf("expected tool 'resolve-tool' to be loaded")
	}

	// Verify defineTool body ran once during load
	if count := strings.Count(logBuf.String(), "RESOLVE_TOOL_BODY_EVALUATED_COUNT: 1"); count != 1 {
		t.Fatalf("expected 1 initial evaluation log, got %d. Logs:\n%s", count, logBuf.String())
	}

	// Resolve the "args" parameter using the retained evaluator
	value, err := ResolveInstallParam(t.Context(), ResolveRequest{
		Log:       testLogger,
		FS:        memFS,
		Runner:    exec.NewMockRunner(),
		Tool:      tool,
		ProjCfg:   projCfg,
		Param:     "args",
		Context:   map[string]any{},
		Evaluator: eval,
	})
	if err != nil {
		t.Fatalf("ResolveInstallParam failed: %v", err)
	}

	var gotArgs []string
	if err := json.Unmarshal(value, &gotArgs); err != nil {
		t.Fatalf("unmarshaling resolved args %s: %v", value, err)
	}
	if len(gotArgs) != 2 || gotArgs[0] != "--runs" || gotArgs[1] != "1" {
		t.Errorf("expected ['--runs', '1'], got %v", gotArgs)
	}

	// Verify the tool file was NOT re-evaluated during parameter resolution
	evalCount := strings.Count(logBuf.String(), "RESOLVE_TOOL_BODY_EVALUATED_COUNT:")
	if evalCount != 1 {
		t.Errorf("expected defineTool body to run exactly 1 time, but it ran %d times. Logs:\n%s", evalCount, logBuf.String())
	}

	// Verify resolving with evaluator on context (req.Evaluator == nil) and req.Context == nil
	ctxWithEval := WithEvaluator(t.Context(), eval)
	valFromCtx, err := ResolveInstallParam(ctxWithEval, ResolveRequest{
		Log:     testLogger,
		FS:      memFS,
		Runner:  exec.NewMockRunner(),
		Tool:    tool,
		ProjCfg: projCfg,
		Param:   "args",
	})
	if err != nil {
		t.Fatalf("ResolveInstallParam with context evaluator failed: %v", err)
	}
	var ctxArgs []string
	if err := json.Unmarshal(valFromCtx, &ctxArgs); err != nil {
		t.Fatalf("unmarshaling args from ctx: %v", err)
	}
	if len(ctxArgs) != 2 || ctxArgs[1] != "1" {
		t.Errorf("expected ['--runs', '1'], got %v", ctxArgs)
	}
}

func TestResolveInstallParam_RetainedEvaluatorFailureIsReported(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools dir: %v", err)
	}

	configContent := fmt.Sprintf(`
import { defineConfig } from "@alexgorbatchev/dotfiles";
export default defineConfig({
	paths: {
		dotfilesDir: %q,
		homeDir: %q,
		targetDir: %q,
		toolConfigsDir: %q,
	},
});
`, tmpDir, tmpDir, filepath.Join(tmpDir, "bin"), toolsDir)
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	toolContent := `
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => {
	return install("curl-script", {
		url: "https://example.test/install.sh",
		args: () => {
			throw new Error("deliberate retained resolver failure");
		},
	});
});
`
	toolPath := filepath.Join(toolsDir, "failing-resolver.tool.ts")
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing tool: %v", err)
	}

	var logBuf bytes.Buffer
	testLogger := logger.New(logger.Config{Writer: &logBuf})
	memFS := fs.NewMemFS()

	projCfg, tools, eval, err := LoadTypeScriptConfig(testLogger, fs.NewOSFS(), configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	tool := tools["failing-resolver"]
	if tool == nil {
		t.Fatalf("expected tool 'failing-resolver' to be loaded")
	}

	_, err = ResolveInstallParam(t.Context(), ResolveRequest{
		Log:       testLogger,
		FS:        memFS,
		Runner:    exec.NewMockRunner(),
		Tool:      tool,
		ProjCfg:   projCfg,
		Param:     "args",
		Evaluator: eval,
	})
	if err == nil {
		t.Fatal("expected resolver failure with retained evaluator to be reported")
	}
	if !strings.Contains(err.Error(), "deliberate retained resolver failure") {
		t.Errorf("expected error to mention deliberate failure, got: %v", err)
	}
}
