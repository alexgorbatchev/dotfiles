package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/venv"
	"github.com/spf13/cobra"
)

var (
	envDeleteForce bool
)

// stdioIsTerminal reports whether in and out are both attached to an interactive
// terminal, which is what makes a prompt answerable. It is a variable because
// go test never runs on a terminal and the module carries no pty dependency, so
// tests replace it to drive the prompt path.
var stdioIsTerminal = func(in io.Reader, out io.Writer) bool {
	return cliout.IsTerminal(in) && cliout.IsTerminal(out)
}

// confirmEnvDeletion asks before removing envDir and reports whether to go
// ahead. The prompt is only shown where someone can answer it: stdin and stderr
// on an interactive terminal, outside agent mode. Anywhere else, pipes, CI, or
// AGENT=1, the command refuses instead of reading an answer from a non-terminal
// stream, and --force is the way to delete without a prompt.
func confirmEnvDeletion(cmd *cobra.Command, envDir string) (bool, error) {
	if cliout.IsAgentMode() || !stdioIsTerminal(cmd.InOrStdin(), cmd.ErrOrStderr()) {
		return false, fmt.Errorf("deleting the virtual environment at %s needs confirmation, but there is no interactive terminal to ask on; re-run with --force to delete without a prompt", envDir)
	}
	confirmed, err := cliout.Confirm(cmd.InOrStdin(), cmd.ErrOrStderr(), fmt.Sprintf("Delete environment at '%s'?", envDir))
	if err != nil {
		return false, fmt.Errorf("confirming deletion of %s: %w", envDir, err)
	}
	return confirmed, nil
}

var envCmd = &cobra.Command{
	Use:   "env",
	Args:  cobra.NoArgs,
	Short: "Outputs export strings for current shell settings or manages virtual environments",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		targetDir := services.ProjectConfig.Paths.TargetDir
		fmt.Fprintf(cmd.OutOrStdout(), "export PATH=\"%s:$PATH\"\n", targetDir)
		return nil
	},
}

var envCreateCmd = &cobra.Command{
	Use:   "create [name]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Create a new virtual environment",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("env", cmd.ErrOrStderr())
		log.Info("Creating virtual environment...")

		envName := venv.DefaultEnvName
		if len(args) > 0 {
			envName = args[0]
		}

		cwd, err := os.Getwd()
		if err != nil {
			return err
		}

		vManager := venv.NewManager(services.FS)
		info, err := vManager.Create(cwd, envName, false)
		if err != nil {
			return fmt.Errorf("failed to create virtual environment: %w", err)
		}

		log.Info(logger.Message(fmt.Sprintf("Created virtual environment at %s", info.EnvDir)))
		fmt.Fprintf(cmd.OutOrStdout(), "Virtual environment created at: %s\nTo activate, run:\n  source %s\n", info.EnvDir, info.SourcePath)
		return nil
	},
}

var envDeleteCmd = &cobra.Command{
	Use:   "delete [name]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Delete a virtual environment",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("env", cmd.ErrOrStderr())

		envName := venv.DefaultEnvName
		if len(args) > 0 {
			envName = args[0]
		}

		cwd, err := os.Getwd()
		if err != nil {
			return err
		}

		// Resolve the name to an absolute directory so the prompt and the messages
		// name exactly what is removed, whichever way the name was given.
		envDir := envName
		if !filepath.IsAbs(envDir) {
			envDir = filepath.Join(cwd, envDir)
		}

		vManager := venv.NewManager(services.FS)
		if valid, _ := vManager.IsValidEnv(envDir); !valid {
			return fmt.Errorf("virtual environment %q not found in %s", envName, cwd)
		}

		if !envDeleteForce {
			confirmed, err := confirmEnvDeletion(cmd, envDir)
			if err != nil {
				return err
			}
			if !confirmed {
				log.Info("Deletion cancelled")
				return nil
			}
		}

		log.Info("Deleting virtual environment...")
		if err := vManager.Delete(envDir); err != nil {
			return fmt.Errorf("failed to delete virtual environment: %w", err)
		}

		log.Info(logger.Message(fmt.Sprintf("Deleted virtual environment at %s", envDir)))
		fmt.Fprintf(cmd.OutOrStdout(), "Deleted virtual environment at %s\n", envDir)
		return nil
	},
}

func init() {
	envDeleteCmd.Flags().BoolVar(&envDeleteForce, "force", false, "Skip confirmation prompt")
	envCmd.AddCommand(envCreateCmd)
	envCmd.AddCommand(envDeleteCmd)
	rootCmd.AddCommand(envCmd)
}
