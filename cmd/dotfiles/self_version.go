package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var selfVersionCmd = &cobra.Command{
	Use:   "version",
	Args:  cobra.NoArgs,
	Short: "Print version, commit hash, and build target info",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Fprintln(cmd.OutOrStdout(), Version)
	},
}
