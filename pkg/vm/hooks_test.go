package vm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
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
	cfg := &config.ProjectConfig{ConfigFileDir: root}
	cfg.Paths.DotfilesDir = root
	cfg.Paths.GeneratedDir = filepath.Join(root, ".generated")
	cfg.Paths.BinariesDir = filepath.Join(root, ".generated", "binaries")
	cfg.Paths.HomeDir = filepath.Join(root, ".generated", "home")
	return cfg
}

// runHookCapturingFile runs a hook that writes what it saw to /captured and returns it.
func runHookCapturingFile(t *testing.T, tool *config.ToolConfig, projCfg *config.ProjectConfig, event string, hookCtx HookContext) string {
	t.Helper()
	memFS := fs.NewMemFS()
	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Writer: os.Stderr}),
		memFS,
		exec.NewMockRunner(),
		tool,
		projCfg,
		event,
		hookCtx,
		Target{},
	)
	if err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}
	data, readErr := memFS.ReadFile("/captured")
	if readErr != nil {
		t.Fatalf("the hook wrote nothing: %v", readErr)
	}
	return string(data)
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
		logger.New(logger.Config{Writer: os.Stderr}),
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
		logger.New(logger.Config{Writer: os.Stderr}),
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
		logger.New(logger.Config{Writer: os.Stderr}),
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

// A tool file is evaluated again every time a hook fires, so an asynchronous factory
// that rejects on that evaluation has to fail the installation the way the same
// rejection fails the load. Left unobserved it takes every handler registered after its
// first await with it: the hook never runs, nothing is logged, and the tool reports
// installed while the work that makes it usable was skipped.
func TestRunHook_RejectingAsyncFactoryFailsTheHook(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool(async (install) => {
			const builder = install("manual").hook("after-install", async ({ fileSystem }) => {
				await fileSystem.writeFile("/captured", "the hook ran");
			});
			await Promise.resolve();
			throw new Error("deliberate factory failure");
		});
	`, HookAfterInstall)

	memFS := fs.NewMemFS()
	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Writer: os.Stderr}),
		memFS,
		exec.NewMockRunner(),
		tool,
		hookTestProjectConfig(t),
		HookAfterInstall,
		HookContext{},
		Target{},
	)
	if err == nil {
		t.Fatalf("expected the rejected tool factory to fail the hook")
	}
	if !strings.Contains(err.Error(), tool.ConfigFilePath) {
		t.Errorf("error = %v, want it to name the tool file %q", err, tool.ConfigFilePath)
	}
	if !strings.Contains(err.Error(), "deliberate factory failure") {
		t.Errorf("error = %v, want it to carry the factory's own message", err)
	}
	if exists, _ := memFS.Exists("/captured"); exists {
		t.Errorf("the hook ran although the tool file it came from never finished evaluating")
	}
}

// The counterpart: a factory that resolves registers its handlers wherever they sit in
// the body, so settling the factory's promise must not turn an await into a failure.
func TestRunHook_HandlerRegisteredAfterAnAwaitRuns(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool(async (install) => {
			const builder = install("manual");
			await Promise.resolve();
			return builder.hook("after-install", async ({ fileSystem }) => {
				await fileSystem.writeFile("/captured", "registered after the await");
			});
		});
	`, HookAfterInstall)

	captured := runHookCapturingFile(t, tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{})
	if captured != "registered after the await" {
		t.Errorf("the hook wrote %q, want the handler registered after the await to have run", captured)
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
		logger.New(logger.Config{Writer: os.Stderr}),
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

	cfg := &config.ProjectConfig{ConfigFileDir: "."}
	cfg.Paths.DotfilesDir = "."
	cfg.Paths.GeneratedDir = filepath.Join(".generated")
	cfg.Paths.BinariesDir = filepath.Join(".generated", "binaries")
	relativeStagingDir := filepath.Join(cfg.Paths.BinariesDir, "sample", ".staging")

	runner := exec.NewMockRunner()
	runner.Register("bash", []byte(""), nil)

	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Writer: os.Stderr}),
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
	absConfigFileDir, err := filepath.Abs(cfg.ConfigFileDir)
	if err != nil {
		t.Fatalf("resolving expected configuration file dir: %v", err)
	}

	if len(runner.History) == 0 {
		t.Fatalf("the hook ran no commands")
	}
	want := "stage " + absStagingDir + " " + absBinariesDir + "/sample/current " + absConfigFileDir + " undefined"
	got := runner.History[len(runner.History)-1].Args[len(runner.History[len(runner.History)-1].Args)-1]
	if got != want {
		t.Errorf("command = %q, want %q", got, want)
	}
}

