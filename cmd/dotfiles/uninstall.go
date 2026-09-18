package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/spf13/cobra"
)

var uninstallCmd = &cobra.Command{
	Use:               "uninstall [tool]",
	Args:              cobra.MaximumNArgs(1),
	Short:             "Uninstalls a specific tool and cleans up matching shims/symlinks",
	ValidArgsFunction: completeToolName,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("uninstall", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)
		log.Info("Starting tool uninstallation...")

		if len(args) > 0 {
			toolName := args[0]
			targetTool := config.FindTool(services.ToolConfigs, toolName)
			if targetTool == nil {
				return fmt.Errorf("tool %q not found in configuration", toolName)
			}

			err = services.Orchestrator.UninstallTool(ctx, targetTool, services.ProjectConfig)
			if err != nil {
				return err
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

func init() {
	rootCmd.AddCommand(uninstallCmd)
}
