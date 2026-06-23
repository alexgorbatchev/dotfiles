package main

import (
	"io"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var (
	cfgFile  string
	dryRun   bool
	trace    bool
	logLevel string
)

var rootCmd = &cobra.Command{
	Use:   "dotfiles",
	Short: "Dotfiles management and installation toolchain",
	Long:  `A high-performance dotfiles manager and installer compiled into a standalone Go binary.`,
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "Path to configuration file")
	rootCmd.PersistentFlags().BoolVarP(&dryRun, "dry-run", "d", false, "Simulate operations without committing disk changes")
	rootCmd.PersistentFlags().BoolVar(&trace, "trace", false, "Enable source location tracing in logs")
	rootCmd.PersistentFlags().StringVar(&logLevel, "log", "default", "Log level (verbose, default, quiet)")
}

// GetLogger returns a new Logger instance configured by global flags and writing to the specified writer.
func GetLogger(name string, w io.Writer) *logger.Logger {
	lvl, err := logger.ParseLogLevel(logLevel)
	if err != nil {
		lvl = logger.LogLevelDefault
	}
	return logger.New(logger.Config{
		Name:   name,
		Level:  lvl,
		Trace:  trace,
		Writer: w,
	})
}

// Execute parses command-line flags and runs the appropriate subcommand.
func Execute() error {
	return rootCmd.Execute()
}
