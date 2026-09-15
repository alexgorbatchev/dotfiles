package main

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
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

			toolDestDir := ""
			if services.ProjectConfig.Paths.BinariesDir != "" {
				toolDestDir = filepath.Join(services.ProjectConfig.Paths.BinariesDir, tool.Name, "current")
			}
			configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

			res, err := inst.CheckUpdate(ctx, tool)
			if err != nil {
				log.GetSubLogger("", tool.Name).Error("Update check failed", err)
				continue
			}

			if res != nil {
				installed, _ := services.Registry.GetToolInstallation(ctx, tool.Name)
				var localVersion string
				if installed != nil && installed.Version != "" {
					localVersion = installed.Version
				} else if tool.Version != nil && *tool.Version != "" {
					localVersion = *tool.Version
				}

				var hasUpdate bool
				if res.LatestVersion != "" {
					if localVersion != "" {
						status := version.CheckVersionStatus(localVersion, res.LatestVersion)
						if status == version.StatusNewerAvailable {
							hasUpdate = true
						} else if status == version.StatusInvalidCurrent || status == version.StatusInvalidLatest {
							hasUpdate = version.CleanVersion(res.LatestVersion) != version.CleanVersion(localVersion)
						}
					} else {
						hasUpdate = true
					}
				}

				toolLog := log.GetSubLogger("", tool.Name)
				if hasUpdate {
					if localVersion != "" {
						toolLog.Info(logger.Message(fmt.Sprintf("Update available: %s -> %s", localVersion, res.LatestVersion)))
						fmt.Fprintf(cmd.OutOrStdout(), "%s: update available (%s -> %s)\n", tool.Name, localVersion, res.LatestVersion)
					} else {
						toolLog.Info(logger.Message(fmt.Sprintf("Available: %s", res.LatestVersion)))
						fmt.Fprintf(cmd.OutOrStdout(), "%s: available (%s)\n", tool.Name, res.LatestVersion)
					}
				} else {
					if localVersion != "" {
						if res.Cached {
							toolLog.Info(logger.Message(fmt.Sprintf("Up to date (%s, cached)", localVersion)))
							fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (%s, cached)\n", tool.Name, localVersion)
						} else {
							toolLog.Info(logger.Message(fmt.Sprintf("Up to date (%s)", localVersion)))
							fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (%s)\n", tool.Name, localVersion)
						}
					} else {
						if res.Cached {
							toolLog.Info(logger.Message("Up to date (cached)"))
							fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (cached)\n", tool.Name)
						} else {
							toolLog.Info(logger.Message("Up to date"))
							fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date\n", tool.Name)
						}
					}
				}
			}
		}

		return nil
	},
}

func init() {
	rootCmd.AddCommand(checkUpdatesCmd)
}