// `__dirname` and `import.meta.dirname` in a tool file resolve to the tool file's own
// directory in both evaluations -- at load time when the tool is defined, and at hook
// time when a lifecycle hook fires.
func TestRunHook_DirnameIsTheToolFilesDirectory(t *testing.T) {
	root := t.TempDir()
	if resolved, err := filepath.EvalSymlinks(root); err == nil {
		root = resolved
	}
	elsewhere := filepath.Join(root, "elsewhere")
	home := filepath.Join(root, "home")
	toolsDir := filepath.Join(root, "tools")
	for _, dir := range []string{elsewhere, home, toolsDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("preparing %q: %v", dir, err)
		}
	}

	configContent := "export default { paths: { dotfilesDir: " + strconv.Quote(filepath.ToSlash(elsewhere)) +
		", homeDir: " + strconv.Quote(filepath.ToSlash(home)) + ", toolConfigsDir: \"{configFileDir}/tools\" } };"
	configPath := filepath.Join(root, "dotfiles.config.ts")
	if err := os.WriteFile(configPath, []byte(configContent), 0o644); err != nil {
		t.Fatalf("writing the configuration: %v", err)
	}

	toolContent := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual", { binaryPath: __dirname }).hook("after-install", async ({ fileSystem }) => {
				await fileSystem.writeFile("/captured", __dirname);
			}),
		);
	`
	toolFilePath := filepath.Join(toolsDir, "sample.tool.ts")
	if err := os.WriteFile(toolFilePath, []byte(toolContent), 0o644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	projCfg, tools, err := LoadTypeScriptConfig(log, fs.NewOSFS(), configPath)
	if err != nil {
		t.Fatalf("loading the configuration: %v", err)
	}
	tool := tools["sample"]
	if tool == nil {
		t.Fatalf("the configuration loaded no tool named %q", "sample")
	}

	wantToolDir := filepath.ToSlash(toolsDir)
	atLoadTime, _ := tool.InstallParams["binaryPath"].(string)
	if atLoadTime != wantToolDir {
		t.Fatalf("__dirname at load time = %q, want the tool file's directory %q", atLoadTime, wantToolDir)
	}

	atHookTime := runHookCapturingFile(t, tool, projCfg, HookAfterInstall, HookContext{})
	if atHookTime != wantToolDir {
		t.Errorf("__dirname at hook time = %q, want the tool file's directory %q", atHookTime, wantToolDir)
	}
}

// systemInfo describes the machine the hook runs on. homeDir is the home directory the
// project is configured with rather than the invoking user's, because a tool writing a
// dotfile has to land where the configuration says.
func TestRunHook_SystemInfoCarriesHomeDirAndHostname(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem, systemInfo }) => {
				await fileSystem.writeFile("/captured", JSON.stringify(systemInfo));
			}),
		);
	`, HookAfterInstall)

	projCfg := hookTestProjectConfig(t)
	captured := runHookCapturingFile(t, tool, projCfg, HookAfterInstall, HookContext{})

	var got map[string]string
	if err := json.Unmarshal([]byte(captured), &got); err != nil {
		t.Fatalf("hook wrote %q, which is not JSON: %v", captured, err)
	}
	if got["homeDir"] != projCfg.Paths.HomeDir {
		t.Errorf("systemInfo.homeDir = %q, want the configured home %q", got["homeDir"], projCfg.Paths.HomeDir)
	}
	hostname, err := os.Hostname()
	if err != nil {
		t.Fatalf("reading the hostname: %v", err)
	}
	if got["hostname"] != hostname {
		t.Errorf("systemInfo.hostname = %q, want %q", got["hostname"], hostname)
	}
	if got["os"] == "" || got["arch"] == "" {
		t.Errorf("systemInfo = %v, want os and arch to stay populated", got)
	}
}

