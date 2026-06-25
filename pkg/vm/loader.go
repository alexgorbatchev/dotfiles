package vm

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/evanw/esbuild/pkg/api"
	"github.com/grafana/sobek"
)

// loaderApiContents is the TypeScript-based implementation of the config-loader API.
// It matches the defineConfig/defineTool helper DSL that was present in legacy TS packages.
const loaderApiContents = `
export const Platform = Object.freeze({ None: 0, Linux: 1, MacOS: 2, Windows: 4, Unix: 3, All: 7 });
export const Architecture = Object.freeze({ None: 0, X86_64: 1, Arm64: 2, All: 3 });

export function defineConfig(callback) {
  if (typeof callback === 'function') {
    return callback({
      configFileDir: globalThis.configFileDir || "",
      systemInfo: {
        os: getOS(),
        arch: getArch(),
        libc: detectLibc()
      }
    });
  }
  return callback;
}

export function defineTool(callback) {
  const builder = {
    name: "",
    installationMethod: "",
    installParams: {},
    binaries: [],
    version: "latest",
    dependencies: [],
    symlinks: [],
    copies: [],
    shellConfigs: {},

    bin(name, pattern) {
      if (pattern !== undefined) {
        this.binaries.push({ name: name, pattern: pattern });
      } else if (Array.isArray(name)) {
        this.binaries = name;
      } else {
        this.binaries = Array.prototype.slice.call(arguments);
      }
      return this;
    },

    version(v) {
      this.version = v;
      return this;
    },

    sudo() {
      this.sudo = true;
      return this;
    },

    disable() {
      this.disabled = true;
      return this;
    },

    hostname(pattern) {
      this.hostname = pattern;
      return this;
    },

    updateCheck(config) {
      this.updateCheck = config;
      return this;
    },

    copy(src, dst) {
      this.copies = this.copies || [];
      this.copies.push({ source: src, target: dst });
      return this;
    },

    dependsOn(dep) {
      if (Array.isArray(dep)) {
        this.dependencies = this.dependencies.concat(dep);
      } else {
        this.dependencies.push(dep);
      }
      return this;
    },

    depends(dep) {
      return this.dependsOn(dep);
    },

    symlink(src, dst) {
      this.symlinks = this.symlinks || [];
      this.symlinks.push({ source: src, target: dst });
      return this;
    },

    hook(name, cb) {
      if (typeof cb === 'function') {
        const commands = [];
        const mockShell = (strings, ...values) => {
          let result = "";
          if (Array.isArray(strings)) {
            for (let i = 0; i < strings.length; i++) {
              result += strings[i];
              if (i < values.length) {
                result += values[i];
              }
            }
          } else {
            result = strings;
          }
          commands.push(result);
          return Promise.resolve("");
        };
        
        const hookCtx = {
          $: mockShell,
          toolName: this.name || globalThis.currentToolName || ""
        };
        
        cb(hookCtx);
        
        if (commands.length > 0) {
          this.installParams = this.installParams || {};
          this.installParams.hooks = this.installParams.hooks || {};
          this.installParams.hooks[name] = commands;
        }
      }
      return this;
    },

    zsh(cb) {
      this.shellConfigs.zsh = this.shellConfigs.zsh || { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(this.shellConfigs.zsh, "zsh"));
      return this;
    },

    bash(cb) {
      this.shellConfigs.bash = this.shellConfigs.bash || { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(this.shellConfigs.bash, "bash"));
      return this;
    },

    powershell(cb) {
      this.shellConfigs.powershell = this.shellConfigs.powershell || { env: {}, aliases: {}, scripts: [], completions: null, functions: {} };
      cb(createShellBuilder(this.shellConfigs.powershell, "powershell"));
      return this;
    },

    platform(plat, cb) {
      const currentOS = getOS();
      let matches = false;
      if (plat === Platform.All) matches = true;
      else if (plat === Platform.MacOS && currentOS === "darwin") matches = true;
      else if (plat === Platform.Linux && currentOS === "linux") matches = true;

      if (matches) {
        cb(install);
      } else {
        this.disabled = true;
      }
      return this;
    },

    arch(arc, cb) {
      const currentArch = getArch();
      let matches = false;
      if (arc === Architecture.All) matches = true;
      else if (arc === Architecture.Arm64 && currentArch === "arm64") matches = true;
      else if (arc === Architecture.X86_64 && currentArch === "amd64") matches = true;

      if (matches) {
        cb(install);
      } else {
        this.disabled = true;
      }
      return this;
    }
  };

  function createShellBuilder(shConfig, shellType) {
    shConfig.functions = shConfig.functions || {};
    let sourceFileCounter = 0;
    let sourceCounter = 0;

    const resolvePath = (relativePath) => {
      if (path.isAbsolute(relativePath)) {
        return relativePath;
      }
      return path.join(globalThis.configFileDir || "", relativePath);
    };

    const generateSourceFileFunctionName = () => {
      const counter = sourceFileCounter++;
      const toolName = (globalThis.currentToolName || "").replace(/[^a-zA-Z0-9]/g, "_");
      return "__dotfiles_source_" + toolName + "_" + counter;
    };

    const generateSourceFunctionName = () => {
      const counter = sourceCounter++;
      const toolName = (globalThis.currentToolName || "").replace(/[^a-zA-Z0-9]/g, "_");
      return "__dotfiles_source_inline_" + toolName + "_" + counter;
    };

    return {
      env(map) {
        Object.assign(shConfig.env, map);
        return this;
      },
      alias(map) {
        Object.assign(shConfig.aliases, map);
        return this;
      },
      aliases(map) {
        return this.alias(map);
      },
      script(type, val) {
        if (arguments.length === 1) {
          shConfig.scripts.push({ kind: "always", value: arguments[0] });
        } else {
          shConfig.scripts.push({ kind: type, value: val });
        }
        return this;
      },
      once(val) {
        shConfig.scripts.push({ kind: "once", value: val });
        return this;
      },
      always(val) {
        shConfig.scripts.push({ kind: "always", value: val });
        return this;
      },
      completions(val) {
        shConfig.completions = val;
        return this;
      },
      functions(values) {
        Object.assign(shConfig.functions, values);
        return this;
      },
      path(val) {
        shConfig.paths = shConfig.paths || [];
        shConfig.paths.push(val);
        return this;
      },
      sourceFile(relativePath) {
        const resolvedPath = resolvePath(relativePath);
        const functionName = generateSourceFileFunctionName();

        let body = "";
        if (shellType === "powershell") {
          body = "if (Test-Path \"" + resolvedPath + "\") { Get-Content \"" + resolvedPath + "\" -Raw }";
        } else {
          body = "[[ -f \"" + resolvedPath + "\" ]] && cat \"" + resolvedPath + "\"";
        }
        shConfig.functions[functionName] = body;

        let sourceCmd = "";
        let unsetCmd = "";
        if (shellType === "powershell") {
          sourceCmd = ". (" + functionName + ")";
          unsetCmd = "Remove-Item Function:\\" + functionName + " -ErrorAction SilentlyContinue";
        } else {
          sourceCmd = "source <(" + functionName + ")";
          unsetCmd = "unset -f " + functionName;
        }

        shConfig.scripts.push({ kind: "raw", value: sourceCmd });
        shConfig.scripts.push({ kind: "raw", value: unsetCmd });
        return this;
      },
      sourceFunction(functionName) {
        let sourceCmd = "";
        if (shellType === "powershell") {
          sourceCmd = ". (" + functionName + ")";
        } else {
          sourceCmd = "source <(" + functionName + ")";
        }
        shConfig.scripts.push({ kind: "raw", value: sourceCmd });
        return this;
      },
      source(content) {
        const functionName = generateSourceFunctionName();
        shConfig.functions[functionName] = content;

        let sourceCmd = "";
        let unsetCmd = "";
        if (shellType === "powershell") {
          sourceCmd = ". (" + functionName + ")";
          unsetCmd = "Remove-Item Function:\\" + functionName + " -ErrorAction SilentlyContinue";
        } else {
          sourceCmd = "source <(" + functionName + ")";
          unsetCmd = "unset -f " + functionName;
        }

        shConfig.scripts.push({ kind: "raw", value: sourceCmd });
        shConfig.scripts.push({ kind: "raw", value: unsetCmd });
        return this;
      }
    };
  }

  function install(method, params) {
    if (method) {
      builder.installationMethod = method;
    }
    if (params) {
      builder.installParams = params;
    }
    return builder;
  }

  // Construct toolCtx parameter
  const toolName = globalThis.currentToolName || "";
  const toolPath = globalThis.currentToolPath || "";
  const bDir = globalThis.binariesDir || "";
  const currentDir = bDir ? (bDir + "/" + toolName + "/current") : path.dirname(toolPath);
  const toolCtx = {
    toolName: toolName,
    configFileDir: globalThis.configFileDir || "",
    currentDir: currentDir,
    systemInfo: {
      os: getOS(),
      arch: getArch(),
      libc: detectLibc()
    },
    log: {
      info(msg) { logInfo(toolName, msg); },
      warn(msg) { logWarn(toolName, msg); },
      error(msg) { logError(toolName, msg); },
      debug(msg) { logDebug(toolName, msg); }
    },
    fs: {
      exists(p) { return fsExists(p); },
      readDir(p) { return fsReadDir(p); },
      readFile(p) { return fsReadFile(p); }
    }
  };

  if (typeof callback === 'function') {
    const res = callback(install, toolCtx);
    if (res && res.installationMethod) {
      return res;
    }
  }
  return builder;
}
`

