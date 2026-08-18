package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the dotfiles CLI version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Fprintf(cmd.OutOrStdout(), "dotfiles version %s\n", Version)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
