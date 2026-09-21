package main

import "github.com/spf13/cobra"

var selfCmd = &cobra.Command{
	Use:   "self",
	Short: "Dotfiles CLI binary self-management",
}

func init() {
	selfCmd.AddCommand(selfVersionCmd)
	selfCmd.AddCommand(selfUpgradeCmd)
	rootCmd.AddCommand(selfCmd)
}
