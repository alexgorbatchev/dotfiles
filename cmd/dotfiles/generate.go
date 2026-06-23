package main

import (
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var generateCmd = &cobra.Command{
	Use:   "generate",
	Short: "Orchestrates shim and symlink generation",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("generate", cmd.ErrOrStderr())
		log.Info("Starting generation...")
		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(generateCmd)
}
