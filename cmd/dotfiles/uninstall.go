package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var uninstallCmd = &cobra.Command{
	Use:   "uninstall [tool]",
	Short: "Uninstalls a specific tool and cleans up matching shims/symlinks",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("uninstall", cmd.ErrOrStderr())
		if len(args) > 0 {
			tool := args[0]
			log.Info(logger.Message(fmt.Sprintf("Uninstalling tool: %s", tool)))
		} else {
			log.Info("Uninstalling all configured tools")
		}
		log.Info(logger.Messages.CommandCompleted(dryRun))
		return nil
	},
}

func init() {
	rootCmd.AddCommand(uninstallCmd)
}
