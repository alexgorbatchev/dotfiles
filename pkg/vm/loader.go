package vm

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/require"
	"github.com/evanw/esbuild/pkg/api"
)

//go:embed loader-api.ts
var loaderApiContentsRaw string

//go:embed polyfills.ts
var LoaderPolyfillsRaw string

var (
	loaderApiContents string
	LoaderPolyfills   string
)

func init() {
	var err error
	loaderApiContents, err = transpileTS(loaderApiContentsRaw)
	if err != nil {
		panic(fmt.Errorf("failed to transpile embedded loader-api.ts: %w", err))
	}

	LoaderPolyfills, err = transpileTS(LoaderPolyfillsRaw)
	if err != nil {
		panic(fmt.Errorf("failed to transpile embedded polyfills.ts: %w", err))
	}
}

func transpileTS(tsCode string) (string, error) {
	result := api.Transform(tsCode, api.TransformOptions{
		Loader: api.LoaderTS,
		Target: api.ES2015,
		Format: api.FormatCommonJS,
	})
	if len(result.Errors) > 0 {
		var msgs []string
		for _, e := range result.Errors {
			msgs = append(msgs, e.Text)
		}
		return "", fmt.Errorf("transpilation errors: %s", strings.Join(msgs, "; "))
	}
	code := string(result.Code)
	// Delete any CommonJS exports assignment to avoid disconnecting module.exports
	code = strings.ReplaceAll(code, "module.exports = __toCommonJS(stdin_exports);", "")
	return code, nil
}

// loaderResultEnvelope is the shape of __loaderResult as the bundle produced it.
type loaderResultEnvelope struct {
	ToolConfigs map[string]*config.ToolConfig `json:"toolConfigs"`
}

// unifiedLoaderResult holds the returned project config and tool configs from evaluating
// the dynamically compiled TypeScript loader bundle.
type unifiedLoaderResult struct {
	ProjectConfig *config.ProjectConfig
	ToolConfigs   map[string]*config.ToolConfig
}

// Option configures how a configuration is loaded.
type Option func(*loadOptions)

type loadOptions struct {
	target Target
}

// WithTarget evaluates platform-dependent configuration in tool files against the given
// target rather than the host. Empty fields fall back to the host. It backs the
// --platform, --arch and --libc flags.
func WithTarget(target Target) Option {
	return func(o *loadOptions) {
		o.target = target
	}
}

func newLoadOptions(opts []Option) loadOptions {
	var resolved loadOptions
	for _, opt := range opts {
		opt(&resolved)
	}
	return resolved
}

