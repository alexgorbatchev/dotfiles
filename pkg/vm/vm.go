package vm

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/sobek"
)

// EvaluateToolDefinition runs the provided JavaScript script content inside a new sandboxed Sobek VM
// and marshals the resulting tool configuration directly into the provided Go out structure.
func EvaluateToolDefinition(scriptContent string, out any) error {
	vm := sobek.New()

	// Register native Go bindings/utilities
	if err := RegisterBindings(vm); err != nil {
		return fmt.Errorf("registering Go bindings: %w", err)
	}

	var capturedVal any

	// Register global config/tool capture helper functions
	captureFn := func(call sobek.FunctionCall) sobek.Value {
		if len(call.Arguments) > 0 {
			capturedVal = call.Arguments[0].Export()
			return call.Arguments[0]
		}
		return sobek.Undefined()
	}

	_ = vm.Set("defineConfig", captureFn)
	_ = vm.Set("defineTool", captureFn)

	// Set up module and exports objects for CommonJS compatibility
	moduleObj := vm.NewObject()
	exportsObj := vm.NewObject()
	_ = moduleObj.Set("exports", exportsObj)
	_ = vm.Set("module", moduleObj)
	_ = vm.Set("exports", exportsObj)

	// Execute the JavaScript script
	val, err := vm.RunString(scriptContent)
	if err != nil {
		return fmt.Errorf("executing script in Sobek VM: %w", err)
	}

	// Resolve the final configuration value
	var targetVal any
	if capturedVal != nil {
		targetVal = capturedVal
	} else {
		// Check CJS module.exports
		if exp := moduleObj.Get("exports"); exp != nil {
			expExported := exp.Export()
			// If exports was not modified, expExported might be empty map
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

	// Fallback to script evaluation return value if still empty
	if targetVal == nil && val != nil {
		targetVal = val.Export()
	}

	if targetVal == nil {
		return fmt.Errorf("failed to extract configuration: no value was returned, exported, or captured via defineConfig/defineTool")
	}

	// Marshal JavaScript value representation to JSON bytes
	jsonBytes, err := json.Marshal(targetVal)
	if err != nil {
		return fmt.Errorf("marshaling VM output value to JSON: %w", err)
	}

	// Unmarshal JSON into the target Go configuration structure
	if err := json.Unmarshal(jsonBytes, out); err != nil {
		return fmt.Errorf("unmarshaling JSON into Go structure: %w", err)
	}

	return nil
}
