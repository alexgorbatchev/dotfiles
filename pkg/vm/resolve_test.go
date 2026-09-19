package vm

import (
	"context"
	"encoding/json"
	"os"
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
