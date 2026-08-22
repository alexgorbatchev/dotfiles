package main

import (
	"io"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/spf13/cobra"
)

var Version = "2.2.0"

var (
	cfgFile  string
	dryRun   bool
	trace    bool
	logLevel string
	platform string
	arch     string
	libc     string
	verbose  bool
	quiet    bool
)

var rootCmd = &cobra.Command{
	Use:          "dotfiles",
	Short:        "Dotfiles management and installation toolchain",
	Long:         `A high-performance dotfiles manager and installer compiled into a standalone Go binary.`,
	Version:      Version,
	SilenceUsage: true,
}

func init() {
	rootCmd.SetVersionTemplate("{{.Version}}\n")
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "Path to configuration file")
	rootCmd.PersistentFlags().BoolVarP(&dryRun, "dry-run", "d", false, "Simulate operations without committing disk changes")
	rootCmd.PersistentFlags().BoolVar(&trace, "trace", false, "Enable source location tracing in logs")
	rootCmd.PersistentFlags().StringVar(&logLevel, "log", "default", "Log level (verbose, default, quiet)")
	rootCmd.PersistentFlags().StringVar(&platform, "platform", "", "Target platform (e.g., darwin, linux)")
	rootCmd.PersistentFlags().StringVar(&arch, "arch", "", "Target architecture (e.g., amd64, arm64)")
	rootCmd.PersistentFlags().StringVar(&libc, "libc", "", "Target libc implementation (e.g., glibc, musl)")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose logging")
	rootCmd.PersistentFlags().BoolVarP(&quiet, "quiet", "q", false, "Enable quiet logging")
}

// GetLogger returns a new Logger instance configured by global flags and writing to the specified writer.
func GetLogger(name string, w io.Writer) *logger.Logger {
	levelStr := logLevel
	if verbose {
		levelStr = "verbose"
	} else if quiet {
		levelStr = "quiet"
	}
	lvl, err := logger.ParseLogLevel(levelStr)
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
