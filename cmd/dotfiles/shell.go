package main

import "github.com/spf13/cobra"

var shellCmd = &cobra.Command{
	Use:   "shell",
	Short: "Interactive shell hooks, exports and collision audits",
}

func init() {
	shellCmd.AddCommand(shellInitCmd)
	shellCmd.AddCommand(shellAuditCmd)
	rootCmd.AddCommand(shellCmd)
}
