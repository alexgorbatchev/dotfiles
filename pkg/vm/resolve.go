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
	Log     *logger.Logger
	FS      fs.FS
	Runner  exec.CommandRunner
	Tool    *config.ToolConfig
	ProjCfg *config.ProjectConfig
	Param   string
	Context map[string]any
	Target  Target
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
// The tool's configuration file is evaluated again in a fresh VM, the same way a
// lifecycle hook is, because that is the only place the function still exists.
func ResolveInstallParam(ctx context.Context, req ResolveRequest) (json.RawMessage, error) {
	if !HasResolver(req.Tool, req.Param) {
		return nil, fmt.Errorf("tool %q recorded no resolver for install parameter %q", req.Tool.Name, req.Param)
	}

	purpose := fmt.Sprintf("%s install parameter", req.Param)
	vm, err := evaluateToolFile(ctx, toolFileVM{
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
