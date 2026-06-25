package main

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var updateCmd = &cobra.Command{
	Use:   "update [tool]",
	Short: "Evaluates versions and installs newer software packages if available",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
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
				if err != nil {
					continue // skip uninstalled
				}

				inst, err := installer.Get(targetTool.InstallationMethod)
				if err != nil {
					continue
				}

				toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
				switch instInstance := inst.(type) {
				case *installer.GitHubInstaller:
					instInstance.BinDir = toolDestDir
					if services.ProjectConfig.Github.Host != "" {
						instInstance.BaseURL = services.ProjectConfig.Github.Host
					}
				}

				res, err := inst.CheckUpdate(ctx, targetTool)
				if err == nil && installed != nil && res != nil && res.LatestVersion != "" && res.LatestVersion != installed.Version {
					log.Info(logger.Message(fmt.Sprintf("New version available for %s: %s (currently installed: %s)", targetTool.Name, res.LatestVersion, installed.Version)))
				}
			}
			log.Info(logger.Messages.CommandCompleted(dryRun))
			return nil
		}

		toolName := args[0]

		// 1. Find tool config
		var targetTool *config.ToolConfig
		for _, tc := range services.ToolConfigs {
			if tc.Name == toolName {
				targetTool = tc
				break
			}
		}

		if targetTool == nil {
			return fmt.Errorf("tool %q not found in configuration", toolName)
		}

		// 2. Check if installed in DB
		installed, err := services.Registry.GetToolInstallation(ctx, targetTool.Name)
		if err != nil {
			return fmt.Errorf("tool %q is not installed (no database record found): %w", toolName, err)
		}

		// 3. Get the installer
		inst, err := installer.Get(targetTool.InstallationMethod)
		if err != nil {
			return fmt.Errorf("getting installer for %q: %w", targetTool.Name, err)
		}

		// Configure BinDir and BaseURL if supported (just like in InstallTool!)
		toolDestDir := filepath.Join(services.ProjectConfig.Paths.BinariesDir, targetTool.Name, "current")
		switch instInstance := inst.(type) {
		case *installer.GitHubInstaller:
			instInstance.BinDir = toolDestDir
			if services.ProjectConfig.Github.Host != "" {
				instInstance.BaseURL = services.ProjectConfig.Github.Host
			}
		}

		// 4. Check for update
		res, err := inst.CheckUpdate(ctx, targetTool)
		if err != nil {
			return fmt.Errorf("checking update for %q: %w", targetTool.Name, err)
		}

		if res != nil && res.LatestVersion != "" && res.LatestVersion != installed.Version {
			log.Info(logger.Message(fmt.Sprintf("New version available for %s: %s (currently installed: %s)", targetTool.Name, res.LatestVersion, installed.Version)))

			// Update the target tool's version pointer to the new version and run installation
			targetTool.Version = &res.LatestVersion
			err = services.Orchestrator.InstallTool(ctx, targetTool, services.ProjectConfig)
			if err != nil {
				return fmt.Errorf("updating tool %q to version %s failed: %w", targetTool.Name, res.LatestVersion, err)
			}
			log.Info(logger.Message(fmt.Sprintf("Tool %q successfully updated to version %s", targetTool.Name, res.LatestVersion)))
		} else {
			log.Info(logger.Message(fmt.Sprintf("Tool %q is already up to date (%s)", targetTool.Name, installed.Version)))
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(updateCmd)
}
