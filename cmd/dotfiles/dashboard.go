package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/alexgorbatchev/dotfiles/pkg/dashboard"
	"github.com/spf13/cobra"
)

var (
	dashboardHost string
	dashboardPort int
)

func runDashboard(cmd *cobra.Command) error {
	ctx := cmd.Context()
	services, err := BootstrapServices(ctx, cfgFile)
	if err != nil {
		return err
	}
	defer services.Close()

	log := GetLogger("dashboard", cmd.ErrOrStderr())
	log.Info("Starting dashboard server...")
	server := dashboard.NewServer(log, dashboardHost, dashboardPort, services.Registry, services.FS, services.ConfigPath, services.ProjectConfig, services.ToolConfigs, services.Orchestrator)
	if services.HTTPClient != nil {
		server.SetHTTPClient(services.HTTPClient)
	}
	if err := server.Start(); err != nil {
		return err
	}

	fmt.Fprintf(cmd.OutOrStdout(), "Dashboard available at: http://%s:%d\n", server.Host(), server.Port())
	fmt.Fprintln(cmd.OutOrStdout(), "Press Ctrl+C to stop the dashboard server")

	// Graceful shutdown on signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Info("Shutting down dashboard server")
	return server.Stop()
}

var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Args:  cobra.NoArgs,
	Short: "Local web dashboard UI",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDashboard(cmd)
	},
}

func init() {
	dashboardCmd.Flags().StringVarP(&dashboardHost, "host", "H", "127.0.0.1", "Host address to bind the dashboard server to")
	dashboardCmd.Flags().IntVarP(&dashboardPort, "port", "p", 8080, "Port to run the dashboard server on")
	dashboardCmd.AddCommand(dashboardStartCmd)
	rootCmd.AddCommand(dashboardCmd)
}
