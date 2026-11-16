package orchestrator

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

func (o *Orchestrator) developmentStore(project *config.ProjectConfig) *devtools.Store {
	dir := project.Paths.DevToolsDir
	if dir == "" {
		dir = filepath.Join(project.Paths.GeneratedDir, "dev-tools")
	}
	return devtools.New(o.fs, dir)
}

// DevelopmentOverride reads the explicit local selection independently of release
// receipts. Missing payloads remain protected until the user disables the override.
func (o *Orchestrator) DevelopmentOverride(tool string, project *config.ProjectConfig) (*devtools.Record, error) {
	if project == nil {
		return nil, fmt.Errorf("project configuration is nil")
	}
	return o.developmentStore(project).Lookup(tool)
}

// withToolLock serializes release mutations, generation and development selection
// for this tool. The store propagates ownership through ctx for nested pipelines.
func (o *Orchestrator) withToolLock(ctx context.Context, name string, project *config.ProjectConfig, action func(context.Context) error) error {
	if project == nil {
		return fmt.Errorf("project configuration is nil")
	}
	return o.developmentStore(project).WithLock(ctx, name, action)
}

func (o *Orchestrator) preserveDevelopment(name string, project *config.ProjectConfig) (bool, error) {
	record, err := o.DevelopmentOverride(name, project)
	if err != nil {
		return false, err
	}
	if record == nil {
		return false, nil
	}
	o.logger.WithTag(name).Info(logger.Message(fmt.Sprintf("Development override preserved; use dotfiles tool dev off %s to resume release management", name)))
	return true, nil
}

func (o *Orchestrator) developmentBinaries(tool *config.ToolConfig, project *config.ProjectConfig) (*devtools.Record, error) {
	store := o.developmentStore(project)
	record, err := store.Lookup(tool.Name)
	if err != nil || record == nil {
		return record, err
	}
	if err := store.Validate(record); err != nil {
		return nil, fmt.Errorf("%w; rebuild the development tool or run dotfiles tool dev off %s", err, tool.Name)
	}
	for _, binary := range tool.BinaryConfigs() {
		if record.Binaries[binary.Name] == "" {
			return nil, fmt.Errorf("development override for %s has no executable %s; register the complete build again or run dotfiles tool dev off %s", tool.Name, binary.Name, tool.Name)
		}
	}
	return record, nil
}

// includeDevelopmentCLI maintains the bootstrap CLI even in projects which have
// not declared a dotfiles tool. Other removed tools retain their existing shims.
func (o *Orchestrator) includeDevelopmentCLI(tools []*config.ToolConfig, project *config.ProjectConfig) ([]*config.ToolConfig, error) {
	if project == nil {
		return nil, fmt.Errorf("project configuration is nil")
	}
	for _, tool := range tools {
		if tool.Name == "dotfiles" {
			return tools, nil
		}
	}
	record, err := o.DevelopmentOverride("dotfiles", project)
	if err == nil && record == nil {
		return tools, nil
	}
	// Include an unreadable selection too: GenerateTool reports its failure while
	// the batch continues generating the other tools.
	result := append([]*config.ToolConfig(nil), tools...)
	return append(result, &config.ToolConfig{Name: "dotfiles", Binaries: []interface{}{map[string]interface{}{"name": "dotfiles", "pattern": "dotfiles"}}}), nil
}

// cliArgsForProject keeps generated invocations independent of the temporary
// compiler output used to bootstrap the CLI. Explicit source/command overrides
// retain their existing precedence. Old immutable payloads are intentionally kept.
func (o *Orchestrator) cliArgsForProject(project *config.ProjectConfig) []string {
	if project != nil && os.Getenv("DOTFILES_CLI_COMMAND") == "" && (os.Getenv("DOTFILES_REPO_ROOT") == "" || os.Getenv("DOTFILES_E2E_TEST") == "true") {
		names := []string{"dotfiles"}
		for _, tool := range o.cacheTools {
			for _, binary := range tool.BinaryNames() {
				if binary == "dotfiles" && tool.Name != "dotfiles" {
					names = append(names, tool.Name)
				}
			}
		}
		for _, name := range names {
			if record, err := o.DevelopmentOverride(name, project); err == nil && record != nil && record.Binaries["dotfiles"] != "" {
				return []string{record.Binaries["dotfiles"]}
			}
		}
	}
	return o.getCliArgs()
}

// Shell wrappers follow the selected CLI shim instead of pinning a retained dev
// executable. Shims themselves keep cliArgsForProject as their bootstrap helper,
// so a missing release can still be installed without recursively calling itself.
func (o *Orchestrator) shellCLIArgsForProject(project *config.ProjectConfig) (args []string, searchPath bool) {
	args = o.cliArgsForProject(project)
	if project == nil || len(args) != 1 || os.Getenv("DOTFILES_CLI_COMMAND") != "" || (os.Getenv("DOTFILES_REPO_ROOT") != "" && os.Getenv("DOTFILES_E2E_TEST") != "true") {
		return args, false
	}
	owned, err := o.developmentStore(project).ContainsPayload(args[0])
	if err != nil || !owned {
		return args, false
	}
	if project.Paths.TargetDir != "" {
		shim := filepath.Join(project.Paths.TargetDir, "dotfiles")
		if info, err := o.fs.Stat(shim); err == nil && info.Mode().IsRegular() {
			return []string{shim}, false
		}
	}
	// An internal-only or removed CLI declaration has no managed shim after off.
	return []string{"dotfiles"}, true
}

func (o *Orchestrator) cleanupReleaseArtifacts(ctx context.Context, tools []*config.ToolConfig, project *config.ProjectConfig, cleanup func(context.Context, []*config.ToolConfig, *config.ProjectConfig) error) error {
	if project == nil || o.reg == nil {
		return nil
	}
	var failures toolbatch.Failures
	for _, tool := range tools {
		err := o.withToolLock(ctx, tool.Name, project, func(ctx context.Context) error {
			record, err := o.DevelopmentOverride(tool.Name, project)
			if err != nil || record != nil {
				return err
			}
			return cleanup(ctx, []*config.ToolConfig{tool}, project)
		})
		failures.Record(o.logger, tool.Name, err)
	}
	return failures.Err()
}