// A hook that has to branch on how the tool is configured -- the installation method,
// a parameter it was given -- reads it from the context rather than re-deriving it.
func TestRunHook_ToolConfigIsAvailable(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("curl-script", { url: "https://example.test/install.sh" }).hook(
				"after-install",
				async ({ fileSystem, toolConfig }) => {
					await fileSystem.writeFile(
						"/captured",
						toolConfig.name + " " + toolConfig.installationMethod + " " + toolConfig.installParams.url,
					);
				},
			),
		);
	`, HookAfterInstall)
	tool.InstallationMethod = "curl-script"
	tool.InstallParams["url"] = "https://example.test/install.sh"

	captured := runHookCapturingFile(t, tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{})
	want := "sample curl-script https://example.test/install.sh"
	if captured != want {
		t.Errorf("toolConfig fields = %q, want %q", captured, want)
	}
}

// after-extract reports what came out of the archive, so a hook can place a binary
// without walking the tree itself.
func TestRunHook_AfterExtractCarriesExtractResult(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-extract", async ({ fileSystem, extractResult }) => {
				await fileSystem.writeFile("/captured", JSON.stringify(extractResult));
			}),
		);
	`, HookAfterExtract)

	captured := runHookCapturingFile(t, tool, hookTestProjectConfig(t), HookAfterExtract, HookContext{
		ExtractDir:     "/tmp/extracted",
		ExtractedFiles: []string{"/tmp/extracted/bin/tool", "/tmp/extracted/README.md"},
		Executables:    []string{"/tmp/extracted/bin/tool"},
	})

	var got map[string][]string
	if err := json.Unmarshal([]byte(captured), &got); err != nil {
		t.Fatalf("hook wrote %q, which is not JSON: %v", captured, err)
	}
	if len(got["extractedFiles"]) != 2 || got["extractedFiles"][0] != "/tmp/extracted/bin/tool" {
		t.Errorf("extractResult.extractedFiles = %v", got["extractedFiles"])
	}
	if len(got["executables"]) != 1 || got["executables"][0] != "/tmp/extracted/bin/tool" {
		t.Errorf("extractResult.executables = %v", got["executables"])
	}
}

// An event that produced no extraction must not hand the hook an empty-looking result
// that reads as "the archive contained nothing".
func TestRunHook_ExtractResultAbsentWithoutExtraction(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem, extractResult }) => {
				await fileSystem.writeFile("/captured", typeof extractResult);
			}),
		);
	`, HookAfterInstall)

	captured := runHookCapturingFile(t, tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{})
	if captured != "undefined" {
		t.Errorf("typeof extractResult = %q, want \"undefined\"", captured)
	}
}

// A tool file that reads an environment variable does so at its top level, which runs
// again every time the file is re-entered for a hook or a resolver. Without process.env
// there the file would evaluate the first time and fail every time after.
func TestRunHook_ToolFileCanReadProcessEnv(t *testing.T) {
	t.Setenv("DOTFILES_HOOK_PROBE", "from-the-environment")

	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		const probe = process.env.DOTFILES_HOOK_PROBE || "missing";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem }) => {
				await fileSystem.writeFile("/captured", probe);
			}),
		);
	`, HookAfterInstall)

	captured := runHookCapturingFile(t, tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{})
	if captured != "from-the-environment" {
		t.Errorf("the tool file read %q from process.env, want %q", captured, "from-the-environment")
	}
}

// runHookOnFS runs a hook against a file system the caller prepared and inspects
// afterwards, which is what a hook placing a binary actually does.
func runHookOnFS(t *testing.T, memFS fs.FS, tool *config.ToolConfig, hookCtx HookContext) error {
	t.Helper()
	return RunHook(
		context.Background(),
		logger.New(logger.Config{Writer: os.Stderr}),
		memFS,
		exec.NewMockRunner(),
		tool,
		hookTestProjectConfig(t),
		HookAfterExtract,
		hookCtx,
		Target{},
	)
}

