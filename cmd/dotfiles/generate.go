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

		// Execute standalone generation of all tool configurations through the Orchestrator
		err = services.Orchestrator.GenerateTools(ctx, services.ToolConfigs, services.ProjectConfig)
		if err != nil {
			return err
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

var overwrite bool

func init() {
	generateCmd.Flags().BoolVar(&overwrite, "overwrite", false, "Overwrite conflicting files that were not created by the generator")
	rootCmd.AddCommand(generateCmd)
}
