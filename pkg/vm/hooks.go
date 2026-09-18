package vm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/require"
)

// Lifecycle events a tool can hook into. The installation reaches them in this order,
// and each one carries the values that exist by the time it is reached.
const (
	HookBeforeInstall = "before-install"
	HookAfterDownload = "after-download"
	HookAfterExtract  = "after-extract"
	HookAfterInstall  = "after-install"
)

// HookContext carries the values that only exist while an installation is under way.
// Fields left empty are omitted from the JavaScript context rather than being passed
// as empty strings, so a hook reading one that its event does not provide sees
// undefined instead of a plausible-looking wrong path.
type HookContext struct {
	StagingDir   string
	DownloadPath string
	ExtractDir   string
	InstalledDir string
	BinaryPaths  []string
	Version      string
	// Env is the environment commands run with. The orchestrator builds it so the
	// binaries a tool just installed are on PATH, letting a hook call them by name.
	Env []string
}

// absolute returns the context with every directory resolved to an absolute path.
//
// The orchestrator addresses these directories relative to the CLI's working directory,
// which is fine for Go, but a hook's commands run from the tool's own directory (see
// hookWorkingDir). Handed over unresolved, `${stagingDir}` would be interpreted against
// that directory and the hook would stage its files into the wrong tree while the real
// staging directory stayed empty.
func (h HookContext) absolute(fsys fs.FS) (HookContext, error) {
	var err error
	for _, dir := range []*string{&h.StagingDir, &h.DownloadPath, &h.ExtractDir, &h.InstalledDir} {
		if *dir, err = absolutePath(fsys, *dir); err != nil {
			return h, err
		}
	}
	return h, nil
}

// absolutePath resolves a path for a hook, leaving an unset path unset: resolving ""
// would yield the working directory, which is not a value the hook was ever given.
func absolutePath(fsys fs.FS, path string) (string, error) {
	if path == "" {
		return "", nil
	}
	abs, err := fsys.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolving %q for the hook: %w", path, err)
	}
	return abs, nil
}

func (h HookContext) toMap() map[string]any {
	out := map[string]any{}
	if h.StagingDir != "" {
		out["stagingDir"] = h.StagingDir
	}
	if h.DownloadPath != "" {
		out["downloadPath"] = h.DownloadPath
	}
	if h.ExtractDir != "" {
		out["extractDir"] = h.ExtractDir
	}
	if h.InstalledDir != "" {
		out["installedDir"] = h.InstalledDir
	}
	if len(h.BinaryPaths) > 0 {
		out["binaryPaths"] = h.BinaryPaths
	}
	if h.Version != "" {
		out["version"] = h.Version
	}
	return out
}

// HasHook reports whether a tool registered any handler for an event. The loader
// records the event names alongside the tool's install parameters, so this answers
// without re-evaluating the tool file.
func HasHook(tool *config.ToolConfig, event string) bool {
	if tool == nil || tool.InstallParams == nil {
		return false
	}
	events, ok := tool.InstallParams["hooks"].([]any)
	if !ok {
		return false
	}
	for _, e := range events {
		if name, ok := e.(string); ok && name == event {
			return true
		}
	}
	return false
}

