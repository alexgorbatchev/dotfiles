package vm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/require"
	"github.com/go-sourcemap/sourcemap"
)

// HookError represents a failure during a lifecycle hook's execution.
// Error() returns a clean, single-line message naming the hook, the error message,
// and the source location in the .tool.ts file:
//
//	hook "<event>" failed: <message> (<file>:<line>)
//
// The full JavaScript stack trace is preserved in Stack for trace logging.
type HookError struct {
	Event   string
	Message string
	File    string
	Line    int
	Stack   string
}

func (e *HookError) Error() string {
	if e.File != "" && e.Line > 0 {
		return fmt.Sprintf("hook %q failed: %s (%s:%d)", e.Event, e.Message, e.File, e.Line)
	}
	if e.File != "" {
		return fmt.Sprintf("hook %q failed: %s (%s)", e.Event, e.Message, e.File)
	}
	return fmt.Sprintf("hook %q failed: %s", e.Event, e.Message)
}

func (e *HookError) Format(s fmt.State, verb rune) {
	switch verb {
	case 'v':
		if s.Flag('+') && e.Stack != "" {
			_, _ = io.WriteString(s, e.Error()+"\n"+e.Stack)
			return
		}
		fallthrough
	case 's':
		_, _ = io.WriteString(s, e.Error())
	case 'q':
		_, _ = fmt.Fprintf(s, "%q", e.Error())
	}
}

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
	// ExtractedFiles and Executables are what the extractor produced: every file it
	// unpacked, and the subset it marked executable. An after-extract hook placing a
	// binary reads them instead of walking the tree and repeating the heuristic.
	ExtractedFiles []string
	Executables    []string
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
		out["binaryPaths"] = nonNil(h.BinaryPaths)
	}
	if h.Version != "" {
		out["version"] = h.Version
	}
	if h.ExtractDir != "" {
		// Reported only alongside the directory it describes: an empty list handed to an
		// event that never extracted anything reads as "the archive was empty".
		out["extractResult"] = map[string]any{
			"extractedFiles": nonNil(h.ExtractedFiles),
			"executables":    nonNil(h.Executables),
		}
	}
	return out
}

// nonNil keeps an absent list from reaching JavaScript as null, which a hook iterating
// over it would trip on.
func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

// HasHook reports whether a tool registered any handler for an event. The loader
// records the event names alongside the tool's install parameters, so this answers
// without re-evaluating the tool file.
func HasHook(tool *config.ToolConfig, event string) bool {
	return tool.HasHook(event)
}

// HookOption configures how a lifecycle hook is executed.
type HookOption func(*hookOptions)

type hookOptions struct {
	evaluator *Evaluator
}

// WithHookEvaluator provides a retained Evaluator handle to RunHook.
func WithHookEvaluator(eval *Evaluator) HookOption {
	return func(o *hookOptions) {
		o.evaluator = eval
	}
}

// RunHook invokes the handlers a tool registered for a lifecycle event.
//
// When an Evaluator is provided (via opts or ctx), the tool's handler is called in that
// retained VM without re-evaluating the tool file. If no Evaluator is provided, the tool's
// configuration file is re-evaluated in a fresh VM as a fallback.
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
	opts ...HookOption,
) error {
	if !HasHook(tool, event) {
		return nil
	}

	if log != nil {
		log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("Running %s hook...", event)))
	}

	var ho hookOptions
	for _, opt := range opts {
		opt(&ho)
	}
	evaluator := ho.evaluator
	if evaluator == nil {
		evaluator = GetEvaluator(ctx)
	}

	if evaluator != nil {
		return runHookInEvaluator(ctx, evaluator, log, fsys, runner, tool, projCfg, event, hookCtx)
	}

	eval, err := evaluateToolFile(ctx, toolFileVM{
		log:     log,
		fsys:    fsys,
		runner:  runner,
		tool:    tool,
		projCfg: projCfg,
		env:     hookCtx.Env,
		target:  target,
		purpose: event + " hook",
	})
	if err != nil {
		return err
	}
	return invokeHookInVM(eval.vm, eval.sourceMap, tool, projCfg, fsys, event, hookCtx)
}

