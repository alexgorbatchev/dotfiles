package vm

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// ResolveRequest describes one install parameter to compute.
//
// Context carries the values that only exist once the installation is under way and
// that the parameter's own installer knows about -- the downloaded script's path, the
// release it is choosing an asset from. They are merged into the tool context the
// resolver receives, so a resolver reads the real path where the configuration, read
// long before, could only carry a placeholder.
type ResolveRequest struct {
	Log       *logger.Logger
	FS        fs.FS
	Runner    exec.CommandRunner
	Tool      *config.ToolConfig
	ProjCfg   *config.ProjectConfig
	Param     string
	Context   map[string]any
	Target    Target
	Evaluator *Evaluator
}

// HasResolver reports whether the author gave a function for an install parameter.
//
// A function cannot cross the JSON boundary the configuration takes to reach Go, so the
// loader records the parameter's name alongside the tool's install parameters and keeps
// the function itself in the VM. This answers from that record, without re-reading the
// tool file.
func HasResolver(tool *config.ToolConfig, param string) bool {
	if tool == nil || tool.InstallParams == nil {
		return false
	}
	params, ok := tool.InstallParams["resolvers"].([]any)
	if !ok {
		return false
	}
	for _, p := range params {
		if name, ok := p.(string); ok && name == param {
			return true
		}
	}
	return false
}

// ResolveInstallParam calls the function the author gave for an install parameter and
// returns what it produced, encoded as JSON for the installer to decode into the shape
// that parameter takes.
//
// When an Evaluator is provided (via req or ctx), the function is called in that
// retained VM without re-evaluating the tool file. If no Evaluator is provided, the tool's
// configuration file is evaluated in a fresh VM as a fallback.
func ResolveInstallParam(ctx context.Context, req ResolveRequest) (json.RawMessage, error) {
	if !HasResolver(req.Tool, req.Param) {
		return nil, fmt.Errorf("tool %q recorded no resolver for install parameter %q", req.Tool.Name, req.Param)
	}

	purpose := fmt.Sprintf("%s install parameter", req.Param)

	evaluator := req.Evaluator
	if evaluator == nil {
		evaluator = GetEvaluator(ctx)
	}

	if evaluator != nil {
		evaluator.mu.Lock()
		defer evaluator.mu.Unlock()
		vm := evaluator.vm

		homeDir := ""
		if req.ProjCfg != nil {
			homeDir = req.ProjCfg.Paths.HomeDir
		}
		if err := RegisterContextBindings(vm, req.Log, req.FS, homeDir); err != nil {
			return nil, fmt.Errorf("registering context bindings: %w", err)
		}
		if err := registerHookShell(ctx, vm, req.Log, req.Runner, nil); err != nil {
			return nil, fmt.Errorf("registering hook shell: %w", err)
		}

		configFileDir := ""
		binariesDir := ""
		generatedDir := ""
		if req.ProjCfg != nil {
			configFileDir = req.ProjCfg.ConfigFileDir
			binariesDir = req.ProjCfg.Paths.BinariesDir
			generatedDir = req.ProjCfg.Paths.GeneratedDir
		}
		var err error
		for _, dir := range []*string{&configFileDir, &binariesDir, &generatedDir} {
			if *dir, err = absolutePath(req.FS, *dir); err != nil {
				return nil, err
			}
		}
		_ = vm.Set("configFileDir", configFileDir)
		_ = vm.Set("binariesDir", binariesDir)
		_ = vm.Set("generatedDir", generatedDir)
		_ = vm.Set("currentToolName", req.Tool.Name)
		_ = vm.Set("currentToolPath", req.Tool.ConfigFilePath)

		if req.ProjCfg != nil {
			if err := setJSONGlobal(vm, "projectConfig", req.ProjCfg); err != nil {
				return nil, fmt.Errorf("providing project configuration to the %s: %w", purpose, err)
			}
		}
		if err := setJSONGlobal(vm, "currentToolConfig", req.Tool); err != nil {
			return nil, fmt.Errorf("providing the tool configuration to the %s of %q: %w", purpose, req.Tool.Name, err)
		}

		resolverContext := req.Context
		if resolverContext == nil {
			resolverContext = map[string]any{}
		}
		if err := setJSONGlobal(vm, "__resolverContext", resolverContext); err != nil {
			return nil, fmt.Errorf("providing the context for the %s of %q: %w", purpose, req.Tool.Name, err)
		}
		_ = vm.Set("__resolverToolName", req.Tool.Name)
		_ = vm.Set("__resolverParam", req.Param)

		what := fmt.Sprintf("the %s of %q", purpose, req.Tool.Name)
		value, err := settleInVM(vm, "__invokeParamResolver(__resolverToolName, __resolverParam, __resolverContext)", what)
		if err != nil {
			return nil, err
		}
		return json.RawMessage(value), nil
	}

	eval, err := evaluateToolFile(ctx, toolFileVM{
		log:     req.Log,
		fsys:    req.FS,
		runner:  req.Runner,
		tool:    req.Tool,
		projCfg: req.ProjCfg,
		target:  req.Target,
		purpose: purpose,
	})
	if err != nil {
		return nil, err
	}
	vm := eval.vm

	resolverContext := req.Context
	if resolverContext == nil {
		resolverContext = map[string]any{}
	}
	if err := setJSONGlobal(vm, "__resolverContext", resolverContext); err != nil {
		return nil, fmt.Errorf("providing the context for the %s of %q: %w", purpose, req.Tool.Name, err)
	}
	_ = vm.Set("__resolverToolName", req.Tool.Name)
	_ = vm.Set("__resolverParam", req.Param)

	what := fmt.Sprintf("the %s of %q", purpose, req.Tool.Name)
	value, err := settleInVM(vm, "__invokeParamResolver(__resolverToolName, __resolverParam, __resolverContext)", what)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(value), nil
}
