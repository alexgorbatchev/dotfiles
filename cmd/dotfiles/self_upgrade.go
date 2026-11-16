package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/updater"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
	"github.com/spf13/cobra"
)

var selfUpgradeCmd = &cobra.Command{
	Use:   "upgrade [version]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Self-upgrade dotfiles CLI to latest or specified release",
	Long: `Checks for and downloads the latest release of the dotfiles executable from GitHub Releases, safely updating the running binary.

If a version is specified (e.g., "dotfiles self upgrade 2.0.1"), upgrades or downgrades to that exact release version.
Use --check to inspect available updates without downloading or modifying the executable.
An active development build is preserved, including with --force or an explicit version; use tool dev off first.`,
	Example: `  # Upgrade to latest stable release
  dotfiles self upgrade

  # Check if an update is available without installing
  dotfiles self upgrade --check

  # Upgrade to a specific version
  dotfiles self upgrade 2.0.1

  # Force re-download and re-install
  dotfiles self upgrade --force`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		log := GetLogger("upgrade", cmd.ErrOrStderr())
		development, err := selfDevelopmentBuild(log)
		if err != nil {
			return err
		}
		if development != nil {
			log.WithTag(development.Tool).Info(logger.Message("Development build active; self upgrade skipped. Use tool dev off " + development.Tool + " to return to release management"))
			return nil
		}

		check, _ := cmd.Flags().GetBool("check")
		force, _ := cmd.Flags().GetBool("force")
		prerelease, _ := cmd.Flags().GetBool("prerelease")

		targetVersion := ""
		if len(args) > 0 {
			targetVersion = args[0]
		}

		baseURL := os.Getenv("DOTFILES_GITHUB_HOST")
		if baseURL == "" {
			if mockPort := os.Getenv("MOCK_SERVER_PORT"); mockPort != "" {
				baseURL = "http://127.0.0.1:" + mockPort
			}
		}

		cfg := updater.Config{BaseURL: baseURL}
		devProxy, err := startDevProxy(log.WithTag("proxy"))
		if err != nil {
			return err
		}
		if devProxy != nil {
			defer devProxy.Stop()
			cfg.HTTPClient = devProxy.Client()
		}
		u := updater.New(cfg)

		opts := updater.Options{
			CurrentVersion:  Version,
			TargetVersion:   targetVersion,
			AllowPrerelease: prerelease,
			Force:           force,
			DryRun:          dryRun,
		}

		toolLog := log.WithTag("dotfiles")

		if check {
			toolLog.Info("Checking for updates...")
			res, err := u.CheckForUpdate(ctx, opts)
			if err != nil {
				return fmt.Errorf("checking for update: %w", err)
			}

			if res.AheadOfLatest {
				toolLog.Info(logger.Message(orchestrator.AheadOfLatestMessage(res.CurrentVersion, res.LatestVersion)))
				fmt.Fprintln(cmd.OutOrStdout(), orchestrator.AheadOfLatestMessage(fmt.Sprintf("dotfiles (%s)", res.CurrentVersion), res.LatestVersion))
			} else if res.HasUpdate {
				toolLog.Info(logger.Message(fmt.Sprintf("New version available: %s -> %s", res.CurrentVersion, res.LatestVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "New version available: %s -> %s\n", res.CurrentVersion, res.LatestVersion)
			} else {
				toolLog.Info(logger.Message(fmt.Sprintf("Up to date (%s)", res.CurrentVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "dotfiles is up to date (%s)\n", res.CurrentVersion)
			}
			return nil
		}

		toolLog.Info("Evaluating upgrade...")
		res, err := u.Upgrade(ctx, opts)
		if err != nil {
			return fmt.Errorf("upgrading dotfiles: %w", err)
		}

		if dryRun {
			if res.AheadOfLatest {
				toolLog.Info(logger.Message(fmt.Sprintf("[dry-run] %s", orchestrator.AheadOfLatestMessage(res.CurrentVersion, res.LatestVersion))))
				fmt.Fprintln(cmd.OutOrStdout(), fmt.Sprintf("[dry-run] %s", orchestrator.AheadOfLatestMessage(fmt.Sprintf("dotfiles (%s)", res.CurrentVersion), res.LatestVersion)))
			} else if res.HasUpdate {
				toolLog.Info(logger.Message(fmt.Sprintf("[dry-run] Would upgrade from %s to %s", res.CurrentVersion, res.LatestVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "[dry-run] Would upgrade dotfiles: %s -> %s\n", res.CurrentVersion, res.LatestVersion)
			} else {
				toolLog.Info(logger.Message(fmt.Sprintf("[dry-run] Up to date (%s)", res.CurrentVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "[dry-run] dotfiles is up to date (%s)\n", res.CurrentVersion)
			}
			return nil
		}

		if res.Updated {
			toolLog.Info(logger.Message(fmt.Sprintf("Successfully upgraded from %s to %s", res.CurrentVersion, res.LatestVersion)))
			fmt.Fprintf(cmd.OutOrStdout(), "Successfully upgraded dotfiles: %s -> %s\n", res.CurrentVersion, res.LatestVersion)
		} else if res.AheadOfLatest {
			toolLog.Info(logger.Message(orchestrator.AheadOfLatestMessage(res.CurrentVersion, res.LatestVersion)))
			fmt.Fprintln(cmd.OutOrStdout(), orchestrator.AheadOfLatestMessage(fmt.Sprintf("dotfiles (%s)", res.CurrentVersion), res.LatestVersion))
		} else {
			toolLog.Info(logger.Message(fmt.Sprintf("Already up to date (%s)", res.CurrentVersion)))
			fmt.Fprintf(cmd.OutOrStdout(), "dotfiles is already up to date (%s)\n", res.CurrentVersion)
		}

		return nil
	},
}

// Self upgrade also works without a project. When one is selected, consult its
// local overrides without loading tool files or opening the installation database.
func selfDevelopmentBuild(log *logger.Logger) (*devtools.Record, error) {
	fsys := fs.NewOSFS()
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("locating running executable: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(executable); err == nil {
		executable = resolved
	}
	if record, err := selfDevelopmentExecutable(fsys, executable); err != nil || record != nil {
		return record, err
	}
	configPath, err := resolveConfigPath(cfgFile)
	if err != nil {
		if cfgFile == "" {
			return nil, nil
		}
		return nil, err
	}
	project, _, _, err := vm.LoadTypeScriptConfig(log, fsys, configPath, vm.WithProjectOnly(), vm.WithTarget(resolveTarget(log)))
	if err != nil {
		return nil, err
	}
	records, err := devtools.New(fsys, project.Paths.DevToolsDir).List()
	if err != nil {
		return nil, err
	}
	for _, record := range records {
		if _, ok := record.Binaries["dotfiles"]; ok {
			return &record, nil
		}
	}
	return nil, nil
}

// A copied binary can be invoked directly from any working directory. Its
// validated active manifest identifies its store without requiring a config flag.
func selfDevelopmentExecutable(fsys fs.FS, executable string) (*devtools.Record, error) {
	buildDir := filepath.Dir(executable)
	if !strings.HasPrefix(filepath.Base(buildDir), "build-") {
		return nil, nil
	}
	toolDir := filepath.Dir(buildDir)
	record, err := devtools.New(fsys, filepath.Dir(toolDir)).Lookup(filepath.Base(toolDir))
	if err != nil || record == nil {
		return nil, err
	}
	for _, binary := range record.Binaries {
		// Existing shims may still invoke a previous immutable generation while
		// this tool has a newer active selection.
		if filepath.Base(binary) == filepath.Base(executable) {
			return record, nil
		}
	}
	return nil, nil
}

func init() {
	selfUpgradeCmd.Flags().Bool("check", false, "Check for available updates without applying")
	selfUpgradeCmd.Flags().BoolP("force", "f", false, "Force re-download and installation even if already up to date")
	selfUpgradeCmd.Flags().Bool("prerelease", false, "Include prerelease versions when checking for latest release")
}
