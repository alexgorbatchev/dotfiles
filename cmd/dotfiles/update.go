package main

import (
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Evaluates versions and installs newer software packages if available",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("update", cmd.ErrOrStderr())
		log.Info("Evaluating versions and checking for updates...")
		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(updateCmd)
}
