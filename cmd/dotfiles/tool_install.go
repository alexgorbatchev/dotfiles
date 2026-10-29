package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
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
			ctx = config.WithTargeted(ctx, true)
			var failures toolbatch.Failures
			for _, toolName := range args {
				if err := ctx.Err(); err != nil {
					return errors.Join(failures.Err(), err)
				}
				if strings.Contains(toolName, "=") {
					continue
				}
				targetTool := config.FindTargetTool(services.ToolConfigs, toolName)
				if targetTool == nil {
					failures.Record(log, toolName, fmt.Errorf("tool %q not found in configuration", toolName))
					continue
				}
				if targetTool.Disabled {
					log.WithTag(targetTool.Name).Info(logger.Message("Skipping installation: tool is disabled for this configuration"))
					continue
				}

				failures.Record(log, targetTool.Name, services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig))
			}
			return failures.Err()
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