// LoaderPolyfills is a JavaScript polyfill suite that supplies standard node:fs and node:path
// functionalities needed for the config loader.
const LoaderPolyfills = `
const fs = {
  existsSync(p) {
    return fileExists(p);
  }
};
const path = {
  isAbsolute(p) {
    return p && (p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:/.test(p));
  },
  join() {
    const args = Array.prototype.slice.call(arguments);
    return args.join("/").replace(/\/+/g, "/");
  },
  dirname(p) {
    if (!p) return "";
    const parts = p.split("/");
    if (parts.length <= 1) return ".";
    parts.pop();
    return parts.join("/") || "/";
  },
  basename(p) {
    if (!p) return "";
    const parts = p.split("/");
    return parts[parts.length - 1];
  }
};

const modules = {
  "node:fs": fs,
  "fs": fs,
  "node:path": path,
  "path": path
};

function require(name) {
  if (modules[name]) {
    return modules[name];
  }
  throw new Error("Module not found: " + name);
}

globalThis.fs = fs;
globalThis.path = path;
globalThis.require = require;
`

// unifiedLoaderResult holds the returned project config and tool configs from evaluating
// the dynamically compiled TypeScript loader bundle.
type unifiedLoaderResult struct {
	ProjectConfig *config.ProjectConfig         `json:"projectConfig"`
	ToolConfigs   map[string]*config.ToolConfig `json:"toolConfigs"`
}