func runHookInEvaluator(
	ctx context.Context,
	evaluator *Evaluator,
	log *logger.Logger,
	fsys fs.FS,
	runner exec.CommandRunner,
	tool *config.ToolConfig,
	projCfg *config.ProjectConfig,
	event string,
	hookCtx HookContext,
) error {
	evaluator.mu.Lock()
	defer evaluator.mu.Unlock()
	vm := evaluator.vm

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

	configFileDir := ""
	binariesDir := ""
	generatedDir := ""
	if projCfg != nil {
		configFileDir = projCfg.ConfigFileDir
		binariesDir = projCfg.Paths.BinariesDir
		generatedDir = projCfg.Paths.GeneratedDir
	}
	var err error
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

	if projCfg != nil {
		if err := setJSONGlobal(vm, "projectConfig", projCfg); err != nil {
			return fmt.Errorf("providing project configuration to the %s hook: %w", event, err)
		}
	}
	if err := setJSONGlobal(vm, "currentToolConfig", tool); err != nil {
		return fmt.Errorf("providing the tool configuration to the %s hook: %w", event, err)
	}

	return invokeHookInVM(vm, evaluator.sourceMap, tool, projCfg, fsys, event, hookCtx)
}

func invokeHookInVM(
	vm *goja.Runtime,
	sourceMap []byte,
	tool *config.ToolConfig,
	projCfg *config.ProjectConfig,
	fsys fs.FS,
	event string,
	hookCtx HookContext,
) error {
	var err error
	hookCtx, err = hookCtx.absolute(fsys)
	if err != nil {
		return err
	}
	if err := setJSONGlobal(vm, "__hookEventContext", hookCtx.toMap()); err != nil {
		return fmt.Errorf("providing %s hook context: %w", event, err)
	}
	_ = vm.Set("__hookCwd", hookWorkingDir(tool, projCfg))
	_ = vm.Set("__hookToolName", tool.Name)
	_ = vm.Set("__hookEvent", event)

	what := fmt.Sprintf("%s hook for %q", event, tool.Name)
	if _, err := settleInVM(vm, "__invokeHook(__hookToolName, __hookEvent, __hookEventContext)", what); err != nil {
		outcomeVal := vm.Get("__vmOutcome")
		if outcomeVal != nil && !goja.IsUndefined(outcomeVal) && !goja.IsNull(outcomeVal) {
			outcome := outcomeVal.ToObject(vm)
			if outcome.Get("settled").ToBoolean() {
				errVal := outcome.Get("error")
				if errVal != nil && !goja.IsNull(errVal) && !goja.IsUndefined(errVal) {
					rawMsg := ""
					if msgVal := outcome.Get("errorMessage"); msgVal != nil && !goja.IsNull(msgVal) && !goja.IsUndefined(msgVal) {
						rawMsg = msgVal.String()
					}
					rawStack := ""
					if stackVal := outcome.Get("errorStack"); stackVal != nil && !goja.IsNull(stackVal) && !goja.IsUndefined(stackVal) {
						rawStack = stackVal.String()
					}
					return newHookError(event, tool, sourceMap, rawMsg, rawStack)
				}
			}
		}
		var ex *goja.Exception
		if errors.As(err, &ex) {
			rawMsg := ex.Value().String()
			rawStack := ex.String()
			return newHookError(event, tool, sourceMap, rawMsg, rawStack)
		}
		return err
	}
	return nil
}

// toolFileVM describes a VM that a tool's configuration file is evaluated in so that
// the functions it defines -- lifecycle handlers, install-parameter resolvers -- can be
// called during the installation. A function cannot survive the JSON boundary the
// configuration crosses to reach Go, so the file is read again at the moment it is
// needed. Re-evaluating is cheap next to an installation, and a VM per invocation keeps
// these calls from sharing mutable state with configuration loading or with each other.
type toolFileVM struct {
	log     *logger.Logger
	fsys    fs.FS
	runner  exec.CommandRunner
	tool    *config.ToolConfig
	projCfg *config.ProjectConfig
	env     []string
	target  Target
	// purpose names what the file is being re-read for, so a failure says which
	// installation step could not be carried out.
	purpose string
}

// evaluatedToolFile holds the VM and the source map from evaluating a tool configuration file.
type evaluatedToolFile struct {
	vm        *goja.Runtime
	sourceMap []byte
}

