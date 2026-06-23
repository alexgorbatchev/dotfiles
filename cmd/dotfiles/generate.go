package main

import (
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var generateCmd = &cobra.Command{
	Use:   "generate",
	Short: "Orchestrates shim and symlink generation",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("generate", cmd.ErrOrStderr())
		log.Info("Starting generation...")

		// Execute installation of all tool configurations through the Orchestrator
		err = services.Orchestrator.InstallTools(ctx, services.ToolConfigs, services.ProjectConfig)
		if err != nil {
			return err
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(generateCmd)
}
