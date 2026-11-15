package main

import (
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
		return services.Orchestrator.CleanupOrphanedTools(ctx, services.ToolConfigs, services.ProjectConfig)
	},
}