// LoadTypeScriptConfig loads and compiles a TypeScript config file and all tool configs
// dynamically, returning the unmarshaled ProjectConfig and map of ToolConfigs.
func LoadTypeScriptConfig(log *logger.Logger, fsys fs.FS, configPath string, opts ...Option) (*config.ProjectConfig, map[string]*config.ToolConfig, error) {
	target := newLoadOptions(opts).target

	absConfigPath, err := filepath.Abs(configPath)
	if err != nil {
		return nil, nil, fmt.Errorf("resolving absolute config path: %w", err)
	}

	configFileDir := filepath.Dir(absConfigPath)

	// Step 1: Pre-evaluate config.ts to discover Paths.ToolConfigsDir
	configJS, err := compileFile(absConfigPath)
	if err != nil {
		return nil, nil, fmt.Errorf("compiling project config %q: %w", absConfigPath, err)
	}

	projCfg, err := evaluateProjectConfig(log, fsys, configJS, absConfigPath, target)
	if err != nil {
		return nil, nil, fmt.Errorf("evaluating project config: %w", err)
	}

	// Resolve path placeholders and defaults once, here, so tool discovery, the values
	// handed to the JS VM, and the config the caller receives all agree instead of each
	// re-deriving them from the raw config.
	if err := projCfg.ResolvePlaceholders(configFileDir); err != nil {
		return nil, nil, fmt.Errorf("resolving paths in %q: %w", filepath.Base(absConfigPath), err)
	}

	// Step 2: Scan the resolved ToolConfigsDir(s) for *.tool.ts files
	resolvedDirs := projCfg.Paths.GetToolConfigsDirs()

	var toolFiles []string
	seenFiles := make(map[string]bool)
	for _, resolvedDir := range resolvedDirs {
		if exists, _ := dirExists(fsys, resolvedDir); !exists {
			continue
		}
		files, err := findToolConfigFiles(resolvedDir)
		if err != nil {
			return nil, nil, fmt.Errorf("finding tool config files under %q: %w", resolvedDir, err)
		}
		for _, f := range files {
			if !seenFiles[f] {
				seenFiles[f] = true
				toolFiles = append(toolFiles, f)
			}
		}
	}

	// Step 3: Write a temporary entry loader script next to the config file
	// and compile/bundle everything together with esbuild
	entryFileContent, err := generateEntryLoader(absConfigPath, toolFiles)
	if err != nil {
		return nil, nil, fmt.Errorf("generating entry loader content: %w", err)
	}

	tempEntryName := fmt.Sprintf(".dotfiles-loader-entry-%d-%d.ts", os.Getpid(), time.Now().UnixNano())
	tempEntryPath := filepath.Join(configFileDir, tempEntryName)
	if err := os.WriteFile(tempEntryPath, []byte(entryFileContent), 0644); err != nil {
		return nil, nil, fmt.Errorf("writing temporary loader entry: %w", err)
	}
	defer os.Remove(tempEntryPath)

	bundledJS, err := compileFile(tempEntryPath)
	if err != nil {
		return nil, nil, fmt.Errorf("bundling configuration: %w", err)
	}

	// Step 4: Run the unified bundle in Goja and marshal the result
	fullConfig, err := evaluateUnifiedBundle(log, fsys, bundledJS, absConfigPath, projCfg, target)
	if err != nil {
		return nil, nil, fmt.Errorf("evaluating unified config bundle: %w", err)
	}

	// The configuration is only complete here: placeholders are resolved, defaults are
	// filled in and the project-level platform overrides have been folded in, so this
	// is the first point at which a required setting can be reported as missing rather
	// than silently resolved against the working directory.
	if err := fullConfig.ProjectConfig.ResolvePlaceholders(configFileDir); err != nil {
		return nil, nil, fmt.Errorf("resolving paths in %q: %w", filepath.Base(absConfigPath), err)
	}
	if err := fullConfig.ProjectConfig.Validate(); err != nil {
		return nil, nil, fmt.Errorf("invalid configuration in %q: %w", filepath.Base(absConfigPath), err)
	}
	if err := config.ValidateToolConfigs(slices.Collect(maps.Values(fullConfig.ToolConfigs)), fullConfig.ProjectConfig); err != nil {
		return nil, nil, err
	}

	return fullConfig.ProjectConfig, fullConfig.ToolConfigs, nil
}

func compileFile(entryPath string) (string, error) {
	resolverPlugin := api.Plugin{
		Name: "resolver",
		Setup: func(build api.PluginBuild) {
			build.OnResolve(api.OnResolveOptions{Filter: `^@alexgorbatchev/dotfiles|^@dotfiles/cli|^@dotfiles/core`},
				func(args api.OnResolveArgs) (api.OnResolveResult, error) {
					return api.OnResolveResult{
						Path:      "loader-api.ts",
						Namespace: "loader-api",
					}, nil
				})
			build.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: "loader-api"},
				func(args api.OnLoadArgs) (api.OnLoadResult, error) {
					return api.OnLoadResult{
						Contents: &loaderApiContentsRaw,
						Loader:   api.LoaderTS,
					}, nil
				})

			build.OnResolve(api.OnResolveOptions{Filter: `.*e2eGeneratedDir`},
				func(args api.OnResolveArgs) (api.OnResolveResult, error) {
					return api.OnResolveResult{
						Path:      "e2eGeneratedDir.ts",
						Namespace: "e2eGeneratedDir",
					}, nil
				})
			build.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: "e2eGeneratedDir"},
				func(args api.OnLoadArgs) (api.OnLoadResult, error) {
					contents := `export function getE2eGeneratedDir(configDir) { return configDir + "/.generated"; }`
					return api.OnLoadResult{
						Contents: &contents,
						Loader:   api.LoaderTS,
					}, nil
				})

			build.OnLoad(api.OnLoadOptions{Filter: `\.[cm]?[jt]sx?$`},
				func(args api.OnLoadArgs) (api.OnLoadResult, error) {
					data, err := os.ReadFile(args.Path)
					if err != nil {
						return api.OnLoadResult{}, err
					}

					dirStr := strconv.Quote(filepath.ToSlash(filepath.Dir(args.Path)))
					content := string(data)
					content = strings.ReplaceAll(content, "import.meta.dirname", dirStr)
					content = strings.ReplaceAll(content, "import_meta.dirname", dirStr)
					content = strings.ReplaceAll(content, "__dirname", dirStr)

					loader := api.LoaderDefault
					switch filepath.Ext(args.Path) {
					case ".ts":
						loader = api.LoaderTS
					case ".tsx":
						loader = api.LoaderTSX
					case ".js", ".mjs", ".cjs":
						loader = api.LoaderJS
					case ".jsx":
						loader = api.LoaderJSX
					}

					return api.OnLoadResult{
						Contents: &content,
						Loader:   loader,
					}, nil
				})
		},
	}

	result := api.Build(api.BuildOptions{
		EntryPoints: []string{entryPath},
		Bundle:      true,
		Write:       false,
		Plugins:     []api.Plugin{resolverPlugin},
		LogLevel:    api.LogLevelSilent,
		Format:      api.FormatCommonJS,
		Target:      api.ES2015,
	})

	if len(result.Errors) > 0 {
		var msgs []string
		for _, e := range result.Errors {
			msgs = append(msgs, e.Text)
		}
		return "", fmt.Errorf("esbuild compile errors: %s", strings.Join(msgs, "; "))
	}

	if len(result.OutputFiles) == 0 {
		return "", fmt.Errorf("esbuild compile output is empty")
	}

	code := string(result.OutputFiles[0].Contents)
	return code, nil
}