// LoadTypeScriptConfig loads and compiles a TypeScript config file and all tool configs
// dynamically, returning the unmarshaled ProjectConfig and map of ToolConfigs.
func LoadTypeScriptConfig(log *logger.Logger, fsys fs.FS, configPath string) (*config.ProjectConfig, map[string]*config.ToolConfig, error) {
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

	projCfg, err := evaluateProjectConfig(log, fsys, configJS, configFileDir)
	if err != nil {
		return nil, nil, fmt.Errorf("evaluating project config: %w", err)
	}

	// Step 2: Resolve the ToolConfigsDir and scan for *.tool.ts files
	toolConfigsDir := projCfg.Paths.ToolConfigsDir
	if toolConfigsDir == "" {
		toolConfigsDir = "{configFileDir}/tools"
	}
	resolvedToolConfigsDir := strings.ReplaceAll(toolConfigsDir, "{configFileDir}", configFileDir)
	if !filepath.IsAbs(resolvedToolConfigsDir) {
		resolvedToolConfigsDir = filepath.Join(configFileDir, resolvedToolConfigsDir)
	}

	var toolFiles []string
	if exists, _ := dirExists(resolvedToolConfigsDir); exists {
		toolFiles, err = findToolConfigFiles(resolvedToolConfigsDir)
		if err != nil {
			return nil, nil, fmt.Errorf("finding tool config files under %q: %w", resolvedToolConfigsDir, err)
		}
	}

	// Step 3: Write a temporary entry loader script next to the config file
	// and compile/bundle everything together with esbuild
	entryFileContent, err := generateEntryLoader(absConfigPath, toolFiles)
	if err != nil {
		return nil, nil, fmt.Errorf("generating entry loader content: %w", err)
	}

	tempEntryPath := filepath.Join(configFileDir, ".dotfiles-loader-entry.ts")
	if err := os.WriteFile(tempEntryPath, []byte(entryFileContent), 0644); err != nil {
		return nil, nil, fmt.Errorf("writing temporary loader entry: %w", err)
	}
	defer os.Remove(tempEntryPath)

	bundledJS, err := compileFile(tempEntryPath)
	if err != nil {
		return nil, nil, fmt.Errorf("bundling configuration: %w", err)
	}

	binariesDir := projCfg.Paths.BinariesDir
	if binariesDir == "" {
		binariesDir = filepath.Join(projCfg.Paths.GeneratedDir, "binaries")
	}
	if strings.Contains(binariesDir, "{paths.generatedDir}") {
		binariesDir = strings.ReplaceAll(binariesDir, "{paths.generatedDir}", projCfg.Paths.GeneratedDir)
	}

	// Step 4: Run the unified bundle in Sobek and marshal the result
	fullConfig, err := evaluateUnifiedBundle(log, fsys, bundledJS, configFileDir, projCfg.Paths.GeneratedDir, binariesDir)
	if err != nil {
		return nil, nil, fmt.Errorf("evaluating unified config bundle: %w", err)
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
					contents := loaderApiContents
					return api.OnLoadResult{
						Contents: &contents,
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
	// Replace references to import.meta.dirname, import_meta.dirname, and __dirname with global configFileDir variable
	code = strings.ReplaceAll(code, "import.meta.dirname", "configFileDir")
	code = strings.ReplaceAll(code, "import_meta.dirname", "configFileDir")
	code = strings.ReplaceAll(code, "__dirname", "configFileDir")

	return code, nil
}

func evaluateProjectConfig(log *logger.Logger, fsys fs.FS, jsContent string, configFileDir string) (*config.ProjectConfig, error) {
	vm := sobek.New()
	if err := RegisterBindings(vm); err != nil {
		return nil, fmt.Errorf("registering Go bindings: %w", err)
	}

	if err := RegisterContextBindings(vm, log, fsys); err != nil {
		return nil, fmt.Errorf("registering context bindings: %w", err)
	}

	// Register file system / path polyfills
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return nil, fmt.Errorf("initializing loader polyfills: %w", err)
	}

	// Set globals
	_ = vm.Set("configFileDir", configFileDir)
	_ = vm.Set("systemInfo", vm.NewObject())

	// Set process.env
	envObj := vm.NewObject()
	for _, kv := range os.Environ() {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			_ = envObj.Set(parts[0], parts[1])
		}
	}
	processObj := vm.NewObject()
	_ = processObj.Set("env", envObj)
	_ = vm.Set("process", processObj)

	// Set module and exports
	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	if _, err := vm.RunString(jsContent); err != nil {
		return nil, fmt.Errorf("executing script in Sobek VM: %w", err)
	}

	// Extract and stringify default export using JSON.stringify inside JS
	jsonVal, err := vm.RunString("JSON.stringify(module.exports.default || module.exports)")
	if err != nil {
		return nil, fmt.Errorf("stringifying project config inside JS VM: %w", err)
	}

	jsonBytes := []byte(jsonVal.String())

	var projCfg config.ProjectConfig
	if err := json.Unmarshal(jsonBytes, &projCfg); err != nil {
		return nil, fmt.Errorf("unmarshaling JSON to ProjectConfig struct: %w", err)
	}

	return &projCfg, nil
}

