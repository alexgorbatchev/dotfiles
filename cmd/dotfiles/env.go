package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var envCmd = &cobra.Command{
	Use:   "env",
	Short: "Outputs export strings for current shell settings",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Fprintln(cmd.OutOrStdout(), "export PATH=\"$HOME/.bin:$PATH\"")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(envCmd)
}
