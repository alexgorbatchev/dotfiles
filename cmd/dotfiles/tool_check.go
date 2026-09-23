package main

import (
	"fmt"
	"io"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/spf13/cobra"
)

var toolCheckJSON bool

// ToolUpdateResult is one tool's entry in tool check --json.
type ToolUpdateResult struct {
	ToolName string `json:"tool"`
	// Status is what the check found (orchestrator.CheckStatus): one field, so no
	// combination of flags can describe a tool two ways at once.
	Status         orchestrator.CheckStatus `json:"status"`
	CurrentVersion string                   `json:"currentVersion,omitempty"`
	LatestVersion  string                   `json:"latestVersion,omitempty"`
	Cached         bool                     `json:"cached"`
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

			installed, err := services.Registry.GetToolInstallation(ctx, tool.Name)
			if err != nil {
				toolLog.Error("Reading the installation record failed", err)
				continue
			}
			check, err := orchestrator.CheckTool(ctx, inst, tool, installed)
			if err != nil {
				toolLog.Error("Update check failed", err)
				continue
			}

			result := ToolUpdateResult{
				ToolName:       tool.Name,
				Status:         check.Status,
				CurrentVersion: check.InstalledVersion,
				LatestVersion:  check.LatestVersion,
				Cached:         check.Cached,
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

// logCheckResult reports one tool's check on the diagnostic stream.
func logCheckResult(toolLog *logger.Logger, tool *config.ToolConfig, r ToolUpdateResult) {
	switch r.Status {
	case orchestrator.CheckStatusUnsupported:
		toolLog.Info(logger.Message(orchestrator.UpdateCheckUnsupportedMessage(tool)))
	case orchestrator.CheckStatusUpdateAvailable:
		toolLog.Info(logger.Message(fmt.Sprintf("Update available: %s -> %s", r.CurrentVersion, r.LatestVersion)))
	case orchestrator.CheckStatusAheadOfLatest:
		toolLog.Info(logger.Message(orchestrator.AheadOfLatestMessage(r.CurrentVersion, r.LatestVersion)))
	case orchestrator.CheckStatusNotInstalled:
		if r.LatestVersion == "" {
			toolLog.Info(logger.Message("Not installed"))
			return
		}
		toolLog.Info(logger.Message("Not installed; the latest available version is " + r.LatestVersion))
	default:
		toolLog.Info(logger.Message("Up to date" + versionSuffix(r.CurrentVersion, r.Cached)))
	}
}

// printCheckResult writes one tool's check to stdout, as a compact key-value line in
// agent mode and as a sentence otherwise.
func printCheckResult(w io.Writer, tool *config.ToolConfig, r ToolUpdateResult) {
	if cliout.IsAgentMode() {
		if r.Status == orchestrator.CheckStatusUnsupported {
			fmt.Fprintf(w, "tool:%s status:%s current:%s installer:%s\n", r.ToolName, r.Status, r.CurrentVersion, tool.InstallationMethod)
			return
		}
		fmt.Fprintf(w, "tool:%s status:%s current:%s latest:%s cached:%t\n", r.ToolName, r.Status, r.CurrentVersion, r.LatestVersion, r.Cached)
		return
	}

	switch r.Status {
	case orchestrator.CheckStatusUnsupported:
		fmt.Fprintf(w, "%s: update check not supported (%s)\n", r.ToolName, tool.InstallationMethod)
	case orchestrator.CheckStatusUpdateAvailable:
		fmt.Fprintf(w, "%s: update available (%s -> %s)\n", r.ToolName, r.CurrentVersion, r.LatestVersion)
	case orchestrator.CheckStatusAheadOfLatest:
		fmt.Fprintln(w, orchestrator.AheadOfLatestMessage(fmt.Sprintf("%s (%s)", r.ToolName, r.CurrentVersion), r.LatestVersion))
	case orchestrator.CheckStatusNotInstalled:
		if r.LatestVersion == "" {
			fmt.Fprintf(w, "%s: not installed\n", r.ToolName)
			return
		}
		fmt.Fprintf(w, "%s: not installed (latest: %s)\n", r.ToolName, r.LatestVersion)
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
