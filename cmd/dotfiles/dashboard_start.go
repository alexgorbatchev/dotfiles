package main

import "github.com/spf13/cobra"

var dashboardStartCmd = &cobra.Command{
	Use:   "start",
	Args:  cobra.NoArgs,
	Short: "Start local HTTP dashboard server and print URL",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDashboard(cmd)
	},
}

func init() {
	dashboardStartCmd.Flags().StringVarP(&dashboardHost, "host", "H", "127.0.0.1", "Host address to bind the dashboard server to")
	dashboardStartCmd.Flags().IntVarP(&dashboardPort, "port", "p", 8080, "Port to run the dashboard server on")
}
