package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var checkUpdatesCmd = &cobra.Command{
	Use:   "check-updates",
	Short: "Check for tool updates across configured tools",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("check-updates", cmd.ErrOrStderr())
		log.Info("Checking for updates across configured tools...")

		instReg := installer.DefaultRegistry()

		for _, tool := range services.ToolConfigs {
			if tool.Disabled || tool.InstallationMethod == "" {
				continue
			}

			inst, err := instReg.Get(tool.InstallationMethod)
			if err != nil {
				log.GetSubLogger("", tool.Name).Warn(logger.Message(fmt.Sprintf("Installer %q not found", tool.InstallationMethod)))
				continue
			}

			res, err := inst.CheckUpdate(ctx, tool)
			if err != nil {
				log.GetSubLogger("", tool.Name).Error("Update check failed", err)
				continue
			}

			if res != nil {
				if res.HasUpdate {
					log.Info(logger.Message(fmt.Sprintf("%s: update available (%s -> %s)", tool.Name, res.LocalVersion, res.LatestVersion)))
					fmt.Fprintf(cmd.OutOrStdout(), "%s: update available (%s -> %s)\n", tool.Name, res.LocalVersion, res.LatestVersion)
				} else {
					log.Info(logger.Message(fmt.Sprintf("%s: up to date (%s)", tool.Name, res.LocalVersion)))
					fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (%s)\n", tool.Name, res.LocalVersion)
				}
			}
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(checkUpdatesCmd)
}
