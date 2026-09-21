package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/venv"
	"github.com/spf13/cobra"
)

var venvDeleteForce bool

var venvDeleteCmd = &cobra.Command{
	Use:   "delete [name]",
	Args:  cobra.MaximumNArgs(1),
	Short: "Remove an existing virtual environment",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.Close()

		log := GetLogger("venv", cmd.ErrOrStderr())

		envName := venv.DefaultEnvName
		if len(args) > 0 {
			envName = args[0]
		}

		cwd, err := os.Getwd()
		if err != nil {
			return err
		}

		envDir := envName
		if !filepath.IsAbs(envDir) {
			envDir = filepath.Join(cwd, envDir)
		}

		vManager := venv.NewManager(services.FS)
		if valid, _ := vManager.IsValidEnv(envDir); !valid {
			return fmt.Errorf("virtual environment %q not found in %s", envName, cwd)
		}

		if !venvDeleteForce {
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
	venvDeleteCmd.Flags().BoolVar(&venvDeleteForce, "force", false, "Skip confirmation prompt")
}