func evaluateProjectConfig(log *logger.Logger, fsys fs.FS, jsContent string, configPath string, target Target) (*config.ProjectConfig, error) {
	configFileDir := filepath.Dir(configPath)

	vm := goja.New()
	registry := require.NewRegistry()
	registry.Enable(vm)

	if err := RegisterBindings(vm, target); err != nil {
		return nil, fmt.Errorf("registering Go bindings: %w", err)
	}

	// The project configuration is what defines homeDir, so it is not known yet while
	// that configuration is being evaluated.
	if err := RegisterContextBindings(vm, log, fsys, ""); err != nil {
		return nil, fmt.Errorf("registering context bindings: %w", err)
	}

	// Register file system / path polyfills
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return nil, fmt.Errorf("initializing loader polyfills: %w", err)
	}

	// Set globals
	_ = vm.Set("configFileDir", configFileDir)
	if err := setJSONGlobal(vm, "configContext", newConfigContext(configFileDir, "", target)); err != nil {
		return nil, fmt.Errorf("providing the context to the configuration file: %w", err)
	}
	setProcessEnvGlobal(vm)

	// Set module and exports
	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	if _, err := vm.RunString(jsContent); err != nil {
		return nil, fmt.Errorf("executing script in Goja VM: %w", err)
	}

	configExport, err := exportedProjectConfig(vm, configPath)
	if err != nil {
		return nil, err
	}
	_ = vm.Set("__configExport", configExport)

	if err := resolveConfigExport(vm, "globalThis.__configExport", configPath); err != nil {
		return nil, err
	}

	if resolved := vm.Get("__configExport"); !isConfigurationObject(resolved) {
		return nil, notAConfigurationError(configPath, describeExport(resolved))
	}

	// Stringify with a RegExp replacer, because a pattern only survives the crossing to
	// Go as its source text.
	jsonVal, err := vm.RunString("JSON.stringify(__configExport, function(k, v) { return v instanceof RegExp ? v.toString() : v; })")
	if err != nil {
		return nil, fmt.Errorf("stringifying project config inside JS VM: %w", err)
	}

	return decodeProjectConfig([]byte(jsonVal.String()), target)
}

// exportedProjectConfig returns the default export of the configuration file, which is
// either the configuration itself or the factory that produces it, and refuses a file
// that exported nothing at all.
//
// The refusal belongs here rather than in the callers: this is the last point at which
// what the file exported is still known, so it is the only place that can say a
// configuration is missing instead of leaving a nil configuration to be dereferenced by
// whichever caller reaches it first.
//
// A module esbuild compiled from ES module syntax carries its default export as the
// "default" property (`__esModule` marks it as one even when the property is absent); a
// file written as CommonJS has no such property and its `module.exports` is the
// configuration itself.
func exportedProjectConfig(vm *goja.Runtime, configPath string) (goja.Value, error) {
	moduleVal := vm.Get("module")
	if moduleVal == nil || goja.IsUndefined(moduleVal) || goja.IsNull(moduleVal) {
		return nil, notAConfigurationError(configPath, "no module")
	}

	exports := moduleVal.ToObject(vm).Get("exports")
	if exports == nil || goja.IsUndefined(exports) || goja.IsNull(exports) {
		return nil, notAConfigurationError(configPath, "no default export")
	}

	value := exports
	if exportsObj, ok := exports.(*goja.Object); ok {
		if defaultExport := exportsObj.Get("default"); defaultExport != nil {
			value = defaultExport
		} else if esModule := exportsObj.Get("__esModule"); esModule != nil && esModule.ToBoolean() {
			return nil, notAConfigurationError(configPath, "no default export")
		}
	}

	return value, nil
}

