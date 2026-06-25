package vm

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/grafana/sobek"
)

const bootstrapJS = `
// Mock definitions of Platform and Architecture constants
const Platform = Object.freeze({ None: 0, Linux: 1, MacOS: 2, Windows: 4, Unix: 3, All: 7 });
const Architecture = Object.freeze({ None: 0, X86_64: 1, Arm64: 2, All: 3 });

function defineConfig(callback) {
  if (typeof callback === 'function') {
    return callback({
      configFileDir: configFileDir,
      systemInfo: systemInfo
    });
  }
  return callback;
}

function defineTool(callback) {
  const builder = {
    name: "",
    installationMethod: "",
    installParams: {},
    binaries: [],
    version: "latest",
    dependencies: [],
    symlinks: [],
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
      this.symlinks.push({ source: src, target: dst });
      return this;
    },

    hook(name, cb) {
      return this;
    },

    zsh(cb) {
      this.shellConfigs.zsh = this.shellConfigs.zsh || { env: {}, aliases: {}, scripts: [], completions: null };
      cb(createShellBuilder(this.shellConfigs.zsh));
      return this;
    },

    bash(cb) {
      this.shellConfigs.bash = this.shellConfigs.bash || { env: {}, aliases: {}, scripts: [], completions: null };
      cb(createShellBuilder(this.shellConfigs.bash));
      return this;
    },

    powershell(cb) {
      this.shellConfigs.powershell = this.shellConfigs.powershell || { env: {}, aliases: {}, scripts: [], completions: null };
      cb(createShellBuilder(this.shellConfigs.powershell));
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
      }
      return this;
    }
  };

  function createShellBuilder(shConfig) {
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
      completions(val) {
        shConfig.completions = val;
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

  if (typeof callback === 'function') {
    const res = callback(install);
    if (res && res.installationMethod) {
      return res;
    }
  }
  return builder;
}
`

// EvaluateToolDefinition runs the provided JavaScript/TypeScript script content inside a new sandboxed Sobek VM
// and marshals the resulting configuration directly into the provided Go out structure.
func EvaluateToolDefinition(scriptContent string, out any) error {
	vm := sobek.New()

	if err := RegisterBindings(vm); err != nil {
		return fmt.Errorf("registering Go bindings: %w", err)
	}

	// Clean up imports and export defaults in scriptContent
	var cleanLines []string
	for _, line := range strings.Split(scriptContent, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "import ") {
			continue
		}
		cleanLines = append(cleanLines, line)
	}
	cleanedScript := strings.Join(cleanLines, "\n")
	cleanedScript = strings.ReplaceAll(cleanedScript, "export default", "module.exports =")
	cleanedScript = strings.ReplaceAll(cleanedScript, "import.meta.dirname", "configFileDir")

	// Set process.env
	envObj := vm.NewObject()
	_ = envObj.Set("MOCK_SERVER_PORT", os.Getenv("MOCK_SERVER_PORT"))
	processObj := vm.NewObject()
	_ = processObj.Set("env", envObj)
	_ = vm.Set("process", processObj)

	// Set default configFileDir global to avoid reference error
	_ = vm.Set("configFileDir", "")
	_ = vm.Set("systemInfo", vm.NewObject())

	// Run bootstrap JS first
	if _, err := vm.RunString(bootstrapJS); err != nil {
		return fmt.Errorf("initializing Sobek bootstrap context: %w", err)
	}

	var capturedVal any
	captureFn := func(call sobek.FunctionCall) sobek.Value {
		if len(call.Arguments) > 0 {
			capturedVal = call.Arguments[0].Export()
			return call.Arguments[0]
		}
		return sobek.Undefined()
	}

	_ = vm.Set("defineConfig", captureFn)
	_ = vm.Set("defineTool", captureFn)

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	val, err := vm.RunString(cleanedScript)
	if err != nil {
		return fmt.Errorf("executing script in Sobek VM: %w", err)
	}

	var targetVal any
	if capturedVal != nil {
		targetVal = capturedVal
	} else {
		if exp := moduleObj.Get("exports"); exp != nil {
			expExported := exp.Export()
			if m, ok := expExported.(map[string]any); ok && len(m) > 0 {
				if def, exists := m["default"]; exists {
					targetVal = def
				} else {
					targetVal = expExported
				}
			} else if expExported != nil && fmt.Sprintf("%T", expExported) != "map[string]interface {}" {
				targetVal = expExported
			}
		}
	}

	if targetVal == nil && val != nil {
		targetVal = val.Export()
	}

	if targetVal == nil {
		return fmt.Errorf("failed to extract configuration: no value returned or exported")
	}

	jsonBytes, err := json.Marshal(targetVal)
	if err != nil {
		return fmt.Errorf("marshaling VM output to JSON: %w", err)
	}

	if err := json.Unmarshal(jsonBytes, out); err != nil {
		return fmt.Errorf("unmarshaling JSON to Go structure: %w", err)
	}

	return nil
}

