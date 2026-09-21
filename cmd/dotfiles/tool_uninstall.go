package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
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

		if len(args) > 0 {
			for _, toolName := range args {
				targetTool := config.FindTool(services.ToolConfigs, toolName)
				if targetTool == nil {
					return fmt.Errorf("tool %q not found in configuration", toolName)
				}

				err = services.Orchestrator.UninstallTool(ctx, targetTool, services.ProjectConfig)
				if err != nil {
					return err
				}
			}
		} else {
			log.Info("Uninstalling all configured tools")

			sorted, err := orchestrator.TopologicalSort(services.ToolConfigs)
			if err != nil {
				return err
			}

			// Uninstall in reverse topological order
			for i := len(sorted) - 1; i >= 0; i-- {
				tool := sorted[i]
				err = services.Orchestrator.UninstallTool(ctx, tool, services.ProjectConfig)
				if err != nil {
					return err
				}
			}
		}

		return nil
	},
}
