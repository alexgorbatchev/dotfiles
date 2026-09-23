package main

import (
	"fmt"
	"io"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/spf13/cobra"
)

var toolCheckJSON bool

// checkStatusFailed is the --json status of a tool whose check failed. It is not an
// orchestrator.CheckStatus value, since those are what a check found and a failed check
// found nothing (orchestrator.CheckTool returns the error), but a report that lists
// every tool it was asked about still has to name the ones it could not check.
const checkStatusFailed orchestrator.CheckStatus = "failed"

// ToolUpdateResult is one tool's entry in tool check --json.
type ToolUpdateResult struct {
	ToolName string `json:"tool"`
	// Status is what the check found (orchestrator.CheckStatus), or checkStatusFailed:
	// one field, so no combination of flags can describe a tool two ways at once.
	Status         orchestrator.CheckStatus `json:"status"`
	CurrentVersion string                   `json:"currentVersion,omitempty"`
	LatestVersion  string                   `json:"latestVersion,omitempty"`
	Cached         bool                     `json:"cached"`
	// Error is why the check failed; set only with checkStatusFailed.
	Error string `json:"error,omitempty"`
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
		failed := false

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

			// The load rejects a method no installer handles, so a lookup that fails here
			// is an internal error, not something the configuration can cause.
			inst, err := instReg.Get(tool.InstallationMethod)
			if err != nil {
				return fmt.Errorf("getting installer for %q: %w", tool.Name, err)
			}

			toolDestDir := ""
			if services.ProjectConfig.Paths.BinariesDir != "" {
				toolDestDir = filepath.Join(services.ProjectConfig.Paths.BinariesDir, tool.Name, "current")
			}
			configureInstallerForUpdate(inst, toolDestDir, services.ProjectConfig)

			// A tool that cannot be checked is logged with the cause, and in JSON listed
			// as failed; the other tools are still checked, and the run then fails.
			fail := func(msg logger.Message, installed *registry.ToolInstallationRecord, err error) {
				toolLog.Error(msg)
				failed = true
				if toolCheckJSON {
					jsonResults = append(jsonResults, failedCheck(tool, installed, err))
				}
			}
			installed, err := services.Registry.GetToolInstallation(ctx, tool.Name)
			if err != nil {
				fail(installationReadFailed(err), nil, err)
				continue
			}
			check, err := orchestrator.CheckTool(ctx, inst, tool, installed)
			if err != nil {
				fail(updateCheckFailed(err), installed, err)
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
			if err := cliout.RenderJSON(cmd.OutOrStdout(), jsonResults); err != nil {
				return err
			}
		}
		// Every failure was logged where it happened, so main only sets the exit status.
		if failed {
			return ErrSilent
		}
		return nil
	},
}

// failedCheck is the --json entry of a tool whose check failed with err. installed is
// its installation record, nil when there is none or it could not be read.
func failedCheck(tool *config.ToolConfig, installed *registry.ToolInstallationRecord, err error) ToolUpdateResult {
	result := ToolUpdateResult{ToolName: tool.Name, Status: checkStatusFailed, Error: err.Error()}
	if installed != nil {
		result.CurrentVersion = installed.Version
	}
	return result
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
	case orchestrator.CheckStatusUpToDate:
		toolLog.Info(logger.Message("Up to date" + versionSuffix(r.CurrentVersion, r.Cached)))
	default:
		// Only a status this switch does not know reaches here; it is named as it is,
		// never mistaken for up to date.
		toolLog.Info(logger.Message("Status: " + string(r.Status)))
	}
}

// installationReadFailed and updateCheckFailed are how tool check and tool update log a
// tool they cannot check. The cause is part of the message because the logger keeps an
// error argument's text for --trace.
func installationReadFailed(err error) logger.Message {
	return logger.Message(fmt.Sprintf("Reading the installation record failed: %v", err))
}

func updateCheckFailed(err error) logger.Message {
	return logger.Message(fmt.Sprintf("Update check failed: %v", err))
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
	case orchestrator.CheckStatusUpToDate:
		fmt.Fprintf(w, "%s: up to date%s\n", r.ToolName, versionSuffix(r.CurrentVersion, r.Cached))
	default:
		fmt.Fprintf(w, "%s: %s\n", r.ToolName, r.Status)
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