// resolveConfigExport turns what a configuration file exported into the configuration
// itself, in place, so that the caller reads a configuration rather than the factory
// that produces one or the promise that will.
//
// A factory is called with the context Go published as the `configContext` global, which
// is the same object defineConfig hands its own callback, so that a file written as
// `export default (ctx) => ({ ... })` receives what one written with defineConfig
// receives. The promise an asynchronous factory returns is settled here, where the
// configuration file is still known: JSON.stringify of a pending promise is an empty
// object, which is a valid configuration, so every setting the file wrote would
// otherwise be replaced by its default without a word.
//
// reference is assembled by the loader from what it has itself set in the VM, never from
// anything a configuration supplied.
func resolveConfigExport(vm *goja.Runtime, reference, configPath string) error {
	expression := fmt.Sprintf(
		`Promise.resolve(typeof %[1]s === "function" ? %[1]s(configContext) : %[1]s).then(function (resolved) { %[1]s = resolved; return null; })`,
		reference,
	)
	_, err := settleInVM(vm, expression, fmt.Sprintf("executing configuration file %q", configPath))
	return err
}

// isConfigurationObject reports whether value is a plain object, which is what a
// configuration file has to produce once its factory has been called and its promise
// settled.
func isConfigurationObject(value goja.Value) bool {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return false
	}
	_, ok := value.Export().(map[string]any)
	return ok
}

// notAConfigurationError reports a configuration file that produced something other than
// a configuration object, naming the file and what it produced instead.
func notAConfigurationError(configPath, got string) error {
	return fmt.Errorf("configuration file %q must export a configuration object with `export default defineConfig(...)`, got %s", configPath, got)
}

// describeExport names the value a configuration file exported, so that the refusal says
// what was found rather than only what was expected.
func describeExport(value goja.Value) string {
	switch {
	case value == nil || goja.IsUndefined(value):
		return "undefined"
	case goja.IsNull(value):
		return "null"
	}
	switch exported := value.Export().(type) {
	case func(goja.FunctionCall) goja.Value:
		return "a function"
	case []any:
		return "an array"
	case string:
		return fmt.Sprintf("the string %q", exported)
	case bool:
		return fmt.Sprintf("the boolean %t", exported)
	case int64:
		return fmt.Sprintf("the number %d", exported)
	case float64:
		return fmt.Sprintf("the number %v", exported)
	}
	return fmt.Sprintf("%v", value)
}

// decodeProjectConfig validates the JSON a configuration file evaluated to, folds the
// project-level platform overrides that apply to target into it, and decodes the
// result. The overrides are matched against the same target as tool-level .platform()
// blocks, so --platform/--arch steer both.
func decodeProjectConfig(jsonBytes []byte, target Target) (*config.ProjectConfig, error) {
	if err := config.ValidateProjectConfigRawJSON(jsonBytes); err != nil {
		return nil, err
	}

	resolved, err := config.ApplyPlatformOverrides(jsonBytes, target.os(), target.arch())
	if err != nil {
		return nil, fmt.Errorf("applying platform overrides: %w", err)
	}

	var projCfg config.ProjectConfig
	dec := json.NewDecoder(bytes.NewReader(resolved))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&projCfg); err != nil {
		return nil, fmt.Errorf("unmarshaling JSON to ProjectConfig struct: %w", err)
	}

	return &projCfg, nil
}

