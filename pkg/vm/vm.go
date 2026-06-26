package vm

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/dop251/goja"
)

// getBootstrapJS returns the transpiled loader API JavaScript code.
func getBootstrapJS() string {
	return loaderApiContents
}

// EvaluateToolDefinition runs the provided JavaScript/TypeScript script content inside a new sandboxed Sobek VM
// and marshals the resulting configuration directly into the provided Go out structure.
func EvaluateToolDefinition(scriptContent string, out any) error {
	vm := goja.New()

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

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	// Run polyfills first
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return fmt.Errorf("initializing polyfills: %w", err)
	}

	// Run bootstrap JS first
	if _, err := vm.RunString(getBootstrapJS()); err != nil {
		return fmt.Errorf("initializing Goja bootstrap context: %w", err)
	}

	var capturedVal goja.Value
	captureFn := func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) > 0 {
			capturedVal = call.Arguments[0]
			return call.Arguments[0]
		}
		return goja.Undefined()
	}

	_ = vm.Set("defineConfig", captureFn)
	_ = vm.Set("defineTool", captureFn)

	val, err := vm.RunString(cleanedScript)
	if err != nil {
		return fmt.Errorf("executing script in Goja VM: %w", err)
	}

	var targetVal goja.Value
	if capturedVal != nil {
		targetVal = capturedVal
	} else {
		if exp := moduleObj.Get("exports"); exp != nil {
			if obj := exp.ToObject(vm); obj != nil && len(obj.Keys()) > 0 {
				targetVal = exp
				if def := obj.Get("default"); def != nil && !goja.IsUndefined(def) && !goja.IsNull(def) {
					targetVal = def
				}
			}
		}
	}

	if targetVal == nil && val != nil {
		targetVal = val
	}

	if targetVal == nil || goja.IsUndefined(targetVal) || goja.IsNull(targetVal) {
		return fmt.Errorf("failed to extract configuration: no value returned or exported")
	}

	_ = vm.GlobalObject().Set("__targetVal", targetVal)
	jsonVal, err := vm.RunString("JSON.stringify(__targetVal)")
	if err != nil {
		return fmt.Errorf("stringifying VM output inside JS VM: %w", err)
	}

	jsonStr := jsonVal.String()
	if jsonStr == "undefined" || jsonStr == "" {
		exported := targetVal.Export()
		jsonBytes, err := json.Marshal(exported)
		if err != nil {
			return fmt.Errorf("marshaling fallback VM output to JSON: %w", err)
		}
		if err := json.Unmarshal(jsonBytes, out); err != nil {
			return fmt.Errorf("unmarshaling JSON to Go structure: %w", err)
		}
		return nil
	}

	jsonBytes := []byte(jsonStr)

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
	vm := goja.New()

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

	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	// Run polyfills first
	if _, err := vm.RunString(LoaderPolyfills); err != nil {
		return fmt.Errorf("initializing polyfills: %w", err)
	}

	// Run bootstrap JS
	if _, err := vm.RunString(getBootstrapJS()); err != nil {
		return fmt.Errorf("initializing Goja bootstrap context: %w", err)
	}

	var capturedVal goja.Value
	captureFn := func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) > 0 {
			capturedVal = call.Arguments[0]
			return call.Arguments[0]
		}
		return goja.Undefined()
	}

	_ = vm.Set("defineConfig", captureFn)
	_ = vm.Set("defineTool", captureFn)

	val, err := vm.RunString(cleanedScript)
	if err != nil {
		return fmt.Errorf("executing script in Goja VM: %w", err)
	}

	var targetVal goja.Value
	if capturedVal != nil {
		targetVal = capturedVal
	} else {
		if exp := moduleObj.Get("exports"); exp != nil {
			if obj := exp.ToObject(vm); obj != nil && len(obj.Keys()) > 0 {
				targetVal = exp
				if def := obj.Get("default"); def != nil && !goja.IsUndefined(def) && !goja.IsNull(def) {
					targetVal = def
				}
			}
		}
	}

	if targetVal == nil && val != nil {
		targetVal = val
	}

	if targetVal == nil || goja.IsUndefined(targetVal) || goja.IsNull(targetVal) {
		return fmt.Errorf("failed to extract configuration: no value returned or exported")
	}

	_ = vm.GlobalObject().Set("__targetVal", targetVal)
	jsonVal, err := vm.RunString("JSON.stringify(__targetVal)")
	if err != nil {
		return fmt.Errorf("stringifying VM output inside JS VM: %w", err)
	}

	jsonStr := jsonVal.String()
	if jsonStr == "undefined" || jsonStr == "" {
		exported := targetVal.Export()
		jsonBytes, err := json.Marshal(exported)
		if err != nil {
			return fmt.Errorf("marshaling fallback VM output to JSON: %w", err)
		}
		if err := json.Unmarshal(jsonBytes, out); err != nil {
			return fmt.Errorf("unmarshaling JSON to Go structure: %w", err)
		}
		return nil
	}

	jsonBytes := []byte(jsonStr)

	if err := json.Unmarshal(jsonBytes, out); err != nil {
		return fmt.Errorf("unmarshaling JSON to Go structure: %w", err)
	}

	return nil
}
