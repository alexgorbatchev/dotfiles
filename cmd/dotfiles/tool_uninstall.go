package main

import (
	"errors"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
	"github.com/spf13/cobra"
)

var toolUninstallCmd = &cobra.Command{
	Use:               "uninstall [tool...]",
	Args:              cobra.ArbitraryArgs,
	Short:             "Uninstall one or all configured tools",
	ValidArgsFunction: completeToolNames,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("uninstall", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)
		log.Info("Starting tool uninstallation...")

		var failures toolbatch.Failures
		if len(args) > 0 {
			for _, toolName := range args {
				if err := ctx.Err(); err != nil {
					return errors.Join(failures.Err(), err)
				}
				targetTool := config.FindTargetTool(services.ToolConfigs, toolName)
				if targetTool == nil {
					failures.Record(log, toolName, fmt.Errorf("tool %q not found in configuration", toolName))
					continue
				}

				failures.Record(log, targetTool.Name, services.Orchestrator.UninstallTool(ctx, targetTool, services.ProjectConfig))
			}
		} else {
			log.Info("Uninstalling all configured tools")

			return services.Orchestrator.UninstallTools(ctx, services.ToolConfigs, services.ProjectConfig)
		}

		return failures.Err()
	},
}
