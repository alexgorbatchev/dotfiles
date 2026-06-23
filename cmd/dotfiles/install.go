package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var installCmd = &cobra.Command{
	Use:   "install [tool]",
	Short: "Installs either a single specified tool or all tools defined in the configuration",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("install", cmd.ErrOrStderr())
		if len(args) > 0 {
			tool := args[0]
			log.Info(logger.Message(fmt.Sprintf("Installing tool: %s", tool)))
		} else {
			log.Info("Installing all configured tools")
		}
		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(installCmd)
}