// RunHook invokes the handlers a tool registered for a lifecycle event.
//
// The tool's configuration file is re-evaluated in a fresh VM so the handler closure is
// available to call: a function cannot survive the JSON boundary the configuration
// crosses to reach Go. Re-evaluating is cheap next to an installation, and a VM per
// invocation keeps hooks from sharing mutable state with configuration loading or with
// each other.
func RunHook(
	ctx context.Context,
	log *logger.Logger,
	fsys fs.FS,
	runner exec.CommandRunner,
	tool *config.ToolConfig,
	projCfg *config.ProjectConfig,
	event string,
	hookCtx HookContext,
	target Target,
) error {
	if !HasHook(tool, event) {
		return nil
	}
	if tool.ConfigFilePath == "" {
		return fmt.Errorf("tool %q registers a %s hook but has no configuration file path", tool.Name, event)
	}

	jsContent, err := compileFile(tool.ConfigFilePath)
	if err != nil {
		return fmt.Errorf("compiling %q for its %s hook: %w", tool.ConfigFilePath, event, err)
	}

	vm := goja.New()
	require.NewRegistry().Enable(vm)

	if err := RegisterBindings(vm, target); err != nil {
		return fmt.Errorf("registering Go bindings: %w", err)
	}
	homeDir := ""
	if projCfg != nil {
		homeDir = projCfg.Paths.HomeDir
	}
	if err := RegisterContextBindings(vm, log, fsys, homeDir); err != nil {
		return fmt.Errorf("registering context bindings: %w", err)
	}
	if err := registerHookShell(ctx, vm, log, runner, hookCtx.Env); err != nil {
		return fmt.Errorf("registering hook shell: %w", err)
	}
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return fmt.Errorf("initializing loader polyfills: %w", err)
	}

	// The directories the tool context derives its paths from (currentDir among them)
	// are resolved for the same reason the event context is: the hook's commands do
	// not run from the directory these are relative to.
	configFileDir := ""
	binariesDir := ""
	generatedDir := ""
	if projCfg != nil {
		configFileDir = projCfg.Paths.DotfilesDir
		binariesDir = projCfg.Paths.BinariesDir
		generatedDir = projCfg.Paths.GeneratedDir
	}
	for _, dir := range []*string{&configFileDir, &binariesDir, &generatedDir} {
		if *dir, err = absolutePath(fsys, *dir); err != nil {
			return err
		}
	}
	_ = vm.Set("configFileDir", configFileDir)
	_ = vm.Set("binariesDir", binariesDir)
	_ = vm.Set("generatedDir", generatedDir)
	_ = vm.Set("currentToolName", tool.Name)
	_ = vm.Set("currentToolPath", tool.ConfigFilePath)
	_ = vm.Set("systemInfo", vm.NewObject())

	if err := setJSONGlobal(vm, "projectConfig", projCfg); err != nil {
		return fmt.Errorf("providing project configuration to the %s hook: %w", event, err)
	}
	hookCtx, err = hookCtx.absolute(fsys)
	if err != nil {
		return err
	}
	if err := setJSONGlobal(vm, "__hookEventContext", hookCtx.toMap()); err != nil {
		return fmt.Errorf("providing %s hook context: %w", event, err)
	}
	_ = vm.Set("__hookCwd", hookWorkingDir(tool, projCfg))

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	// Evaluating the tool file registers its handlers.
	if _, err := vm.RunString(jsContent); err != nil {
		return fmt.Errorf("evaluating %q for its %s hook: %w", tool.ConfigFilePath, event, err)
	}

	return invokeRegisteredHook(vm, tool.Name, event)
}

// invokeRegisteredHook runs the handlers and reports what happened.
//
// The call is made from inside RunString because goja drains its promise job queue when
// the script it is running completes; invoking the handler through a bare Go call would
// leave the returned promise pending. An unsettled promise afterwards means the hook
// awaited something that never resolves, which is reported rather than ignored.
func invokeRegisteredHook(vm *goja.Runtime, toolName, event string) error {
	script := `
		globalThis.__hookOutcome = { settled: false, error: null };
		Promise.resolve(__invokeHook(__hookToolName, __hookEvent, __hookEventContext)).then(
			function () { __hookOutcome.settled = true; },
			function (e) {
				__hookOutcome.settled = true;
				__hookOutcome.error = (e && (e.stack || e.message)) ? String(e.stack || e.message) : String(e);
			}
		);
	`
	_ = vm.Set("__hookToolName", toolName)
	_ = vm.Set("__hookEvent", event)

	if _, err := vm.RunString(script); err != nil {
		return fmt.Errorf("running %s hook for %q: %w", event, toolName, err)
	}

	outcomeVal := vm.Get("__hookOutcome")
	if outcomeVal == nil || goja.IsUndefined(outcomeVal) || goja.IsNull(outcomeVal) {
		return fmt.Errorf("running %s hook for %q: hook outcome was not recorded", event, toolName)
	}
	outcome := outcomeVal.ToObject(vm)

	if !outcome.Get("settled").ToBoolean() {
		return fmt.Errorf(
			"%s hook for %q never finished: it awaited something that never resolves",
			event, toolName,
		)
	}
	if errVal := outcome.Get("error"); errVal != nil && !goja.IsNull(errVal) && !goja.IsUndefined(errVal) {
		return fmt.Errorf("%s hook for %q failed: %s", event, toolName, errVal.String())
	}
	return nil
}

