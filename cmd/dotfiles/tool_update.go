package main

import (
	"fmt"
	"io"
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/spf13/cobra"
)

func configureInstallerForUpdate(inst installer.Installer, toolDestDir string, projCfg *config.ProjectConfig) {
	installer.SetGitHubSettings(inst, installer.GitHubSettings{
		Host:         projCfg.Github.Host,
		Token:        projCfg.Github.Token,
		UserAgent:    projCfg.Github.UserAgent,
		CacheEnabled: projCfg.Github.Cache.IsEnabled(),
	})
	installer.SetCargoSettings(inst, installer.NewCargoSettings(projCfg))

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

// updateLogs are the loggers update writes through: progress for the checking and
// installing a run does, and report for what became of each tool (pinned, already up
// to date, about to move to a release, updated, or not checkable upstream).
type updateLogs struct {
	progress *logger.Logger
	report   *logger.Logger
}

// newUpdateLogs returns the loggers for an update that logs through log. Outside shim
// mode both are log. A shim's @update prints nothing of its own, so in shim mode what
// became of the tool is the only answer its user gets: report is kept at the default
// level while progress, like the rest of the run, stays as quiet as --shim-mode made it.
// Errors reach the user in either mode, since even a quiet logger writes them.
func newUpdateLogs(log *logger.Logger, w io.Writer, shimMode bool) updateLogs {
	if !shimMode {
		return updateLogs{progress: log, report: log}
	}
	return updateLogs{progress: log, report: newLogger("update", w, logger.LogLevelDefault)}
}

// withTag returns the loggers for messages about one tool.
func (l updateLogs) withTag(tag string) updateLogs {
	return updateLogs{progress: l.progress.WithTag(tag), report: l.report.WithTag(tag)}
}

// refusePinned reports whether update leaves tool alone because its configuration pins
// a version (config.ToolConfig.UpdateRefusal), and logs why when it does. It runs before
// the tool's update check, so a pinned tool is neither checked nor reinstalled, with or
// without --force.
func refusePinned(toolLog *logger.Logger, tool *config.ToolConfig) bool {
	reason, refused := tool.UpdateRefusal()
	if refused {
		toolLog.Info(logger.Message(reason))
	}
	return refused
}

// announceUpdate logs why the tool is about to be reinstalled: as a warning when its
// installer could not check upstream, since the tool is reinstalled unchecked.
func announceUpdate(toolLog *logger.Logger, tool *config.ToolConfig, plan orchestrator.UpdatePlan) {
	msg := logger.Message(plan.Announcement(tool))
	if plan.Status == orchestrator.CheckStatusUnsupported {
		toolLog.Warn(msg)
		return
	}
	toolLog.Info(msg)
}

var toolUpdateCmd = &cobra.Command{
	Use:               "update [tool...]",
	Aliases:           []string{"u"},
	Args:              cobra.ArbitraryArgs,
	Short:             "Upgrade tools to their latest available release",
	ValidArgsFunction: completeToolNames,
	Long: `Evaluates tool versions and updates software packages if newer versions are available.

When run without arguments, checks all installed tools for updates and installs newer versions if available. When one or more tool names are provided, checks and updates only those tools if they are currently installed. Uninstalled tools are skipped when batch updating. A tool whose configuration pins a version, with .version() or a version install parameter, is never updated, even with --force; set that version to "latest" to enable updates. When a tool is named, an update check whose upstream query fails makes its update fail, even with --force; "dotfiles tool install --force <tool>" reinstalls without checking.`,
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
		logs := newUpdateLogs(log, cmd.ErrOrStderr(), shimMode)
		logs.progress.Info("Evaluating versions and checking for updates...")

		if len(args) == 0 {
			logs.progress.Info(logger.Message("Checking all configured tools for updates..."))
			for _, targetTool := range services.ToolConfigs {
				installed, err := services.Registry.GetToolInstallation(ctx, targetTool.Name)
				if err != nil || installed == nil {
					continue // skip uninstalled
				}

				toolLogs := logs.withTag(targetTool.Name)
				if refusePinned(toolLogs.report, targetTool) {
					continue
				}

				inst, err := services.Installers.Get(targetTool.InstallationMethod)
				if err != nil {
					continue
				}

				toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
				configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

				res, err := inst.CheckUpdate(ctx, targetTool)
				plan, err := orchestrator.PlanUpdate(targetTool, installed.Version, res, err, force)
				if err != nil {
					continue
				}

				// Unlike updating one named tool, updating everything does not reinstall a
				// tool nothing could check unless --force asks for it.
				if plan.Status == orchestrator.CheckStatusUnsupported && !force {
					toolLogs.report.Warn(logger.Message(orchestrator.UpdateCheckUnsupportedMessage(targetTool)))
					continue
				}
				if !plan.Reinstall() && plan.Status == orchestrator.CheckStatusAheadOfLatest {
					toolLogs.report.Info(logger.Message(orchestrator.AheadOfLatestMessage(plan.InstalledVersion, plan.LatestVersion)))
					continue
				}
				if plan.Reinstall() {
					announceUpdate(toolLogs.report, targetTool, plan)
					recorded, err := services.Orchestrator.ApplyUpdate(ctx, targetTool, services.ProjectConfig, plan)
					if err != nil {
						toolLogs.report.Error(logger.Message("Updating"+plan.TargetDescription()+" failed"), err)
						continue
					}
					toolLogs.report.Info(logger.Message(plan.Completion(recorded)))
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

			toolLogs := logs.withTag(targetTool.Name)
			if refusePinned(toolLogs.report, targetTool) {
				continue
			}

			inst, err := services.Installers.Get(targetTool.InstallationMethod)
			if err != nil {
				return fmt.Errorf("getting installer for %q: %w", targetTool.Name, err)
			}

			toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
			configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

			toolLogs.progress.Info(logger.Message("Checking for updates..."))
			res, err := inst.CheckUpdate(ctx, targetTool)
			plan, err := orchestrator.PlanUpdate(targetTool, installed.Version, res, err, force)
			if err != nil {
				return err
			}
			if plan.Reinstall() {
				announceUpdate(toolLogs.report, targetTool, plan)
				recorded, err := services.Orchestrator.ApplyUpdate(ctx, targetTool, services.ProjectConfig, plan)
				if err != nil {
					return fmt.Errorf("updating tool %q%s failed: %w", targetTool.Name, plan.TargetDescription(), err)
				}
				toolLogs.report.Info(logger.Message(plan.Completion(recorded)))
			} else if plan.Status == orchestrator.CheckStatusAheadOfLatest {
				toolLogs.report.Info(logger.Message(orchestrator.AheadOfLatestMessage(plan.InstalledVersion, plan.LatestVersion)))
			} else {
				toolLogs.report.Info(logger.Message("Already up to date" + versionSuffix(installed.Version, res != nil && res.Cached)))
			}
		}

		return nil
	},
}

func init() {
	toolUpdateCmd.Flags().Bool("shim-mode", false, "Used by shims running @update: report the outcome without progress output")
	toolUpdateCmd.Flags().BoolP("force", "f", false, "Force re-download and re-installation even if already up to date")
}
