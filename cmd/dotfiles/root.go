package main

import (
	"errors"
	"fmt"
	"io"

	hostarch "github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/spf13/cobra"
)

// ErrSilent indicates that an error has already been logged to the user with appropriate context.
var ErrSilent = errors.New("silent error already logged")

// platformTargets maps the canonical names utils.NormalizePlatform produces onto the
// GOOS names vm.Target and config.MatchesPlatform evaluate configuration against.
var platformTargets = map[string]string{
	"macos":   hostarch.OSDarwin,
	"linux":   hostarch.OSLinux,
	"windows": "windows",
}

// platformValue is the --platform flag. People spell platforms the way the authoring
// API does (Platform.MacOS, { os: "macos" }), while the loader works with GOOS names,
// so every spelling utils.NormalizePlatform knows is accepted and stored as the GOOS
// name. A value that normalises to nothing is rejected while the command line is
// parsed, instead of being accepted and then silently matching no .platform() block
// and no project-level override.
type platformValue struct {
	target *string
}

func (p platformValue) String() string { return *p.target }

func (p platformValue) Type() string { return "os" }

func (p platformValue) Set(value string) error {
	// The empty default means "evaluate against the host".
	if value == "" {
		*p.target = ""
		return nil
	}
	target, ok := platformTargets[utils.NormalizePlatform(value)]
	if !ok {
		return fmt.Errorf("unknown platform %q: accepted values are macos (or darwin), linux and windows", value)
	}
	*p.target = target
	return nil
}

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
	Use:           "dotfiles",
	Short:         "Dotfiles management and installation toolchain",
	Long:          `A high-performance dotfiles manager and installer compiled into a standalone Go binary.`,
	Version:       Version,
	SilenceUsage:  true,
	SilenceErrors: true,
}

func init() {
	rootCmd.SetVersionTemplate("{{.Version}}\n")
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "Path to configuration file")
	rootCmd.PersistentFlags().BoolVarP(&dryRun, "dry-run", "d", false, "Simulate operations without committing disk changes")
	rootCmd.PersistentFlags().BoolVar(&trace, "trace", false, "Enable source location tracing in logs")
	rootCmd.PersistentFlags().StringVar(&logLevel, "log", "default", "Log level (verbose, default, quiet)")
	rootCmd.PersistentFlags().Var(platformValue{&platform}, "platform", "Target platform (macos, linux, windows; darwin is accepted for macos)")
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