func evaluateUnifiedBundle(log *logger.Logger, fsys fs.FS, jsContent string, configFileDir string, generatedDir string, binariesDir string) (*unifiedLoaderResult, error) {
	vm := sobek.New()
	if err := RegisterBindings(vm); err != nil {
		return nil, fmt.Errorf("registering Go bindings: %w", err)
	}

	if err := RegisterContextBindings(vm, log, fsys); err != nil {
		return nil, fmt.Errorf("registering context bindings: %w", err)
	}

	// Register file system / path polyfills
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return nil, fmt.Errorf("initializing loader polyfills: %w", err)
	}

	// Set globals
	_ = vm.Set("configFileDir", configFileDir)
	_ = vm.Set("generatedDir", generatedDir)
	_ = vm.Set("binariesDir", binariesDir)
	_ = vm.Set("systemInfo", vm.NewObject())

	// Set process.env
	envObj := vm.NewObject()
	for _, kv := range os.Environ() {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			_ = envObj.Set(parts[0], parts[1])
		}
	}
	processObj := vm.NewObject()
	_ = processObj.Set("env", envObj)
	_ = vm.Set("process", processObj)

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	if _, err := vm.RunString(jsContent); err != nil {
		return nil, fmt.Errorf("executing script in Sobek VM: %w", err)
	}

	// Retrieve dynamic loader results
	loaderResultVal := vm.Get("__loaderResult")
	if loaderResultVal == nil || sobek.IsUndefined(loaderResultVal) || sobek.IsNull(loaderResultVal) {
		return nil, fmt.Errorf("loader result __loaderResult is missing or undefined")
	}

	jsonVal, err := vm.RunString("JSON.stringify(__loaderResult)")
	if err != nil {
		return nil, fmt.Errorf("stringifying loader result inside JS VM: %w", err)
	}

	jsonBytes := []byte(jsonVal.String())

	var res unifiedLoaderResult
	if err := json.Unmarshal(jsonBytes, &res); err != nil {
		return nil, fmt.Errorf("unmarshaling loader result: %w", err)
	}

	return &res, nil
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
		if !strings.HasPrefix(relPath, ".") && !strings.HasPrefix(relPath, "/") {
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

  globalThis.currentToolName = fallbackName;
  globalThis.currentToolPath = entry.absPath;
  
  try {
    const mod = entry.load();
    const t = mod.default || mod;
    if (t) {
      if (!t.name) {
        t.name = fallbackName;
      }
      t.configFilePath = entry.absPath;
      toolConfigs[t.name] = t;
    }
  } catch (err) {
    throw err;
  }
}
`)

	configBase := filepath.Base(configPath)
	sb.WriteString(fmt.Sprintf("import projConfig from \"./%s\";\n", configBase))
	sb.WriteString(`
globalThis.__loaderResult = {
  projectConfig: projConfig,
  toolConfigs: toolConfigs
};
`)

	return sb.String(), nil
}

func dirExists(path string) (bool, error) {
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