// hookWorkingDir decides where a hook's commands run.
//
// Commands run from the directory holding the tool's configuration file, because that
// is the only location a hook cannot otherwise address: a script shipped next to the
// config is written as `./scripts/setup.sh` and has no absolute path the author could
// use. Everywhere else the hook might want is already handed to it by name --
// installedDir, stagingDir, currentDir -- so interpolating one of those is explicit
// about which tree is meant, rather than depending on an implied directory.
func hookWorkingDir(tool *config.ToolConfig, projCfg *config.ProjectConfig) string {
	if tool != nil && tool.ConfigFilePath != "" {
		return filepath.Dir(tool.ConfigFilePath)
	}
	if projCfg != nil {
		return projCfg.Paths.DotfilesDir
	}
	return ""
}

// setJSONGlobal hands a Go value to the VM by round-tripping it through JSON, which
// keeps the shape the tool author sees identical to the configuration they wrote.
func setJSONGlobal(vm *goja.Runtime, name string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("encoding %s: %w", name, err)
	}
	parsed, err := vm.RunString("(" + string(data) + ")")
	if err != nil {
		return fmt.Errorf("decoding %s inside the VM: %w", name, err)
	}
	return vm.Set(name, parsed)
}

// registerHookShell binds the shell a hook's `$` executes through.
//
// Commands run through the same command runner the rest of the installer uses, so they
// are logged, mockable in tests and cancellable with the installation's context.
func registerHookShell(ctx context.Context, vm *goja.Runtime, log *logger.Logger, runner exec.CommandRunner, env []string) error {
	return vm.Set("shellExec", func(toolName, command, cwd string, quiet, noThrow bool) goja.Value {
		var toolLog *logger.Logger
		if log != nil {
			toolLog = log.GetSubLogger("", toolName)
		}
		if toolLog != nil && !quiet {
			toolLog.Info(logger.Message("$ " + command))
		}

		if runner == nil {
			panic(vm.ToValue("no command runner is available to this VM"))
		}

		cmd := runner.CommandContext(ctx, "bash", "-c", command)
		if cwd != "" {
			cmd.SetDir(cwd)
		}
		if len(env) > 0 {
			cmd.SetEnv(env)
		}

		// The command's output is both shown as it arrives and kept, because a hook may
		// read it back with .text() while the person watching still wants to see it.
		var stdout, stderr strings.Builder
		if toolLog != nil && !quiet {
			writer := logger.NewLineWriter(toolLog, "|")
			defer writer.Flush()
			cmd.SetStdout(io.MultiWriter(&stdout, writer))
			cmd.SetStderr(io.MultiWriter(&stderr, writer))
		} else {
			cmd.SetStdout(&stdout)
			cmd.SetStderr(&stderr)
		}

		exitCode := 0
		if err := cmd.Run(); err != nil {
			exitCode = 1
			if !noThrow {
				panic(vm.ToValue(fmt.Sprintf(
					"command failed: %s: %v%s", command, err, trailingOutput(stderr.String()),
				)))
			}
		}

		result := vm.NewObject()
		_ = result.Set("stdout", stdout.String())
		_ = result.Set("stderr", stderr.String())
		_ = result.Set("exitCode", exitCode)
		return result
	})
}

// trailingOutput appends captured stderr to an error message when there is any, so a
// failing command explains itself instead of reporting only its exit status.
func trailingOutput(stderr string) string {
	trimmed := strings.TrimSpace(stderr)
	if trimmed == "" {
		return ""
	}
	return "\n" + trimmed
}
