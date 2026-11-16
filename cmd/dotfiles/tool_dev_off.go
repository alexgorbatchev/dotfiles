package main

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var toolDevOffCmd = &cobra.Command{
	Use:               "off <tool>",
	Args:              cobra.ExactArgs(1),
	Short:             "Deactivate a development build and restore release routing",
	ValidArgsFunction: completeToolName,
	RunE: func(cmd *cobra.Command, args []string) error {
		services, err := BootstrapServices(cmd.Context(), cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()
		tool, err := findDevToolToDisable(services, args[0])
		if err != nil {
			return err
		}
		log := GetLogger("dev", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)
		if err := changeDevTool(cmd.Context(), services, tool, func(ctx context.Context, store *devtools.Store) error {
			return store.Off(ctx, tool.Name)
		}); err != nil {
			return err
		}
		message := "Development build disabled; release routing restored"
		if tool.Disabled {
			message = "Development build disabled; inactive tool artifacts removed"
		}
		if dryRun {
			message = "[dry-run] Would disable development build"
		}
		log.WithTag(tool.Name).Info(logger.Message(message))
		return nil
	},
}

func findDevToolToDisable(services *Services, name string) (*config.ToolConfig, error) {
	store := devtools.New(services.FS, services.ProjectConfig.Paths.DevToolsDir)
	record, err := store.Lookup(name)
	if err != nil {
		return nil, err
	}
	if record != nil {
		for _, tool := range services.ToolConfigs {
			if tool.Name == record.Tool {
				return tool, nil
			}
		}
		return &config.ToolConfig{Name: record.Tool, Disabled: true}, nil
	}
	if tool := config.FindTargetTool(services.ToolConfigs, name); tool != nil {
		return tool, nil
	}
	return nil, fmt.Errorf("tool %q has no development override and is not configured", name)
}
