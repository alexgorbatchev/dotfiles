package main

import (
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var toolInstallCmd = &cobra.Command{
	Use:               "install [tool...]",
	Aliases:           []string{"i"},
	Args:              cobra.ArbitraryArgs,
	Short:             "Install one or all configured tools",
	ValidArgsFunction: completeToolNames,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		shimMode, _ := cmd.Flags().GetBool("shim-mode")
		if shimMode {
			logLevel = "quiet"
		}
		force, _ := cmd.Flags().GetBool("force")
		if force {
			ctx = config.WithForce(ctx, true)
			ctx = config.WithOverwrite(ctx, true)
		}
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

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

				toolLog := log.WithTag(targetTool.Name)
				toolLog.Info(logger.Message("Installing..."))

				err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
				if err != nil {
					toolLog.Error(logger.Message(err.Error()))
					return ErrSilent
				}
			}
		} else {
			log.Info("Installing all configured tools")

			err = services.Orchestrator.InstallTools(ctx, services.ToolConfigs, services.ProjectConfig)
			if err != nil {
				return err
			}
		}

		return nil
	},
}

func init() {
	toolInstallCmd.Flags().Bool("shim-mode", false, "Quiet installation mode for shims")
	toolInstallCmd.Flags().BoolP("force", "f", false, "Force installation even if already installed")
}
