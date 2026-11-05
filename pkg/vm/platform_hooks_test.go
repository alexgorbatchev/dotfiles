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

// Recording the events must not write them into the object the tool file passed as
// parameters, which the tool may share with other declarations.
func TestPlatformInstallKeepsTheCallersParametersUntouched(t *testing.T) {
	toolConfigs, err := loadToolSource(t, `
		import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
		const params = { binaryPath: "/usr/bin/true" };
		export default defineTool((install) =>
			install()
				.hook("after-install", async () => {})
				.platform(Platform.MacOS, (install) => {
					install("manual", params).bin("probe");
					if ("hooks" in params) {
						throw new Error("the caller's parameters were changed");
					}
				}),
		);`, WithTarget(Target{OS: "darwin", Arch: "arm64"}))
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if tool := toolConfigs["probe"]; tool == nil || !tool.HasHook(HookAfterInstall) {
		t.Fatalf("expected the after-install event on the loaded tool, got %v", toolConfigs)
	}
}
