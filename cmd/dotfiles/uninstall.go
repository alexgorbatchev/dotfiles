package main

import (
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/spf13/cobra"
)

var uninstallCmd = &cobra.Command{
	Use:   "uninstall [tool]",
	Short: "Uninstalls a specific tool and cleans up matching shims/symlinks",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("uninstall", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)

		if len(args) > 0 {
			toolName := args[0]
			log.Info(logger.Message(fmt.Sprintf("Uninstalling tool: %s", toolName)))

			var targetTool *config.ToolConfig
			for _, tc := range services.ToolConfigs {
				if tc.Name == toolName || strings.HasSuffix(tc.Name, "--"+toolName) {
					targetTool = tc
					break
				}
				for _, b := range tc.Binaries {
					switch val := b.(type) {
					case string:
						if val == toolName {
							targetTool = tc
							break
						}
					case map[string]interface{}:
						if bName, ok := val["name"].(string); ok && bName == toolName {
							targetTool = tc
							break
						}
					}
				}
				if targetTool != nil {
					break
				}
			}

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

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(uninstallCmd)
}
