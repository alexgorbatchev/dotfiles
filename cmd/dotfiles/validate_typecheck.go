package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	execRunner "github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/typecheck"
)

// compilerBinary is the binary name a configured tool must declare to provide the
// TypeScript compiler. The tool is found by this name, never by its own.
const compilerBinary = "tsc"

// typeCheckTimeout bounds the compiler run; a whole project type-checks in seconds.
const typeCheckTimeout = time.Minute

// typeCheckToolName is the pseudo tool name diagnostics about the type-check itself,
// rather than about a tool configuration, are reported under.
const typeCheckToolName = "<typecheck>"

// compilerTool returns the configured tool that declares the TypeScript compiler
// binary, or nil.
func compilerTool(tools []*config.ToolConfig) *config.ToolConfig {
	for _, tc := range tools {
		if slices.Contains(installer.GetBinaryNames(tc.Name, tc.Binaries), compilerBinary) {
			return tc
		}
	}
	return nil
}

// typeCheckToolConfigs type-checks the project's TypeScript configuration with the
// compiler a configured tool provides, and returns each diagnostic as a validation
// error attributed to the tool whose file it is in. When only is set, diagnostics in
// other files are dropped.
//
// A compiler that is not configured or not installed is itself reported as an error:
// on a fresh machine validate runs before anything is installed, and a silent skip
// would turn that into a false "all valid".
func typeCheckToolConfigs(ctx context.Context, services *Services, log *logger.Logger, only *config.ToolConfig) ([]ValidationError, error) {
	if !strings.HasSuffix(services.ConfigPath, ".ts") {
		log.Info(logger.Message("Configuration is not TypeScript; nothing to type-check"))
		return nil, nil
	}
	if services.InMemory {
		log.Info(logger.Message("Skipping type-check: the generated program is not written to disk in this mode, so the compiler has nothing to read"))
		return nil, nil
	}

	generatedDir := services.ProjectConfig.Paths.GeneratedDir
	tsconfigPath := typecheck.TSConfigPath(generatedDir)

	tool := compilerTool(services.ToolConfigs)
	if tool == nil {
		return []ValidationError{{
			ToolName: typeCheckToolName,
			Config:   services.ConfigPath,
			Message: fmt.Sprintf("No configured tool provides the TypeScript compiler %q, so the tool configurations were not type-checked. "+
				"Run `dotfiles scaffold` to add typescript.tool.ts, then `dotfiles install typescript`.", compilerBinary),
		}}, nil
	}

	compilerPath := filepath.Join(services.ProjectConfig.Paths.BinariesDir, tool.Name, "current", compilerBinary)
	resolvedCompiler, err := filepath.EvalSymlinks(compilerPath)
	if err != nil {
		return []ValidationError{{
			ToolName: tool.Name,
			Config:   tool.ConfigFilePath,
			Message: fmt.Sprintf("The TypeScript compiler %q declared by tool %q is not installed (expected at %s), so the tool configurations were not type-checked. "+
				"Run `dotfiles install %s`.", compilerBinary, tool.Name, compilerPath, tool.Name),
		}}, nil
	}

	// The program must describe the configuration as it is now: a stale registry or
	// tsconfig would report errors that are not in the tool files.
	if err := services.Orchestrator.SyncTypeScriptTypes(ctx, services.ToolConfigs, services.ProjectConfig); err != nil {
		return nil, fmt.Errorf("preparing the type-check program: %w", err)
	}
	if _, err := os.Stat(tsconfigPath); err != nil {
		return nil, fmt.Errorf("type-check program %s was not written: %w", tsconfigPath, err)
	}

	log.Info(logger.Message(fmt.Sprintf("Type-checking tool configurations with %s", resolvedCompiler)))
	runCtx, cancel := context.WithTimeout(ctx, typeCheckTimeout)
	defer cancel()
	diagnostics, err := typecheck.Run(runCtx, execRunner.NewOSRunner(), resolvedCompiler, tsconfigPath, generatedDir)
	if err != nil {
		return nil, fmt.Errorf("type-checking tool configurations: %w", err)
	}

	var errors []ValidationError
	for _, d := range diagnostics {
		file := d.File
		if !filepath.IsAbs(file) {
			file = filepath.Join(generatedDir, file)
		}
		file = filepath.Clean(file)
		toolName := toolNameForFile(services, file)
		if only != nil && file != filepath.Clean(only.ConfigFilePath) {
			continue
		}
		errors = append(errors, ValidationError{
			ToolName: toolName,
			Config:   file,
			Message:  fmt.Sprintf("%s at line %d, column %d: %s", d.Code, d.Line, d.Column, d.Message),
		})
	}
	return errors, nil
}

// toolNameForFile attributes a type-checked file to a tool: the tool whose
// configuration file it is, "<project>" for dotfiles.config.ts, and otherwise the
// file's own name the way the loader would name a tool from it.
func toolNameForFile(services *Services, file string) string {
	for _, tc := range services.ToolConfigs {
		if tc.ConfigFilePath != "" && filepath.Clean(tc.ConfigFilePath) == file {
			return tc.Name
		}
	}
	if file == filepath.Clean(services.ConfigPath) {
		return "<project>"
	}
	return strings.TrimSuffix(strings.TrimSuffix(filepath.Base(file), ".ts"), ".tool")
}