// evaluateToolFile builds the VM and evaluates the tool's configuration file in it.
func evaluateToolFile(ctx context.Context, req toolFileVM) (*evaluatedToolFile, error) {
	tool := req.tool
	if tool.ConfigFilePath == "" {
		return nil, fmt.Errorf("tool %q needs its configuration file for the %s but has no path to it", tool.Name, req.purpose)
	}

	script, err := compileFileWithSourceMap(tool.ConfigFilePath)
	if err != nil {
		return nil, fmt.Errorf("compiling %q for its %s: %w", tool.ConfigFilePath, req.purpose, err)
	}

	vm := goja.New()
	require.NewRegistry().Enable(vm)

	if err := RegisterBindings(vm, req.target); err != nil {
		return nil, fmt.Errorf("registering Go bindings: %w", err)
	}
	homeDir := ""
	if req.projCfg != nil {
		homeDir = req.projCfg.Paths.HomeDir
	}
	if err := RegisterContextBindings(vm, req.log, req.fsys, homeDir); err != nil {
		return nil, fmt.Errorf("registering context bindings: %w", err)
	}
	if err := registerHookShell(ctx, vm, req.log, req.runner, req.env); err != nil {
		return nil, fmt.Errorf("registering hook shell: %w", err)
	}
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return nil, fmt.Errorf("initializing loader polyfills: %w", err)
	}

	// The directories the tool context derives its paths from (currentDir among them)
	// are resolved for the same reason the event context is: the hook's commands do
	// not run from the directory these are relative to.
	configFileDir := ""
	binariesDir := ""
	generatedDir := ""
	if req.projCfg != nil {
		configFileDir = req.projCfg.ConfigFileDir
		binariesDir = req.projCfg.Paths.BinariesDir
		generatedDir = req.projCfg.Paths.GeneratedDir
	}
	for _, dir := range []*string{&configFileDir, &binariesDir, &generatedDir} {
		if *dir, err = absolutePath(req.fsys, *dir); err != nil {
			return nil, err
		}
	}
	_ = vm.Set("configFileDir", configFileDir)
	_ = vm.Set("binariesDir", binariesDir)
	_ = vm.Set("generatedDir", generatedDir)
	_ = vm.Set("currentToolName", tool.Name)
	_ = vm.Set("currentToolPath", tool.ConfigFilePath)

	if err := setJSONGlobal(vm, "projectConfig", req.projCfg); err != nil {
		return nil, fmt.Errorf("providing project configuration to the %s: %w", req.purpose, err)
	}
	// The resolved configuration of the tool being installed, so a hook can branch on
	// the method or on a parameter it was given without re-reading its own file.
	if err := setJSONGlobal(vm, "currentToolConfig", tool); err != nil {
		return nil, fmt.Errorf("providing the tool configuration to the %s: %w", req.purpose, err)
	}

	// The same process.env the configuration was read with. A tool file that reads an
	// environment variable does so at its top level, which runs again here; without it
	// the file would fail on the second evaluation but not the first.
	setProcessEnvGlobal(vm)

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	// Evaluating the tool file registers its handlers and resolvers.
	if _, err := vm.RunString(script.code); err != nil {
		diag := FormatVMFailure(vm, script.code, script.sourceMap, req.fsys, configFileDir, tool.ConfigFilePath, err)
		return nil, fmt.Errorf("evaluating %q for its %s: %w", tool.ConfigFilePath, req.purpose, diag)
	}
	// An asynchronous factory hands the builder back rather than its promise, so nothing
	// in the VM observes how it ended. A rejection here means the file registered only
	// the handlers and resolvers that precede its first await: the hook would not run,
	// the resolver would not answer, and the installation would carry on as if the work
	// had been done. The load settles these promises for the same reason, so a factory
	// that fails fails alike whichever evaluation reaches it.
	if err := settleToolFactories(vm, script.sourceMap, req.fsys, configFileDir); err != nil {
		return nil, err
	}
	return &evaluatedToolFile{
		vm:        vm,
		sourceMap: script.sourceMap,
	}, nil
}

// setProcessEnvGlobal exposes the CLI process's environment as `process.env`, the only
// member of `process` the configuration runtime provides.
func setProcessEnvGlobal(vm *goja.Runtime) {
	envObj := vm.NewObject()
	for _, entry := range os.Environ() {
		if name, value, found := strings.Cut(entry, "="); found {
			_ = envObj.Set(name, value)
		}
	}
	processObj := vm.NewObject()
	_ = processObj.Set("env", envObj)
	_ = vm.Set("process", processObj)
}

