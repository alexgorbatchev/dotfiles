package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var filesCmd = &cobra.Command{
	Use:   "files",
	Short: "Lists files and locations managed by dotfiles installer",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(cmd.OutOrStdout(), "No files currently managed")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(filesCmd)
}
