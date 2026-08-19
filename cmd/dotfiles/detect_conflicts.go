package main

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/spf13/cobra"
)

var detectConflictsCmd = &cobra.Command{
	Use:   "detect-conflicts",
	Short: "Detects conflicts with existing non-generator files",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		log := GetLogger("detect-conflicts", cmd.ErrOrStderr())
		log.Info("Detecting file conflicts...")

		shimGen := shim.NewGenerator(services.FS)
		var conflictMessages []string

		for _, tool := range services.ToolConfigs {
			for _, binName := range installer.GetBinaryNames(tool.Name, tool.Binaries) {
				if binName == "" {
					continue
				}

				shimPath := filepath.Join(services.ProjectConfig.Paths.TargetDir, binName)
				exists, err := services.FS.Exists(shimPath)
				if err == nil && exists {
					isShim, err := shimGen.IsGeneratedShim(shimPath)
					if err == nil && !isShim {
						conflictMessages = append(conflictMessages, fmt.Sprintf("[%s]: %s (exists but is not a generator shim)", tool.Name, shimPath))
					}
				}
			}
		}

		if len(conflictMessages) > 0 {
			fmt.Fprintln(cmd.OutOrStdout(), "Conflicts detected with files not owned by the generator:")
			for _, msg := range conflictMessages {
				fmt.Fprintf(cmd.OutOrStdout(), "  - %s\n", msg)
			}
			return fmt.Errorf("conflicts detected with files not owned by the generator")
		}

		log.Info(logger.Messages.CommandCompleted(dryRun))
		fmt.Fprintln(cmd.OutOrStdout(), "No conflicts detected")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(detectConflictsCmd)
}
