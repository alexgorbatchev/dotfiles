package main

import "github.com/spf13/cobra"

var stateCmd = &cobra.Command{
	Use:   "state",
	Short: "System state, drift detection, and orchestration",
}

func init() {
	stateCmd.AddCommand(stateGenerateCmd)
	stateCmd.AddCommand(stateDiffCmd)
	stateCmd.AddCommand(stateCleanupCmd)
	stateCmd.AddCommand(stateLogCmd)
	rootCmd.AddCommand(stateCmd)
}
