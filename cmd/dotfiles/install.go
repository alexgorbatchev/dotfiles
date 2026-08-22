package main

import (
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var installForce bool

var installCmd = &cobra.Command{
	Use:   "install [tool]",
	Short: "Installs either a single specified tool or all tools defined in the configuration",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		shimMode, _ := cmd.Flags().GetBool("shim-mode")
		if shimMode {
			logLevel = "quiet"
		}
		if installForce {
			ctx = config.WithOverwrite(ctx, true)
		}
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("install", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)

		if len(args) > 0 {
			for _, toolName := range args {
				if strings.Contains(toolName, "=") {
					continue
				}
				targetTool := config.FindTool(services.ToolConfigs, toolName)
				if targetTool == nil {
					return fmt.Errorf("tool %q not found in configuration", toolName)
				}

				log.Info(logger.Message(fmt.Sprintf("Installing tool: %s", targetTool.Name)))

				err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
				if err != nil {
					return err
				}
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
	installCmd.Flags().Bool("shim-mode", false, "Quiet installation mode for shims")
	installCmd.Flags().BoolVarP(&installForce, "force", "f", false, "Force installation even if already installed")
	rootCmd.AddCommand(installCmd)
}
