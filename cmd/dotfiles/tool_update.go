package main

import (
	"errors"
	"fmt"
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
	"github.com/spf13/cobra"
)

func configureInstallerForUpdate(inst installer.Installer, toolDestDir string, projCfg *config.ProjectConfig) {
	installer.SetGitHubSettings(inst, installer.GitHubSettings{
		Host:         projCfg.Github.Host,
		Token:        projCfg.Github.Token,
		UserAgent:    projCfg.Github.UserAgent,
		CacheEnabled: projCfg.Github.Cache.IsEnabled(),
	})

	switch instInstance := inst.(type) {
	case *installer.GitHubInstaller:
		instInstance.BinDir = toolDestDir
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

// updateCheckUnsupportedMessage is what update and check report for a tool whose
// installer answered installer.ErrUpdateCheckUnsupported: nothing upstream was asked,
// so the tool is neither up to date nor outdated as far as dotfiles knows.
func updateCheckUnsupportedMessage(tool *config.ToolConfig) string {
	return fmt.Sprintf("Update check not supported for installer %q", tool.InstallationMethod)
}

// updatePlan is what update decided for one installed tool, from its installer's
// answer and the --force flag.
type updatePlan struct {
	// unsupported is set when the installer answered installer.ErrUpdateCheckUnsupported.
	unsupported      bool
	hasUpdate        bool
	force            bool
	installedVersion string
	targetVersion    string
}

// reinstall reports whether the tool is installed again. A named tool whose installer
// cannot check for updates is always reinstalled, as v1 did, since nothing else can
// bring it up to date; updating everything skips such tools before planning.
func (p updatePlan) reinstall() bool {
	return p.unsupported || p.hasUpdate || p.force
}

// announce logs why the tool is about to be reinstalled.
func (p updatePlan) announce(toolLog *logger.Logger, tool *config.ToolConfig) {
	switch {
	case p.unsupported:
		toolLog.Warn(logger.Message(updateCheckUnsupportedMessage(tool) + ", performing regular install instead"))
	case p.hasUpdate:
		toolLog.Info(logger.Message(fmt.Sprintf("New version available: %s -> %s", p.installedVersion, p.targetVersion)))
	default:
		toolLog.Info(logger.Message(fmt.Sprintf("Force updating: reinstalling version %s", p.targetVersion)))
	}
}

// planUpdate answers what update does for tool given its installer's answer. res is nil
// when the installer cannot check, and the target version then comes from resolveUpdate
// like any other reinstall's.
func planUpdate(tool *config.ToolConfig, installedVersion string, res *installer.UpdateCheckResult, unsupported, force bool) updatePlan {
	hasUpdate, targetVersion := resolveUpdate(tool, installedVersion, res)
	return updatePlan{
		unsupported:      unsupported,
		hasUpdate:        hasUpdate,
		force:            force,
		installedVersion: installedVersion,
		targetVersion:    targetVersion,
	}
}

// resolveUpdate answers whether an update is available for tool and which version an
// update, or a forced reinstall, should install. res is nil when the installer answered
// nothing. The availability decision is version.UpdateAvailable, the same one
// check-updates and the dashboard make, so the three cannot disagree about a tool.
func resolveUpdate(tool *config.ToolConfig, installedVersion string, res *installer.UpdateCheckResult) (hasUpdate bool, targetVersion string) {
	var latest string
	var outdated *bool
	if res != nil {
		latest, outdated = res.LatestVersion, res.Outdated
	}
	constraint := tool.UpdateCheckConstraint()

	hasUpdate = version.UpdateAvailable(version.UpdateQuery{
		Installed:  installedVersion,
		Latest:     latest,
		Constraint: constraint,
		Outdated:   outdated,
	})

	// "unknown" and "latest" are placeholders rather than versions, and a release the
	// tool's constraint excludes is not one this command may install onto the machine.
	installable := latest != "" && latest != "unknown" && latest != "latest" && version.MatchesConstraint(latest, constraint)
	switch {
	case installable:
		targetVersion = latest
	case installedVersion != "" && installedVersion != "unknown":
		targetVersion = installedVersion
	default:
		targetVersion = utils.GenerateTimestamp()
	}

	return hasUpdate, targetVersion
}

var toolUpdateCmd = &cobra.Command{
	Use:               "update [tool...]",
	Aliases:           []string{"u"},
	Args:              cobra.ArbitraryArgs,
	Short:             "Upgrade tools to their latest available release",
	ValidArgsFunction: completeToolNames,
	Long: `Evaluates tool versions and updates software packages if newer versions are available.

When run without arguments, checks all installed tools for updates and installs newer versions if available. When one or more tool names are provided, checks and updates only those tools if they are currently installed. Uninstalled tools are skipped when batch updating.`,
	Example: `  # Update all installed tools
  dotfiles tool update

  # Update a specific installed tool
  dotfiles tool update ripgrep

  # Force re-download and re-installation even if already up to date
  dotfiles tool update --force ripgrep`,
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

				inst, err := services.Installers.Get(targetTool.InstallationMethod)
				if err != nil {
					continue
				}

				toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
				configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

				res, err := inst.CheckUpdate(ctx, targetTool)
				unsupported := errors.Is(err, installer.ErrUpdateCheckUnsupported)
				if err != nil && !unsupported {
					continue
				}

				toolLog := log.WithTag(targetTool.Name)
				// Unlike updating one named tool, updating everything does not reinstall a
				// tool nothing could check unless --force asks for it.
				if unsupported && !force {
					toolLog.Warn(logger.Message(updateCheckUnsupportedMessage(targetTool)))
					continue
				}
				plan := planUpdate(targetTool, installed.Version, res, unsupported, force)
				if plan.reinstall() {
					plan.announce(toolLog, targetTool)
					targetVersion := plan.targetVersion
					targetTool.Version = &targetVersion
					if targetTool.InstallParams != nil {
						targetTool.InstallParams["version"] = targetVersion
					}
					err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
					if err != nil {
						toolLog.Error(logger.Message(fmt.Sprintf("Updating to version %s failed", targetVersion)), err)
						continue
					}
					updatedRecord, errRec := services.Registry.GetToolInstallation(ctx, targetTool.Name)
					if errRec == nil && updatedRecord != nil && updatedRecord.Version != "" && updatedRecord.Version != "unknown" {
						targetVersion = updatedRecord.Version
					}
					toolLog.Info(logger.Message(fmt.Sprintf("Successfully updated to version %s", targetVersion)))
				}
			}
			return nil
		}

		for _, toolName := range args {
			targetTool := config.FindTool(services.ToolConfigs, toolName)
			if targetTool == nil {
				return fmt.Errorf("tool %q not found in configuration", toolName)
			}

			installed, err := services.Registry.GetToolInstallation(ctx, targetTool.Name)
			if err != nil {
				return fmt.Errorf("tool %q is not installed (no database record found): %w", toolName, err)
			}
			if installed == nil {
				if len(args) == 1 {
					return fmt.Errorf("tool %q is not installed", toolName)
				}
				continue
			}

			inst, err := services.Installers.Get(targetTool.InstallationMethod)
			if err != nil {
				return fmt.Errorf("getting installer for %q: %w", targetTool.Name, err)
			}

			toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
			configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

			toolLog := log.WithTag(targetTool.Name)
			toolLog.Info(logger.Message("Checking for updates..."))
			res, err := inst.CheckUpdate(ctx, targetTool)
			unsupported := errors.Is(err, installer.ErrUpdateCheckUnsupported)
			if err != nil && !unsupported {
				return fmt.Errorf("checking update for %q: %w", targetTool.Name, err)
			}
			plan := planUpdate(targetTool, installed.Version, res, unsupported, force)
			if plan.reinstall() {
				plan.announce(toolLog, targetTool)
				targetVersion := plan.targetVersion
				targetTool.Version = &targetVersion
				if targetTool.InstallParams != nil {
					targetTool.InstallParams["version"] = targetVersion
				}
				err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
				if err != nil {
					return fmt.Errorf("updating tool %q to version %s failed: %w", targetTool.Name, targetVersion, err)
				}
				updatedRecord, errRec := services.Registry.GetToolInstallation(ctx, targetTool.Name)
				if errRec == nil && updatedRecord != nil && updatedRecord.Version != "" && updatedRecord.Version != "unknown" {
					targetVersion = updatedRecord.Version
				}
				toolLog.Info(logger.Message(fmt.Sprintf("Successfully updated to version %s", targetVersion)))
			} else {
				toolLog.Info(logger.Message("Already up to date" + versionSuffix(installed.Version, res != nil && res.Cached)))
			}
		}

		return nil
	},
}

func init() {
	toolUpdateCmd.Flags().Bool("shim-mode", false, "Quiet update mode for shims")
	toolUpdateCmd.Flags().BoolP("force", "f", false, "Force re-download and re-installation even if already up to date")
}