// Placing a binary is the job an after-extract hook exists for, and it takes a copy
// and a mode change. Neither was possible without shelling out.
func TestRunHook_FileSystemCopiesAndChmods(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-extract", async ({ fileSystem, extractDir }) => {
				await fileSystem.copyFile(extractDir + "/tool", "/opt/bin/tool");
				await fileSystem.chmod("/opt/bin/tool", 0o755);
			}),
		);
	`, HookAfterExtract)

	memFS := fs.NewMemFS()
	if err := memFS.MkdirAll("/extracted", 0755); err != nil {
		t.Fatalf("preparing the tree: %v", err)
	}
	if err := memFS.WriteFile("/extracted/tool", []byte("#!/bin/sh\n"), 0644); err != nil {
		t.Fatalf("preparing the payload: %v", err)
	}
	if err := memFS.MkdirAll("/opt/bin", 0755); err != nil {
		t.Fatalf("preparing the destination: %v", err)
	}

	if err := runHookOnFS(t, memFS, tool, HookContext{ExtractDir: "/extracted"}); err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}

	data, err := memFS.ReadFile("/opt/bin/tool")
	if err != nil {
		t.Fatalf("copyFile placed nothing: %v", err)
	}
	if string(data) != "#!/bin/sh\n" {
		t.Errorf("copied contents = %q", string(data))
	}
	info, err := memFS.Stat("/opt/bin/tool")
	if err != nil {
		t.Fatalf("stat of the copy: %v", err)
	}
	if info.Mode().Perm() != 0755 {
		t.Errorf("mode after chmod = %o, want 755", info.Mode().Perm())
	}
}

// Inspecting a path: stat follows a link to what it points at, lstat describes the
// link itself, and readlink reports where it goes.
func TestRunHook_FileSystemInspectsPaths(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-extract", async ({ fileSystem }) => {
				const stat = await fileSystem.stat("/link");
				const lstat = await fileSystem.lstat("/link");
				const dir = await fileSystem.stat("/dir");
				await fileSystem.writeFile(
					"/captured",
					JSON.stringify({
						stat: stat,
						lstat: lstat,
						dir: dir,
						target: await fileSystem.readlink("/link"),
					}),
				);
			}),
		);
	`, HookAfterExtract)

	memFS := fs.NewMemFS()
	if err := memFS.MkdirAll("/dir", 0755); err != nil {
		t.Fatalf("preparing the directory: %v", err)
	}
	if err := memFS.WriteFile("/target", []byte("abcde"), 0640); err != nil {
		t.Fatalf("preparing the target: %v", err)
	}
	if err := memFS.Symlink("/target", "/link"); err != nil {
		t.Fatalf("preparing the link: %v", err)
	}

	if err := runHookOnFS(t, memFS, tool, HookContext{ExtractDir: "/dir"}); err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}

	raw, err := memFS.ReadFile("/captured")
	if err != nil {
		t.Fatalf("the hook wrote nothing: %v", err)
	}
	var got struct {
		Stat   fileStatsJSON `json:"stat"`
		Lstat  fileStatsJSON `json:"lstat"`
		Dir    fileStatsJSON `json:"dir"`
		Target string        `json:"target"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("hook wrote %q, which is not JSON: %v", raw, err)
	}

	if !got.Stat.IsFile || got.Stat.IsSymbolicLink {
		t.Errorf("stat of a link = %+v, want the file it points at", got.Stat)
	}
	if got.Stat.Size != 5 {
		t.Errorf("stat size = %d, want 5", got.Stat.Size)
	}
	if got.Stat.Mode != 0640 {
		t.Errorf("stat mode = %o, want 640", got.Stat.Mode)
	}
	if !got.Lstat.IsSymbolicLink || got.Lstat.IsFile {
		t.Errorf("lstat of a link = %+v, want the link itself", got.Lstat)
	}
	if !got.Dir.IsDirectory || got.Dir.IsFile {
		t.Errorf("stat of a directory = %+v", got.Dir)
	}
	if got.Target != "/target" {
		t.Errorf("readlink = %q, want %q", got.Target, "/target")
	}
}

// fileStatsJSON is the shape stat and lstat report to a hook.
type fileStatsJSON struct {
	IsFile         bool  `json:"isFile"`
	IsDirectory    bool  `json:"isDirectory"`
	IsSymbolicLink bool  `json:"isSymbolicLink"`
	Mode           int   `json:"mode"`
	Size           int64 `json:"size"`
}

// rmdir removes an empty directory and nothing else: that is what distinguishes it
// from rm, which takes the whole tree with it.
func TestRunHook_FileSystemRmdir(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-extract", async ({ fileSystem }) => {
				await fileSystem.rmdir("/empty");
				let refused = "";
				try {
					await fileSystem.rmdir("/full");
				} catch (error) {
					refused = String(error);
				}
				await fileSystem.writeFile("/captured", refused);
			}),
		);
	`, HookAfterExtract)

	memFS := fs.NewMemFS()
	if err := memFS.MkdirAll("/empty", 0755); err != nil {
		t.Fatalf("preparing the empty directory: %v", err)
	}
	if err := memFS.MkdirAll("/full", 0755); err != nil {
		t.Fatalf("preparing the populated directory: %v", err)
	}
	if err := memFS.WriteFile("/full/keep", []byte("x"), 0644); err != nil {
		t.Fatalf("preparing the populated directory: %v", err)
	}

	if err := runHookOnFS(t, memFS, tool, HookContext{ExtractDir: "/"}); err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}

	if exists, _ := memFS.Exists("/empty"); exists {
		t.Errorf("rmdir left the empty directory behind")
	}
	if exists, _ := memFS.Exists("/full/keep"); !exists {
		t.Errorf("rmdir removed a populated directory")
	}
	refused, err := memFS.ReadFile("/captured")
	if err != nil {
		t.Fatalf("the hook wrote nothing: %v", err)
	}
	if !strings.Contains(string(refused), "rmdir") {
		t.Errorf("rmdir of a populated directory reported %q, want it to name the operation", refused)
	}
}

