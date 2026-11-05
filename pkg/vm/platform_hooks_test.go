package vm

import (
	"context"
	"os"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// A hook declared on the builder applies to whichever platform block chooses the
// installation method. install(method, params) replaces the install parameters, and
// the parameters are where the loader tells Go which events have handlers, so a
// platform block passing parameters must not drop the events registered before it.
func TestHooksRegisteredBeforeAPlatformInstallSurviveIt(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   []string
	}{
		{
			name: "platform block without hooks",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				export default defineTool((install) =>
					install()
						.hook("after-install", async ({ fileSystem }) => {
							await fileSystem.writeFile("/top-level", "ran");
						})
						.platform(Platform.MacOS, (install) =>
							install("manual", { binaryPath: "/usr/bin/true" }).bin("probe")),
				);`,
			want: []string{"/top-level"},
		},
		{
			name: "platform block with a hook for another event",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				export default defineTool((install) =>
					install()
						.hook("after-install", async ({ fileSystem }) => {
							await fileSystem.writeFile("/top-level", "ran");
						})
						.platform(Platform.MacOS, (install) =>
							install("manual", { binaryPath: "/usr/bin/true" })
								.bin("probe")
								.hook("before-install", async () => {})),
				);`,
			want: []string{"/top-level"},
		},
		{
			name: "platform block with a hook for the same event",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				export default defineTool((install) =>
					install()
						.hook("after-install", async ({ fileSystem }) => {
							await fileSystem.writeFile("/top-level", "ran");
						})
						.platform(Platform.MacOS, (install) =>
							install("manual", { binaryPath: "/usr/bin/true" })
								.bin("probe")
								.hook("after-install", async ({ fileSystem }) => {
									await fileSystem.writeFile("/platform", "ran");
								})),
				);`,
			want: []string{"/top-level", "/platform"},
		},
	}

	target := Target{OS: "darwin", Arch: "arm64"}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, tt.source, WithTarget(target))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			if got := tool.InstallParams["binaryPath"]; got != "/usr/bin/true" {
				t.Errorf("binaryPath = %v, want the platform block's parameters", got)
			}
			if !tool.HasHook(HookAfterInstall) {
				t.Fatalf("install parameters lost the after-install event: %v", tool.InstallParams)
			}

			memFS := fs.NewMemFS()
			err = RunHook(
				context.Background(),
				logger.New(logger.Config{Writer: os.Stderr}),
				memFS,
				exec.NewMockRunner(),
				tool,
				hookTestProjectConfig(t),
				HookAfterInstall,
				HookContext{},
				target,
			)
			if err != nil {
				t.Fatalf("RunHook returned error: %v", err)
			}
			for _, marker := range tt.want {
				if exists, _ := memFS.Exists(marker); !exists {
					t.Errorf("the handler writing %s did not run", marker)
				}
			}
		})
	}
}

// The builder must never alias the object a tool file passed as parameters: hooks
// registered later write their events into the builder's parameters, and a tool may
// share one object between blocks, such as one for each platform.
func TestPlatformInstallKeepsTheCallersParametersUntouched(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   []string
		absent []string
	}{
		{
			name: "hook registered before the platform block",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				const params = { binaryPath: "/usr/bin/true" };
				export default defineTool((install) =>
					install()
						.hook("after-install", async () => {})
						.platform(Platform.MacOS, (install) => {
							install("manual", params).bin("probe");
							if ("hooks" in params) throw new Error("the caller's parameters were changed");
						}),
				);`,
			want: []string{HookAfterInstall},
		},
		{
			name: "hook chained onto the platform install",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				const params = { binaryPath: "/usr/bin/true" };
				export default defineTool((install) =>
					install().platform(Platform.MacOS, (install) => {
						install("manual", params).bin("probe").hook("after-install", async () => {});
						if ("hooks" in params) throw new Error("the caller's parameters were changed");
					}),
				);`,
			want: []string{HookAfterInstall},
		},
		{
			name: "hook registered after the platform block",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				const params = { binaryPath: "/usr/bin/true" };
				export default defineTool((install) => {
					const tool = install()
						.platform(Platform.MacOS, (install) => install("manual", params).bin("probe"))
						.hook("after-install", async () => {});
					if ("hooks" in params) throw new Error("the caller's parameters were changed");
					return tool;
				});`,
			want: []string{HookAfterInstall},
		},
		{
			name: "inactive platform block sharing the parameters",
			source: `
				import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
				const params = { binaryPath: "/usr/bin/true" };
				export default defineTool((install) =>
					install()
						.platform(Platform.Linux, (install) =>
							install("manual", params).bin("probe").hook("before-install", async () => {}))
						.platform(Platform.MacOS, (install) => install("manual", params).bin("probe")),
				);`,
			absent: []string{HookBeforeInstall},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, tt.source, WithTarget(Target{OS: "darwin", Arch: "arm64"}))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool := toolConfigs["probe"]
			if tool == nil {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			for _, event := range tt.want {
				if !tool.HasHook(event) {
					t.Errorf("expected the %s event on the loaded tool: %v", event, tool.InstallParams)
				}
			}
			for _, event := range tt.absent {
				if tool.HasHook(event) {
					t.Errorf("the %s event leaked from another block's parameters: %v", event, tool.InstallParams)
				}
			}
		})
	}
}
