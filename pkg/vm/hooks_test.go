package vm

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// writeToolFile puts a .tool.ts on disk, which is where esbuild reads it from, and
// returns a tool configuration pointing at it. The hooks list mirrors what the loader
// records when it evaluates the file.
func writeToolFile(t *testing.T, body string, events ...string) *config.ToolConfig {
	t.Helper()
	dir := t.TempDir()
	toolPath := filepath.Join(dir, "sample.tool.ts")
	if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
		t.Fatalf("writing tool file: %v", err)
	}
	hooks := make([]any, 0, len(events))
	for _, e := range events {
		hooks = append(hooks, e)
	}
	return &config.ToolConfig{
		Name:           "sample",
		ConfigFilePath: toolPath,
		InstallParams:  map[string]any{"hooks": hooks},
	}
}

func hookTestProjectConfig(t *testing.T) *config.ProjectConfig {
	t.Helper()
	root := t.TempDir()
	cfg := &config.ProjectConfig{}
	cfg.Paths.DotfilesDir = root
	cfg.Paths.GeneratedDir = filepath.Join(root, ".generated")
	cfg.Paths.BinariesDir = filepath.Join(root, ".generated", "binaries")
	return cfg
}

// The defining property of a lifecycle hook: it runs when the installation reaches the
// event, with the paths that only exist by then.
func TestRunHook_ReceivesEventContextAndRunsCommands(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ $, installedDir, version }) => {
				await $`+"`"+`record ${installedDir} ${version}`+"`"+`;
			}),
		);
	`, HookAfterInstall)

	runner := exec.NewMockRunner()
	runner.Register("bash", []byte(""), nil)

	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Name: "test", Writer: os.Stderr}),
		fs.NewMemFS(),
		runner,
		tool,
		hookTestProjectConfig(t),
		HookAfterInstall,
		HookContext{InstalledDir: "/opt/sample/1.2.3", Version: "1.2.3"},
		Target{},
	)
	if err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}

	if len(runner.History) == 0 {
		t.Fatalf("the hook ran no commands")
	}
	joined := strings.Join(runner.History[len(runner.History)-1].Args, " ")
	if !strings.Contains(joined, "record /opt/sample/1.2.3 1.2.3") {
		t.Errorf("command = %q, want the installed directory and version interpolated", joined)
	}
}

// The case that silently vanished before: a hook that uses the file system.
func TestRunHook_FileSystemIsUsable(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem, installedDir }) => {
				await fileSystem.mkdir(installedDir + "/share");
				await fileSystem.writeFile(installedDir + "/share/config.toml", "theme = \"dark\"");
			}),
		);
	`, HookAfterInstall)

	memFS := fs.NewMemFS()
	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Name: "test", Writer: os.Stderr}),
		memFS,
		exec.NewMockRunner(),
		tool,
		hookTestProjectConfig(t),
		HookAfterInstall,
		HookContext{InstalledDir: "/opt/sample/current"},
		Target{},
	)
	if err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}

	data, readErr := memFS.ReadFile("/opt/sample/current/share/config.toml")
	if readErr != nil {
		t.Fatalf("hook did not write the file: %v", readErr)
	}
	if string(data) != `theme = "dark"` {
		t.Errorf("file contents = %q", string(data))
	}
}

// A hook that fails must fail the installation, not disappear.
func TestRunHook_FailureIsReported(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async () => {
				throw new Error("deliberate hook failure");
			}),
		);
	`, HookAfterInstall)

	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Name: "test", Writer: os.Stderr}),
		fs.NewMemFS(),
		exec.NewMockRunner(),
		tool,
		hookTestProjectConfig(t),
		HookAfterInstall,
		HookContext{},
		Target{},
	)
	if err == nil {
		t.Fatalf("expected the hook failure to be reported")
	}
	if !strings.Contains(err.Error(), "deliberate hook failure") {
		t.Errorf("error = %v, want it to carry the hook's own message", err)
	}
}

// Only the event that was reached runs.
func TestRunHook_OnlyMatchingEventRuns(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem }) => {
				await fileSystem.writeFile("/marker", "after-install");
			}),
		);
	`, HookAfterInstall)

	memFS := fs.NewMemFS()
	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Name: "test", Writer: os.Stderr}),
		memFS,
		exec.NewMockRunner(),
		tool,
		hookTestProjectConfig(t),
		HookBeforeInstall,
		HookContext{},
		Target{},
	)
	if err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}
	if exists, _ := memFS.Exists("/marker"); exists {
		t.Errorf("the after-install hook ran for a before-install event")
	}
}

// A before-install hook stages into stagingDir, so it must receive the real path. The
// hook's commands run from the tool's directory rather than from where the CLI was
// invoked, which is why every path handed over has to be absolute: a path relative to
// the CLI's working directory would land the staged files in the wrong tree.
func TestRunHook_BeforeInstallReceivesAbsoluteStagingDir(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("before-install", async ({ $, stagingDir, currentDir, configFileDir, installedDir }) => {
				await $`+"`"+`stage ${stagingDir} ${currentDir} ${configFileDir} ${typeof installedDir}`+"`"+`;
			}),
		);
	`, HookBeforeInstall)

	cfg := &config.ProjectConfig{}
	cfg.Paths.DotfilesDir = "."
	cfg.Paths.GeneratedDir = filepath.Join(".generated")
	cfg.Paths.BinariesDir = filepath.Join(".generated", "binaries")
	relativeStagingDir := filepath.Join(cfg.Paths.BinariesDir, "sample", ".staging")

	runner := exec.NewMockRunner()
	runner.Register("bash", []byte(""), nil)

	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Name: "test", Writer: os.Stderr}),
		fs.NewMemFS(),
		runner,
		tool,
		cfg,
		HookBeforeInstall,
		HookContext{StagingDir: relativeStagingDir},
		Target{},
	)
	if err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}

	absStagingDir, err := filepath.Abs(relativeStagingDir)
	if err != nil {
		t.Fatalf("resolving expected staging dir: %v", err)
	}
	absBinariesDir, err := filepath.Abs(cfg.Paths.BinariesDir)
	if err != nil {
		t.Fatalf("resolving expected binaries dir: %v", err)
	}
	absDotfilesDir, err := filepath.Abs(cfg.Paths.DotfilesDir)
	if err != nil {
		t.Fatalf("resolving expected dotfiles dir: %v", err)
	}

	if len(runner.History) == 0 {
		t.Fatalf("the hook ran no commands")
	}
	want := "stage " + absStagingDir + " " + absBinariesDir + "/sample/current " + absDotfilesDir + " undefined"
	got := runner.History[len(runner.History)-1].Args[len(runner.History[len(runner.History)-1].Args)-1]
	if got != want {
		t.Errorf("command = %q, want %q", got, want)
	}
}