// Inspecting a path that is not there is an error the hook can catch, not a made-up
// answer that reads as "an empty file".
func TestRunHook_FileSystemStatReportsMissingPath(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-extract", async ({ fileSystem }) => {
				let message = "no error";
				try {
					await fileSystem.stat("/absent");
				} catch (error) {
					message = String(error);
				}
				await fileSystem.writeFile("/captured", message);
			}),
		);
	`, HookAfterExtract)

	memFS := fs.NewMemFS()
	if err := runHookOnFS(t, memFS, tool, HookContext{ExtractDir: "/"}); err != nil {
		t.Fatalf("RunHook returned error: %v", err)
	}
	captured, err := memFS.ReadFile("/captured")
	if err != nil {
		t.Fatalf("the hook wrote nothing: %v", err)
	}
	if !strings.Contains(string(captured), "/absent") {
		t.Errorf("stat of a missing path reported %q, want it to name the path", captured)
	}
}

func TestRunHook_CommandFailureWithStderrOutput(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ $ }) => {
				await $`+"`"+`failing-command`+"`"+`;
			}),
		);
	`, HookAfterInstall)

	runner := exec.NewMockRunner()
	runner.RegisterFunc("bash", func(cmd *exec.MockCmd) error {
		if cmd.Stderr() != nil {
			_, _ = cmd.Stderr().Write([]byte("custom failure message\n"))
		}
		return errors.New("command failed with exit code 1")
	})

	err := RunHook(
		context.Background(),
		logger.New(logger.Config{Name: "test", Writer: os.Stderr}),
		fs.NewMemFS(),
		runner,
		tool,
		hookTestProjectConfig(t),
		HookAfterInstall,
		HookContext{InstalledDir: "/opt/sample/1.2.3"},
		Target{},
	)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "custom failure message") {
		t.Errorf("expected error to include stderr message, got: %v", err)
	}
}

func TestHookWorkingDir(t *testing.T) {
	t.Run("nil tool and nil projCfg", func(t *testing.T) {
		if got := hookWorkingDir(nil, nil); got != "" {
			t.Errorf("expected empty string, got %q", got)
		}
	})
	t.Run("nil tool with projCfg", func(t *testing.T) {
		projCfg := &config.ProjectConfig{}
		projCfg.Paths.DotfilesDir = "/path/to/dotfiles"
		if got := hookWorkingDir(nil, projCfg); got != "/path/to/dotfiles" {
			t.Errorf("expected dotfilesDir, got %q", got)
		}
	})
	t.Run("tool with empty ConfigFilePath falls back to projCfg", func(t *testing.T) {
		tool := &config.ToolConfig{}
		projCfg := &config.ProjectConfig{}
		projCfg.Paths.DotfilesDir = "/path/to/dotfiles"
		if got := hookWorkingDir(tool, projCfg); got != "/path/to/dotfiles" {
			t.Errorf("expected dotfilesDir, got %q", got)
		}
	})
	t.Run("tool with ConfigFilePath wins", func(t *testing.T) {
		tool := &config.ToolConfig{ConfigFilePath: "/path/to/tools/mytool.tool.ts"}
		projCfg := &config.ProjectConfig{}
		projCfg.Paths.DotfilesDir = "/path/to/dotfiles"
		if got := hookWorkingDir(tool, projCfg); got != "/path/to/tools" {
			t.Errorf("expected /path/to/tools, got %q", got)
		}
	})
}
