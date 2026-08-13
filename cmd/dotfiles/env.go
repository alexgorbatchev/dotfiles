package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/venv"
	"github.com/spf13/cobra"
)

var (
	envDeleteForce bool
)

var envCmd = &cobra.Command{
	Use:   "env",
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
	Short: "Create a new virtual environment",
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

		vManager := venv.NewManager(services.FS)
		envDir := filepath.Join(cwd, envName)
		if valid, _ := vManager.IsValidEnv(envName); valid {
			envDir = envName
		} else if valid, _ := vManager.IsValidEnv(envDir); !valid {
			return fmt.Errorf("virtual environment %q not found in %s", envName, cwd)
		}

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
