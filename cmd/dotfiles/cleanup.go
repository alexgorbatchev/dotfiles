package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var cleanupCmd = &cobra.Command{
	Use:   "cleanup",
	Short: "Triggers standalone cleanup of orphaned tools and stale artifacts",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("cleanup", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)

		log.Info("Starting cleanup of orphaned tools and stale artifacts...")

		// Query database for all recorded tool installations
		installedTools, err := services.Registry.GetAllToolInstallations(ctx)
		if err != nil {
			log.Warn(logger.Message(fmt.Sprintf("Failed querying installed tools: %v", err)))
		} else {
			// Build map of configured tool names
			activeMap := make(map[string]bool)
			for _, tc := range services.ToolConfigs {
				if !tc.Disabled {
					activeMap[tc.Name] = true
				}
			}

			// Identify orphaned installed tools
			for _, instTool := range installedTools {
				if !activeMap[instTool.ToolName] {
					log.Info(logger.Message(fmt.Sprintf("Removing orphaned tool: %s", instTool.ToolName)))
					err := services.Orchestrator.UninstallTool(ctx, &config.ToolConfig{
						Name: instTool.ToolName,
					}, services.ProjectConfig)
					if err != nil {
						log.Warn(logger.Message(fmt.Sprintf("Failed uninstalling orphaned tool %s: %v", instTool.ToolName, err)))
					}
				}
			}
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(cleanupCmd)
}
