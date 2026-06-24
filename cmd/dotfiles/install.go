package main

import (
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var installCmd = &cobra.Command{
	Use:   "install [tool]",
	Short: "Installs either a single specified tool or all tools defined in the configuration",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("install", cmd.ErrOrStderr())

		if len(args) > 0 {
			toolName := args[0]
			log.Info(logger.Message(fmt.Sprintf("Installing tool: %s", toolName)))

			var targetTool *config.ToolConfig
			for _, tc := range services.ToolConfigs {
				if tc.Name == toolName || strings.HasSuffix(tc.Name, "--"+toolName) {
					targetTool = tc
					break
				}
				for _, b := range tc.Binaries {
					log.Info(logger.Message(fmt.Sprintf("Checking binary: %v of type %T against %s", b, b, toolName)))
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

			log.Info(logger.Message(fmt.Sprintf("Matched tool to install: %s", targetTool.Name)))

			err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
			if err != nil {
				return err
			}
		} else {
			log.Info("Installing all configured tools")

			err = services.Orchestrator.InstallTools(ctx, services.ToolConfigs, services.ProjectConfig)
			if err != nil {
				return err
			}
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(installCmd)
}
