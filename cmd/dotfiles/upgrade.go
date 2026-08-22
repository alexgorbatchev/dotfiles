package main

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/updater"
	"github.com/spf13/cobra"
)

var upgradeCmd = &cobra.Command{
	Use:   "upgrade [version]",
	Short: "Upgrade dotfiles CLI binary to the latest or specified version",
	Long: `Checks for and downloads the latest release of the dotfiles executable from GitHub Releases, safely updating the running binary.

If a version is specified (e.g., "dotfiles upgrade 2.0.1"), upgrades or downgrades to that exact release version.
Use --check to inspect available updates without downloading or modifying the executable.`,
	Example: `  # Upgrade to latest stable release
  dotfiles upgrade

  # Check if an update is available without installing
  dotfiles upgrade --check

  # Upgrade to a specific version
  dotfiles upgrade 2.0.1

  # Force re-download and re-install
  dotfiles upgrade --force`,
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

		u := updater.New(updater.Config{
			BaseURL: baseURL,
		})

		opts := updater.Options{
			CurrentVersion:  Version,
			TargetVersion:   targetVersion,
			AllowPrerelease: prerelease,
			Force:           force,
			DryRun:          dryRun,
		}

		if check {
			log.Info("Checking for dotfiles CLI updates...")
			res, err := u.CheckForUpdate(ctx, opts)
			if err != nil {
				return fmt.Errorf("checking for update: %w", err)
			}

			if res.HasUpdate {
				log.Info(logger.Message(fmt.Sprintf("New dotfiles version available: %s -> %s", res.CurrentVersion, res.LatestVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "New version available: %s -> %s\n", res.CurrentVersion, res.LatestVersion)
			} else {
				log.Info(logger.Message(fmt.Sprintf("dotfiles is up to date (%s)", res.CurrentVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "dotfiles is up to date (%s)\n", res.CurrentVersion)
			}
			return nil
		}

		log.Info("Evaluating dotfiles CLI upgrade...")
		res, err := u.Upgrade(ctx, opts)
		if err != nil {
			return fmt.Errorf("upgrading dotfiles: %w", err)
		}

		if dryRun {
			if res.HasUpdate {
				log.Info(logger.Message(fmt.Sprintf("[dry-run] Would upgrade dotfiles from %s to %s", res.CurrentVersion, res.LatestVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "[dry-run] Would upgrade dotfiles: %s -> %s\n", res.CurrentVersion, res.LatestVersion)
			} else {
				log.Info(logger.Message(fmt.Sprintf("[dry-run] dotfiles is up to date (%s)", res.CurrentVersion)))
				fmt.Fprintf(cmd.OutOrStdout(), "[dry-run] dotfiles is up to date (%s)\n", res.CurrentVersion)
			}
			return nil
		}

		if res.Updated {
			log.Info(logger.Message(fmt.Sprintf("Successfully upgraded dotfiles from %s to %s", res.CurrentVersion, res.LatestVersion)))
			fmt.Fprintf(cmd.OutOrStdout(), "Successfully upgraded dotfiles: %s -> %s\n", res.CurrentVersion, res.LatestVersion)
		} else {
			log.Info(logger.Message(fmt.Sprintf("dotfiles is already up to date (%s)", res.CurrentVersion)))
			fmt.Fprintf(cmd.OutOrStdout(), "dotfiles is already up to date (%s)\n", res.CurrentVersion)
		}

		return nil
	},
}

func init() {
	upgradeCmd.Flags().Bool("check", false, "Check for available updates without applying")
	upgradeCmd.Flags().BoolP("force", "f", false, "Force re-download and installation even if already up to date")
	upgradeCmd.Flags().Bool("prerelease", false, "Include prerelease versions when checking for latest release")

	rootCmd.AddCommand(upgradeCmd)
}
