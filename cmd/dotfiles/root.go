package main

import (
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"

	hostarch "github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
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

// libcTargets are the C libraries --libc accepts. They are the members of the authoring
// API's Libc enum, which are the values pkg/arch detection reports, so a configuration
// comparing systemInfo.libc against Libc.Musl sees a match for --libc musl. The flag's
// help text and its rejection message are both built from this list rather than
// restating it.
var libcTargets = []string{hostarch.LibcGnu, hostarch.LibcMusl, hostarch.LibcUnknown}

// libcValue is the --libc flag. Like --platform it is validated while the command line
// is parsed: a value naming no C library would otherwise be accepted and then leave the
// configuration evaluated against the host after all, which is indistinguishable from
// the flag working.
type libcValue struct {
	target *string
}

func (l libcValue) String() string { return *l.target }

func (l libcValue) Type() string { return "libc" }

func (l libcValue) Set(value string) error {
	// The empty default means "detect the host's".
	if value == "" {
		*l.target = ""
		return nil
	}
	target := strings.ToLower(strings.TrimSpace(value))
	if !slices.Contains(libcTargets, target) {
		return fmt.Errorf("unknown libc %q: accepted values are %s", value, strings.Join(libcTargets, ", "))
	}
	*l.target = target
	return nil
}

// resolveTarget builds the one target a run is carried out for: the --platform, --arch
// and --libc flags, each falling back to what the machine reports, resolved once so that
// configuration loading, asset selection and the systemInfo a hook sees cannot disagree.
//
// Every flag that overrode detection is reported, as v1 did
// (packages/cli/src/runtime/createBaseRuntimeContext.ts:50-58): a run resolved for
// another machine produces output that looks like this machine's and is not.
func resolveTarget(log *logger.Logger) vm.Target {
	resolved := vm.Target{OS: platform, Arch: arch, Libc: libc}.Resolve()

	if platform != "" {
		log.Warn(logger.Message("Platform overridden to: " + resolved.OS))
	}
	if arch != "" {
		log.Warn(logger.Message("Arch overridden to: " + resolved.Arch))
	}
	switch {
	case libc == "":
	case resolved.OS == hostarch.OSLinux:
		log.Warn(logger.Message("Libc overridden to: " + resolved.Libc))
	default:
		// Which C library is in use is a question only Linux answers, so the flag
		// selects nothing here. Dropping it without a word is how a run ends up
		// mixing targets unnoticed.
		log.Warn(logger.Message(fmt.Sprintf("Libc %s ignored: the %s target has no C library to select", libc, resolved.OS)))
	}

	return resolved
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
	rootCmd.PersistentFlags().Var(libcValue{&libc}, "libc", "Target C library ("+strings.Join(libcTargets, ", ")+")")
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