// evaluateUnifiedBundle runs the bundle of the configuration file and every tool file.
// projCfg is the project configuration already resolved from the configuration file,
// which the bundle hands to tool files as ctx.projectConfig so that they observe the
// same paths Go does rather than the raw value the file returned.
func evaluateUnifiedBundle(log *logger.Logger, fsys fs.FS, jsContent string, configPath string, projCfg *config.ProjectConfig, target Target) (*unifiedLoaderResult, error) {
	configFileDir := filepath.Dir(configPath)

	vm := goja.New()
	registry := require.NewRegistry()
	registry.Enable(vm)

	if err := RegisterBindings(vm, target); err != nil {
		return nil, fmt.Errorf("registering Go bindings: %w", err)
	}

	if err := RegisterContextBindings(vm, log, fsys, projCfg.Paths.HomeDir); err != nil {
		return nil, fmt.Errorf("registering context bindings: %w", err)
	}

	// Register file system / path polyfills
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return nil, fmt.Errorf("initializing loader polyfills: %w", err)
	}

	// Set globals
	_ = vm.Set("configFileDir", configFileDir)
	_ = vm.Set("generatedDir", projCfg.Paths.GeneratedDir)
	_ = vm.Set("binariesDir", projCfg.Paths.BinariesDir)
	if err := setJSONGlobal(vm, "projectConfig", projCfg); err != nil {
		return nil, fmt.Errorf("providing project configuration to tool files: %w", err)
	}
	setProcessEnvGlobal(vm)

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	if _, err := vm.RunString(jsContent); err != nil {
		return nil, describeBundleFailure(vm, jsContent, err)
	}

	if err := settleToolFactories(vm); err != nil {
		return nil, err
	}

	if err := settleDeclarationResolutions(vm); err != nil {
		return nil, err
	}

	// Retrieve dynamic loader results
	loaderResultVal := vm.Get("__loaderResult")
	if loaderResultVal == nil || goja.IsUndefined(loaderResultVal) || goja.IsNull(loaderResultVal) {
		return nil, fmt.Errorf("loader result __loaderResult is missing or undefined")
	}

	jsonVal, err := vm.RunString("JSON.stringify(__loaderResult, function(k, v) { return v instanceof RegExp ? v.toString() : v; })")
	if err != nil {
		return nil, fmt.Errorf("stringifying loader result inside JS VM: %w", err)
	}

	jsonBytes := []byte(jsonVal.String())

	if err := config.ValidateLoaderResultRawJSON(jsonBytes); err != nil {
		return nil, err
	}

	var envelope loaderResultEnvelope
	dec := json.NewDecoder(bytes.NewReader(jsonBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&envelope); err != nil {
		return nil, fmt.Errorf("unmarshaling loader result: %w", err)
	}

	return &unifiedLoaderResult{ProjectConfig: projCfg, ToolConfigs: envelope.ToolConfigs}, nil
}

// settleToolFactories waits for the promise every asynchronous tool factory returned and
// reports the first one that failed.
//
// defineTool returns the builder the entry loader registers rather than the promise, so
// nothing in the VM observes how an asynchronous factory ended. A rejection would leave
// the tool in the configuration missing everything the factory configured after its
// first await, with nothing logged and a successful exit -- the same failure the
// synchronous path reports by name. The promises are settled here, where the tool file
// each one came from is still known, so that both paths fail alike.
func settleToolFactories(vm *goja.Runtime) error {
	registry := vm.Get("__toolFactories")
	if registry == nil || goja.IsUndefined(registry) || goja.IsNull(registry) {
		return nil
	}

	factories := registry.ToObject(vm)
	count := factories.Get("length").ToInteger()
	for i := range count {
		toolPath := factories.Get(strconv.FormatInt(i, 10)).ToObject(vm).Get("path").String()
		what := fmt.Sprintf("executing tool file %q", toolPath)
		if _, err := settleInVM(vm, fmt.Sprintf("__toolFactories[%d].promise", i), what); err != nil {
			return err
		}
	}
	return nil
}

// settleDeclarationResolutions waits for every declared value that was given as a
// function rather than as a literal -- a block's content, a template's variables.
//
// The function is called while the tool file runs, but an asynchronous one only
// returns a promise, and a promise serialises to an empty object. Left unsettled, the
// tool would reach Go with a block whose content is nothing at all and no error to
// say so. They are settled after the tool factories, because a factory that awaits
// before declaring a block has not declared it yet when its own promise settles.
func settleDeclarationResolutions(vm *goja.Runtime) error {
	registry := vm.Get("__pendingResolutions")
	if registry == nil || goja.IsUndefined(registry) || goja.IsNull(registry) {
		return nil
	}

	pending := registry.ToObject(vm)
	count := pending.Get("length").ToInteger()
	for i := range count {
		entry := pending.Get(strconv.FormatInt(i, 10)).ToObject(vm)
		what := fmt.Sprintf("resolving %s", entry.Get("describe").String())
		if _, err := settleInVM(vm, fmt.Sprintf("__pendingResolutions[%d].promise", i), what); err != nil {
			return err
		}
	}
	return nil
}

