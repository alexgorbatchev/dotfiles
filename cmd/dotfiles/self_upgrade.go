package main

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/updater"
	"github.com/spf13/cobra"
)

var selfUpgradeCmd = &cobra.Command{
	Use:   "upgrade [version]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Self-upgrade dotfiles CLI to latest or specified release",
	Long: `Checks for and downloads the latest release of the dotfiles executable from GitHub Releases, safely updating the running binary.

If a version is specified (e.g., "dotfiles self upgrade 2.0.1"), upgrades or downgrades to that exact release version.
Use --check to inspect available updates without downloading or modifying the executable.`,
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
		devProxy, err := startDevProxy(GetLogger("proxy", cmd.ErrOrStderr()))
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

			if res.HasUpdate {
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
			if res.HasUpdate {
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
		} else {
			toolLog.Info(logger.Message(fmt.Sprintf("Already up to date (%s)", res.CurrentVersion)))
			fmt.Fprintf(cmd.OutOrStdout(), "dotfiles is already up to date (%s)\n", res.CurrentVersion)
		}

		return nil
	},
}

func init() {
	selfUpgradeCmd.Flags().Bool("check", false, "Check for available updates without applying")
	selfUpgradeCmd.Flags().BoolP("force", "f", false, "Force re-download and installation even if already up to date")
	selfUpgradeCmd.Flags().Bool("prerelease", false, "Include prerelease versions when checking for latest release")
}
