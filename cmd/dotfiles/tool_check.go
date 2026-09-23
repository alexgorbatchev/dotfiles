package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
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
	// UpdateCheckSupported is false when the tool's installer has no way to learn the
	// latest version upstream, so HasUpdate says nothing about whether it is current.
	UpdateCheckSupported bool `json:"updateCheckSupported"`
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

			toolLog := log.WithTag(tool.Name)
			if !tool.UpdateCheckEnabled() {
				toolLog.Debug(logger.Message("Update checks disabled by updateCheck.enabled"))
				continue
			}

			inst, err := instReg.Get(tool.InstallationMethod)
			if err != nil {
				toolLog.Warn(logger.Message(fmt.Sprintf("Installer %q not found", tool.InstallationMethod)))
				continue
			}

			toolDestDir := ""
			if services.ProjectConfig.Paths.BinariesDir != "" {
				toolDestDir = filepath.Join(services.ProjectConfig.Paths.BinariesDir, tool.Name, "current")
			}
			configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

			res, err := inst.CheckUpdate(ctx, tool)
			unsupported := errors.Is(err, installer.ErrUpdateCheckUnsupported)
			if err != nil && !unsupported {
				toolLog.Error("Update check failed", err)
				continue
			}
			if !unsupported && res == nil {
				continue
			}

			result := ToolUpdateResult{
				ToolName:             tool.Name,
				CurrentVersion:       checkedLocalVersion(ctx, services, tool),
				UpdateCheckSupported: !unsupported,
			}
			if !unsupported {
				result.LatestVersion = res.LatestVersion
				result.Cached = res.Cached
				result.HasUpdate = version.UpdateAvailable(version.UpdateQuery{
					Installed:  result.CurrentVersion,
					Latest:     res.LatestVersion,
					Constraint: tool.UpdateCheckConstraint(),
					Outdated:   res.Outdated,
				})
			}

			logCheckResult(toolLog, tool, result)
			if toolCheckJSON {
				jsonResults = append(jsonResults, result)
			} else {
				printCheckResult(cmd.OutOrStdout(), tool, result)
			}
		}

		if toolCheckJSON {
			return cliout.RenderJSON(cmd.OutOrStdout(), jsonResults)
		}

		return nil
	},
}

// checkedLocalVersion is the version a check compares upstream against: the installed
// one when the registry has it, otherwise the version the configuration asks for
// (config.ToolConfig.RequestedVersion).
func checkedLocalVersion(ctx context.Context, services *Services, tool *config.ToolConfig) string {
	installed, _ := services.Registry.GetToolInstallation(ctx, tool.Name)
	if installed != nil && installed.Version != "" {
		return installed.Version
	}
	return tool.RequestedVersion()
}

// logCheckResult reports one tool's check on the diagnostic stream.
func logCheckResult(toolLog *logger.Logger, tool *config.ToolConfig, r ToolUpdateResult) {
	switch {
	case !r.UpdateCheckSupported:
		toolLog.Info(logger.Message(orchestrator.UpdateCheckUnsupportedMessage(tool)))
	case r.HasUpdate && r.CurrentVersion != "":
		toolLog.Info(logger.Message(fmt.Sprintf("Update available: %s -> %s", r.CurrentVersion, r.LatestVersion)))
	case r.HasUpdate:
		toolLog.Info(logger.Message(fmt.Sprintf("Available: %s", r.LatestVersion)))
	default:
		toolLog.Info(logger.Message("Up to date" + versionSuffix(r.CurrentVersion, r.Cached)))
	}
}

// printCheckResult writes one tool's check to stdout, as a compact key-value line in
// agent mode and as a sentence otherwise.
func printCheckResult(w io.Writer, tool *config.ToolConfig, r ToolUpdateResult) {
	if cliout.IsAgentMode() {
		if !r.UpdateCheckSupported {
			fmt.Fprintf(w, "tool:%s current:%s supported:false installer:%s\n", r.ToolName, r.CurrentVersion, tool.InstallationMethod)
			return
		}
		fmt.Fprintf(w, "tool:%s current:%s latest:%s update:%t cached:%t\n", r.ToolName, r.CurrentVersion, r.LatestVersion, r.HasUpdate, r.Cached)
		return
	}

	switch {
	case !r.UpdateCheckSupported:
		fmt.Fprintf(w, "%s: update check not supported (%s)\n", r.ToolName, tool.InstallationMethod)
	case r.HasUpdate && r.CurrentVersion != "":
		fmt.Fprintf(w, "%s: update available (%s -> %s)\n", r.ToolName, r.CurrentVersion, r.LatestVersion)
	case r.HasUpdate:
		fmt.Fprintf(w, "%s: available (%s)\n", r.ToolName, r.LatestVersion)
	default:
		fmt.Fprintf(w, "%s: up to date%s\n", r.ToolName, versionSuffix(r.CurrentVersion, r.Cached))
	}
}

// versionSuffix renders the parenthesised " (v1.2.3, cached)" tail of an up-to-date
// line, leaving out whichever part is absent.
func versionSuffix(currentVersion string, cached bool) string {
	switch {
	case currentVersion != "" && cached:
		return fmt.Sprintf(" (%s, cached)", currentVersion)
	case currentVersion != "":
		return fmt.Sprintf(" (%s)", currentVersion)
	case cached:
		return " (cached)"
	default:
		return ""
	}
}

func init() {
	toolCheckCmd.Flags().BoolVar(&toolCheckJSON, "json", false, "Output results in JSON format")
}