// memberCallCallee matches the property name a member call names, so that ".binaries"
// can be recovered from the source text preceding the call's opening parenthesis.
var memberCallCallee = regexp.MustCompile(`\.([\p{L}_$][\p{L}\p{N}_$]*)\s*$`)

// describeBundleFailure turns a failure of the generated bundle into a message the
// author of a tool file can act on. Goja reports a line and column into that bundle,
// which exists on no disk, so the tool file being evaluated is read back from the VM
// and the call that failed is recovered from the bundle source instead.
func describeBundleFailure(vm *goja.Runtime, bundledJS string, err error) error {
	toolPath := stringGlobal(vm, "currentToolPath")
	if toolPath == "" {
		return fmt.Errorf("executing script in Goja VM: %w", err)
	}
	if method := failingCallee(bundledJS, err); method != "" {
		return fmt.Errorf("executing tool file %q at .%s(): %w", toolPath, method, err)
	}
	return fmt.Errorf("executing tool file %q: %w", toolPath, err)
}

// stringGlobal reads a global the bundle set, or returns "" when it holds no string.
func stringGlobal(vm *goja.Runtime, name string) string {
	value := vm.Get(name)
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return ""
	}
	return value.String()
}

// failingCallee names the method of the call the VM was making when it threw, for the
// calls Goja reports at their opening parenthesis: calling a member that is not a
// function, and calling a member the object does not have. Anything else, including a
// position the bundle source does not line up with, yields "" so that the caller falls
// back to naming only the tool file.
func failingCallee(bundledJS string, err error) string {
	var exception *goja.Exception
	if !errors.As(err, &exception) {
		return ""
	}
	frames := exception.Stack()
	if len(frames) == 0 {
		return ""
	}

	position := frames[0].Position()
	lines := strings.Split(bundledJS, "\n")
	if position.Line < 1 || position.Line > len(lines) {
		return ""
	}

	line := lines[position.Line-1]
	if position.Column < 2 || position.Column > len(line) || line[position.Column-1] != '(' {
		return ""
	}

	callee := memberCallCallee.FindStringSubmatch(line[:position.Column-1])
	if callee == nil {
		return ""
	}
	return callee[1]
}

func generateEntryLoader(configPath string, toolFiles []string) (string, error) {
	var sb strings.Builder

	// Setup require mappings for tool config files
	sb.WriteString("const toolModules = {\n")
	configDir := filepath.Dir(configPath)
	for _, file := range toolFiles {
		relPath, err := filepath.Rel(configDir, file)
		if err != nil {
			return "", fmt.Errorf("failed to get relative path for tool %q: %w", file, err)
		}
		relPath = filepath.ToSlash(relPath)
		// esbuild treats a bare specifier as a package, so a relative path needs an
		// explicit "./" prefix. Testing for a leading "." alone is not enough: a tool
		// configs directory under a dotted directory such as ".generated" produces a
		// path like ".generated/tools/bat.tool.ts", which is still a bare specifier.
		if !strings.HasPrefix(relPath, "./") && !strings.HasPrefix(relPath, "../") && !strings.HasPrefix(relPath, "/") {
			relPath = "./" + relPath
		}
		absFile, _ := filepath.Abs(file)
		absFile = filepath.ToSlash(absFile)
		sb.WriteString(fmt.Sprintf("  %q: { load: () => require(%q), absPath: %q },\n", relPath, relPath, absFile))
	}
	sb.WriteString("};\n\n")

	sb.WriteString(`
const toolConfigs = {};
for (const [path, entry] of Object.entries(toolModules)) {
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  const fallbackName = filename.replace(/\.tool\.ts$/, "");

  // Go reads these back off the VM to name the tool file in a failure, so they are set
  // before the module is evaluated rather than after it has returned a configuration.
  globalThis.currentToolName = fallbackName;
  globalThis.currentToolPath = entry.absPath;

  const mod = entry.load();
  const t = mod.default || mod;
  if (t) {
    if (!t.name) {
      t.name = fallbackName;
    }
    t.configFilePath = entry.absPath;
    toolConfigs[t.name] = t;
  }
}
`)

	sb.WriteString(`
globalThis.__loaderResult = {
  toolConfigs: toolConfigs
};
`)

	return sb.String(), nil
}

func dirExists(fsys fs.FS, path string) (bool, error) {
	if fsys != nil {
		if info, err := fsys.Stat(path); err == nil {
			return info.IsDir(), nil
		}
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return info.IsDir(), nil
}

func findToolConfigFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasSuffix(info.Name(), ".tool.ts") {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}