// settleInVM evaluates expression, waits for the promise it produces to settle, and
// returns the fulfilled value encoded as JSON.
//
// The call is made from inside RunString because goja drains its promise job queue when
// the script it is running completes; invoking through a bare Go call would leave the
// returned promise pending. An unsettled promise afterwards means the code awaited
// something that never resolves, which is reported rather than ignored.
//
// expression is assembled here from globals Go has already set, never from anything a
// configuration supplied, so nothing a tool author writes is spliced into the script.
func settleInVM(vm *goja.Runtime, expression, what string) (string, error) {
	script := `
		globalThis.__vmOutcome = { settled: false, error: null, errorMessage: "", errorStack: "", value: "" };
		Promise.resolve(` + expression + `).then(
			function (v) {
				__vmOutcome.settled = true;
				__vmOutcome.value = JSON.stringify(
					v === undefined ? null : v,
					function (k, val) { return val instanceof RegExp ? val.toString() : val; }
				);
			},
			function (e) {
				__vmOutcome.settled = true;
				var msg = "";
				var stack = "";
				if (e instanceof Error || (typeof e === "object" && e !== null)) {
					msg = e.message ? String(e.message) : (e.name ? String(e.name) : String(e));
					stack = e.stack ? String(e.stack) : "";
				} else {
					msg = String(e);
				}
				if (!stack) {
					stack = msg;
				}
				__vmOutcome.error = stack;
				__vmOutcome.errorMessage = msg;
				__vmOutcome.errorStack = stack;
			}
		);
	`

	if _, err := vm.RunString(script); err != nil {
		return "", fmt.Errorf("running %s: %w", what, err)
	}

	outcomeVal := vm.Get("__vmOutcome")
	if outcomeVal == nil || goja.IsUndefined(outcomeVal) || goja.IsNull(outcomeVal) {
		return "", fmt.Errorf("running %s: the outcome was not recorded", what)
	}
	outcome := outcomeVal.ToObject(vm)

	if !outcome.Get("settled").ToBoolean() {
		return "", fmt.Errorf("%s never finished: it awaited something that never resolves", what)
	}
	if errVal := outcome.Get("error"); errVal != nil && !goja.IsNull(errVal) && !goja.IsUndefined(errVal) {
		return "", fmt.Errorf("%s failed: %s", what, errVal.String())
	}
	return outcome.Get("value").String(), nil
}

var gojaFramePosRegex = regexp.MustCompile(`:(\d+):(\d+)`)

func newHookError(event string, tool *config.ToolConfig, sourceMap []byte, rawMsg, rawStack string) *HookError {
	msg := formatSingleLine(rawMsg)
	if msg == "" && rawStack != "" {
		firstLine, _, _ := strings.Cut(rawStack, "\n")
		msg = formatSingleLine(firstLine)
	}
	msg = strings.TrimPrefix(msg, "Error: ")
	if msg == "" {
		msg = "failed"
	}

	file := ""
	if tool != nil && tool.ConfigFilePath != "" {
		file = filepath.Base(tool.ConfigFilePath)
	}
	line := 0

	if len(sourceMap) > 0 && rawStack != "" {
		consumer, err := sourcemap.Parse("", sourceMap)
		if err == nil {
			lines := strings.Split(rawStack, "\n")
			for _, l := range lines {
				if !strings.Contains(l, "at ") {
					continue
				}
				matches := gojaFramePosRegex.FindStringSubmatch(l)
				if len(matches) < 3 {
					continue
				}
				genLine, err1 := strconv.Atoi(matches[1])
				genCol, err2 := strconv.Atoi(matches[2])
				if err1 != nil || err2 != nil {
					continue
				}
				src, _, srcLine, _, ok := consumer.Source(genLine, genCol)
				if !ok || srcLine <= 0 {
					continue
				}
				if strings.Contains(src, ".tool.") {
					file = filepath.Base(src)
					line = srcLine
					break
				}
				if line == 0 && !strings.Contains(src, "loader-api") {
					file = filepath.Base(src)
					line = srcLine
				}
			}
		}
	}

	return &HookError{
		Event:   event,
		Message: msg,
		File:    file,
		Line:    line,
		Stack:   strings.TrimRight(rawStack, "\n"),
	}
}

func formatSingleLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	var parts []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			parts = append(parts, l)
		}
	}
	return strings.Join(parts, ": ")
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
			toolLog = log.WithTag(toolName)
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
