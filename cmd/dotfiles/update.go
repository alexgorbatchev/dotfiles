package main

import (
	"fmt"
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
	"github.com/spf13/cobra"
)

func configureInstallerForUpdate(inst installer.Installer, toolDestDir string, projCfg *config.ProjectConfig) {
	switch instInstance := inst.(type) {
	case *installer.GitHubInstaller:
		instInstance.BinDir = toolDestDir
		if projCfg.Github.Host != "" {
			instInstance.BaseURL = projCfg.Github.Host
		}
		if projCfg.Paths.GeneratedDir != "" {
			instInstance.CacheDir = filepath.Join(projCfg.Paths.GeneratedDir, "cache", "github-api")
		}
		if projCfg.Github.Cache.TTL > 0 {
			instInstance.CacheTTL = time.Duration(projCfg.Github.Cache.TTL) * time.Millisecond
		}
	case *installer.GiteaInstaller:
		instInstance.BinDir = toolDestDir
		if projCfg.Paths.GeneratedDir != "" {
			instInstance.CacheDir = filepath.Join(projCfg.Paths.GeneratedDir, "cache", "gitea-api")
		}
	case *installer.CargoInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.CurlBinaryInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.CurlScriptInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.CurlTarInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.DmgInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.ManualInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.ZshPluginInstaller:
		instInstance.BinDir = toolDestDir
	case *installer.PkgInstaller:
		instInstance.BinDir = toolDestDir
	}
}

var updateCmd = &cobra.Command{
	Use:   "update [tool]",
	Short: "Evaluates versions and installs newer software packages if available",
	Long: `Evaluates tool versions and updates software packages if newer versions are available.

When run without arguments, checks all installed tools for updates and installs newer versions if available. When a tool name is provided, checks and updates only that tool if it is currently installed. Uninstalled tools are skipped.`,
	Example: `  # Update all installed tools
  dotfiles update

  # Update a specific installed tool
  dotfiles update ripgrep

  # Force re-download and re-installation even if already up to date
  dotfiles update --force ripgrep`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		shimMode, _ := cmd.Flags().GetBool("shim-mode")
		if shimMode {
			logLevel = "quiet"
		}
		force, _ := cmd.Flags().GetBool("force")
		if force {
			ctx = config.WithOverwrite(ctx, true)
		}
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("update", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)
		log.Info("Evaluating versions and checking for updates...")

		if len(args) == 0 {
			log.Info(logger.Message("Checking all configured tools for updates..."))
			for _, targetTool := range services.ToolConfigs {
				installed, err := services.Registry.GetToolInstallation(ctx, targetTool.Name)
				if err != nil || installed == nil {
					continue // skip uninstalled
				}

				inst, err := installer.Get(targetTool.InstallationMethod)
				if err != nil {
					continue
				}

				toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
				configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

				res, err := inst.CheckUpdate(ctx, targetTool)
				if err != nil {
					continue
				}

				var hasUpdate bool
				if res != nil && res.LatestVersion != "" {
					status := version.CheckVersionStatus(installed.Version, res.LatestVersion)
					if status == version.StatusNewerAvailable {
						hasUpdate = true
					} else if status == version.StatusInvalidCurrent || status == version.StatusInvalidLatest {
						hasUpdate = version.CleanVersion(res.LatestVersion) != version.CleanVersion(installed.Version)
					}
				}

				if hasUpdate || force {
					targetVersion := installed.Version
					if res != nil && res.LatestVersion != "" {
						targetVersion = res.LatestVersion
					}
					if hasUpdate {
						log.Info(logger.Message(fmt.Sprintf("New version available for %s: %s (currently installed: %s)", targetTool.Name, targetVersion, installed.Version)))
					} else {
						log.Info(logger.Message(fmt.Sprintf("Force updating %s: reinstalling version %s", targetTool.Name, targetVersion)))
					}
					targetTool.Version = &targetVersion
					if targetTool.InstallParams != nil {
						targetTool.InstallParams["version"] = targetVersion
					}
					err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
					if err != nil {
						log.Error(logger.Message(fmt.Sprintf("Updating tool %q to version %s failed", targetTool.Name, targetVersion)), err)
						continue
					}
					log.Info(logger.Message(fmt.Sprintf("Tool %q successfully updated to version %s", targetTool.Name, targetVersion)))
				}
			}
			log.Info(logger.Messages.CommandCompleted(dryRun))
			return nil
		}

		toolName := args[0]

		// 1. Find tool config
		targetTool := config.FindTool(services.ToolConfigs, toolName)

		if targetTool == nil {
			return fmt.Errorf("tool %q not found in configuration", toolName)
		}

		// 2. Check if installed in DB
		installed, err := services.Registry.GetToolInstallation(ctx, targetTool.Name)
		if err != nil {
			return fmt.Errorf("tool %q is not installed (no database record found): %w", toolName, err)
		}
		if installed == nil {
			return fmt.Errorf("tool %q is not installed", toolName)
		}

		// 3. Get the installer
		inst, err := installer.Get(targetTool.InstallationMethod)
		if err != nil {
			return fmt.Errorf("getting installer for %q: %w", targetTool.Name, err)
		}

		// Configure BinDir, BaseURL, and cache settings if supported
		toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
		configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

		// 4. Check for update
		log.Info(logger.Message(fmt.Sprintf("Checking %q for updates...", targetTool.Name)))
		res, err := inst.CheckUpdate(ctx, targetTool)
		if err != nil {
			return fmt.Errorf("checking update for %q: %w", targetTool.Name, err)
		}

		var hasUpdate bool
		if res != nil && res.LatestVersion != "" {
			status := version.CheckVersionStatus(installed.Version, res.LatestVersion)
			if status == version.StatusNewerAvailable {
				hasUpdate = true
			} else if status == version.StatusInvalidCurrent || status == version.StatusInvalidLatest {
				hasUpdate = version.CleanVersion(res.LatestVersion) != version.CleanVersion(installed.Version)
			}
		}

		if hasUpdate || force {
			targetVersion := installed.Version
			if res != nil && res.LatestVersion != "" {
				targetVersion = res.LatestVersion
			}
			if hasUpdate {
				log.Info(logger.Message(fmt.Sprintf("New version available for %s: %s (currently installed: %s)", targetTool.Name, targetVersion, installed.Version)))
			} else {
				log.Info(logger.Message(fmt.Sprintf("Force updating %s: reinstalling version %s", targetTool.Name, targetVersion)))
			}

			// Update the target tool's version pointer and install params to the new version and run installation
			targetTool.Version = &targetVersion
			if targetTool.InstallParams != nil {
				targetTool.InstallParams["version"] = targetVersion
			}
			err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
			if err != nil {
				return fmt.Errorf("updating tool %q to version %s failed: %w", targetTool.Name, targetVersion, err)
			}
			log.Info(logger.Message(fmt.Sprintf("Tool %q successfully updated to version %s", targetTool.Name, targetVersion)))
		} else {
			if res != nil && res.Cached {
				log.Info(logger.Message(fmt.Sprintf("Tool %q is already up to date (%s, cached)", targetTool.Name, installed.Version)))
			} else {
				log.Info(logger.Message(fmt.Sprintf("Tool %q is already up to date (%s)", targetTool.Name, installed.Version)))
			}
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	updateCmd.Flags().Bool("shim-mode", false, "Quiet update mode for shims")
	updateCmd.Flags().BoolP("force", "f", false, "Force re-download and re-installation even if already up to date")
	rootCmd.AddCommand(updateCmd)
}
