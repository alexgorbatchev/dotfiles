package main

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
	"github.com/spf13/cobra"
)

var toolCheckJSON bool

// ToolUpdateResult represents the update status of a tool.
type ToolUpdateResult struct {
	ToolName       string `json:"tool"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	LatestVersion  string `json:"latestVersion,omitempty"`
	HasUpdate      bool   `json:"hasUpdate"`
	Cached         bool   `json:"cached"`
}

var toolCheckCmd = &cobra.Command{
	Use:               "check [tool...]",
	Args:              cobra.ArbitraryArgs,
	Short:             "Check for newer upstream versions without installing",
	ValidArgsFunction: completeToolNames,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("check", cmd.ErrOrStderr())
		log.Info("Checking for updates across configured tools...")

		instReg := services.Installers
		jsonResults := []ToolUpdateResult{}

		toolsToCheck := services.ToolConfigs
		if len(args) > 0 {
			toolsToCheck = []*config.ToolConfig{}
			for _, name := range args {
				tc := config.FindTool(services.ToolConfigs, name)
				if tc == nil {
					return fmt.Errorf("tool %q not found in configuration", name)
				}
				toolsToCheck = append(toolsToCheck, tc)
			}
		}

		for _, tool := range toolsToCheck {
			if tool.Disabled || tool.InstallationMethod == "" {
				continue
			}

			if !tool.UpdateCheckEnabled() {
				log.WithTag(tool.Name).Debug(logger.Message("Update checks disabled by updateCheck.enabled"))
				continue
			}

			inst, err := instReg.Get(tool.InstallationMethod)
			if err != nil {
				log.WithTag(tool.Name).Warn(logger.Message(fmt.Sprintf("Installer %q not found", tool.InstallationMethod)))
				continue
			}

			toolDestDir := ""
			if services.ProjectConfig.Paths.BinariesDir != "" {
				toolDestDir = filepath.Join(services.ProjectConfig.Paths.BinariesDir, tool.Name, "current")
			}
			configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

			res, err := inst.CheckUpdate(ctx, tool)
			if err != nil {
				log.WithTag(tool.Name).Error("Update check failed", err)
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

				hasUpdate := version.UpdateAvailable(version.UpdateQuery{
					Installed:  localVersion,
					Latest:     res.LatestVersion,
					Constraint: tool.UpdateCheckConstraint(),
					Outdated:   res.Outdated,
				})

				toolLog := log.WithTag(tool.Name)
				if hasUpdate {
					if localVersion != "" {
						toolLog.Info(logger.Message(fmt.Sprintf("Update available: %s -> %s", localVersion, res.LatestVersion)))
					} else {
						toolLog.Info(logger.Message(fmt.Sprintf("Available: %s", res.LatestVersion)))
					}
				} else {
					if localVersion != "" {
						if res.Cached {
							toolLog.Info(logger.Message(fmt.Sprintf("Up to date (%s, cached)", localVersion)))
						} else {
							toolLog.Info(logger.Message(fmt.Sprintf("Up to date (%s)", localVersion)))
						}
					} else {
						if res.Cached {
							toolLog.Info(logger.Message("Up to date (cached)"))
						} else {
							toolLog.Info(logger.Message("Up to date"))
						}
					}
				}

				if toolCheckJSON {
					jsonResults = append(jsonResults, ToolUpdateResult{
						ToolName:       tool.Name,
						CurrentVersion: localVersion,
						LatestVersion:  res.LatestVersion,
						HasUpdate:      hasUpdate,
						Cached:         res.Cached,
					})
				} else if cliout.IsAgentMode() {
					fmt.Fprintf(cmd.OutOrStdout(), "tool:%s current:%s latest:%s update:%t cached:%t\n", tool.Name, localVersion, res.LatestVersion, hasUpdate, res.Cached)
				} else {
					if hasUpdate {
						if localVersion != "" {
							fmt.Fprintf(cmd.OutOrStdout(), "%s: update available (%s -> %s)\n", tool.Name, localVersion, res.LatestVersion)
						} else {
							fmt.Fprintf(cmd.OutOrStdout(), "%s: available (%s)\n", tool.Name, res.LatestVersion)
						}
					} else {
						if localVersion != "" {
							if res.Cached {
								fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (%s, cached)\n", tool.Name, localVersion)
							} else {
								fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (%s)\n", tool.Name, localVersion)
							}
						} else {
							if res.Cached {
								fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date (cached)\n", tool.Name)
							} else {
								fmt.Fprintf(cmd.OutOrStdout(), "%s: up to date\n", tool.Name)
							}
						}
					}
				}
			}
		}

		if toolCheckJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), jsonResults)
		}

		return nil
	},
}

func init() {
	toolCheckCmd.Flags().BoolVar(&toolCheckJSON, "json", false, "Output results in JSON format")
}
