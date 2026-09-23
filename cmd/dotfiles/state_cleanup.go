package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var stateCleanupCmd = &cobra.Command{
	Use:   "cleanup",
	Args:  cobra.NoArgs,
	Short: "Standalone cleanup of orphaned tools and stale artifacts",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("cleanup", cmd.ErrOrStderr())
		services.Orchestrator.SetLogger(log)

		log.Info("Starting cleanup of orphaned tools and stale artifacts...")

		// Query database for all recorded tool installations
		installedTools, err := services.Registry.GetAllToolInstallations(ctx)
		if err != nil {
			log.Error(logger.Message(fmt.Sprintf("Failed querying installed tools: %v", err)))
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
					log.WithTag(instTool.ToolName).Info(logger.Message("Removing orphaned tool..."))
					err := services.Orchestrator.UninstallTool(ctx, &config.ToolConfig{
						Name: instTool.ToolName,
					}, services.ProjectConfig)
					if err != nil {
						log.WithTag(instTool.ToolName).Error(logger.Message(fmt.Sprintf("Failed uninstalling orphaned tool: %v", err)))
					}
				}
			}
		}

		return nil
	},
}
