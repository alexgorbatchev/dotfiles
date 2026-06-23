package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/alexgorbatchev/dotfiles/pkg/dashboard"
	"github.com/spf13/cobra"
)

var port int

var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Starts local HTTP web server and outputs the URL",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("dashboard", cmd.ErrOrStderr())
		server := dashboard.NewServer(log, port)
		if err := server.Start(); err != nil {
			return err
		}

		fmt.Fprintf(cmd.OutOrStdout(), "Dashboard available at: http://127.0.0.1:%d\n", server.Port())
		fmt.Fprintln(cmd.OutOrStdout(), "Press Ctrl+C to stop the dashboard server")

		// Graceful shutdown on signal
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		log.Info("Shutting down dashboard server")
		return server.Stop()
	},
}

func init() {
	dashboardCmd.Flags().IntVarP(&port, "port", "p", 8080, "Port to run the dashboard server on")
	rootCmd.AddCommand(dashboardCmd)
}
