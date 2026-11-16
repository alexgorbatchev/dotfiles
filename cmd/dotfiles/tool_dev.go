package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/spf13/cobra"
)

var toolDevCmd = &cobra.Command{
	Use:   "dev",
	Short: "Manage persistent local development builds",
	Long:  "Activate local builds that ordinary installation, updates, and cleanup preserve. Use off to return to release management.",
}

func findDevTool(services *Services, name string) (*config.ToolConfig, error) {
	tool := config.FindTargetTool(services.ToolConfigs, name)
	if tool == nil && name == "dotfiles" {
		tool = &config.ToolConfig{Name: "dotfiles", Binaries: []interface{}{config.BinaryConfig{Name: "dotfiles"}}}
	}
	if tool == nil {
		return nil, fmt.Errorf("tool %q not found in configuration", name)
	}
	if tool.Disabled {
		return nil, fmt.Errorf("tool %q is disabled in configuration", tool.Name)
	}
	return tool, nil
}

// changeDevTool keeps selection and generated routing under the same tool lock.
// Retain immutable payloads: other existing shims may still use an older CLI build.
func changeDevTool(ctx context.Context, services *Services, tool *config.ToolConfig, change func(context.Context, *devtools.Store) error) error {
	store := devtools.New(services.FS, services.ProjectConfig.Paths.DevToolsDir)
	return store.WithLock(ctx, tool.Name, func(ctx context.Context) error {
		return services.Orchestrator.WithShellGenerationLock(ctx, services.ProjectConfig, func(ctx context.Context) error {
			return changeDevToolLocked(ctx, services, tool, store, change)
		})
	})
}

func changeDevToolLocked(ctx context.Context, services *Services, tool *config.ToolConfig, store *devtools.Store, change func(context.Context, *devtools.Store) error) error {
	previous, err := store.Lookup(tool.Name)
	if err != nil {
		return err
	}
	routing, err := snapshotDevRouting(ctx, services, tool, previous)
	if err != nil {
		return err
	}
	rollback := func(cause error) error {
		// Cancellation must stop generation without preventing its rollback.
		recovery := context.WithoutCancel(ctx)
		restoreErr := store.Restore(recovery, tool.Name, previous)
		return errors.Join(cause, restoreErr, restoreDevRouting(recovery, services, routing))
	}
	if err := change(ctx, store); err != nil {
		return err
	}
	if tool.Disabled {
		err = services.Orchestrator.UninstallTool(ctx, tool, services.ProjectConfig)
	} else {
		err = services.Orchestrator.GenerateTool(ctx, tool, services.ProjectConfig)
	}
	if err != nil {
		return rollback(err)
	}
	if err := services.Orchestrator.GenerateShellScripts(ctx, services.ToolConfigs, services.ProjectConfig); err != nil {
		return rollback(err)
	}
	return nil
}

func init() {
	toolDevCmd.AddCommand(toolDevUseCmd, toolDevOffCmd, toolDevListCmd)
}
