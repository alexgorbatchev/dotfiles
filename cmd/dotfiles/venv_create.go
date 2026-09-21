package main

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/venv"
	"github.com/spf13/cobra"
)

var venvCreateCmd = &cobra.Command{
	Use:   "create [name]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Create an isolated sandbox with scoped tools directory",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("venv", cmd.ErrOrStderr())
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