type SystemContext struct {
	OS   string
	Arch string
}

// EvaluateToolDefinitionWithContext evaluates a script with defined globals for configDir and system context.
func EvaluateToolDefinitionWithContext(scriptContent string, configDir string, sysCtx *SystemContext, out any) error {
	vm := sobek.New()

	if err := RegisterBindings(vm); err != nil {
		return fmt.Errorf("registering Go bindings: %w", err)
	}

	// Clean up imports and export defaults in scriptContent
	var cleanLines []string
	for _, line := range strings.Split(scriptContent, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "import ") {
			continue
		}
		cleanLines = append(cleanLines, line)
	}
	cleanedScript := strings.Join(cleanLines, "\n")
	cleanedScript = strings.ReplaceAll(cleanedScript, "export default", "module.exports =")
	cleanedScript = strings.ReplaceAll(cleanedScript, "import.meta.dirname", "configFileDir")

	// Set process.env
	envObj := vm.NewObject()
	_ = envObj.Set("MOCK_SERVER_PORT", os.Getenv("MOCK_SERVER_PORT"))
	processObj := vm.NewObject()
	_ = processObj.Set("env", envObj)
	_ = vm.Set("process", processObj)

	// Set globals
	_ = vm.Set("configFileDir", configDir)
	_ = vm.Set("systemInfo", sysCtx)

	// Run bootstrap JS
	if _, err := vm.RunString(bootstrapJS); err != nil {
		return fmt.Errorf("initializing Sobek bootstrap context: %w", err)
	}

	var capturedVal any
	captureFn := func(call sobek.FunctionCall) sobek.Value {
		if len(call.Arguments) > 0 {
			capturedVal = call.Arguments[0].Export()
			return call.Arguments[0]
		}
		return sobek.Undefined()
	}

	_ = vm.Set("defineConfig", captureFn)
	_ = vm.Set("defineTool", captureFn)

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	val, err := vm.RunString(cleanedScript)
	if err != nil {
		return fmt.Errorf("executing script in Sobek VM: %w", err)
	}

	var targetVal any
	if capturedVal != nil {
		targetVal = capturedVal
	} else {
		if exp := moduleObj.Get("exports"); exp != nil {
			expExported := exp.Export()
			if m, ok := expExported.(map[string]any); ok && len(m) > 0 {
				if def, exists := m["default"]; exists {
					targetVal = def
				} else {
					targetVal = expExported
				}
			} else if expExported != nil && fmt.Sprintf("%T", expExported) != "map[string]interface {}" {
				targetVal = expExported
			}
		}
	}

	if targetVal == nil && val != nil {
		targetVal = val.Export()
	}

	if targetVal == nil {
		return fmt.Errorf("failed to extract configuration: no value returned or exported")
	}

	jsonBytes, err := json.Marshal(targetVal)
	if err != nil {
		return fmt.Errorf("marshaling VM output to JSON: %w", err)
	}

	if err := json.Unmarshal(jsonBytes, out); err != nil {
		return fmt.Errorf("unmarshaling JSON to Go structure: %w", err)
	}

	return nil
}
