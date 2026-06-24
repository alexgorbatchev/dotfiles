package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
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

		shimGen := shim.NewGenerator(services.FS)
		var conflictMessages []string

		for _, tool := range services.ToolConfigs {
			for _, b := range tool.Binaries {
				var binName string
				switch val := b.(type) {
				case string:
					binName = val
				case map[string]interface{}:
					if name, ok := val["name"].(string); ok {
						binName = name
					}
				case config.BinaryConfig:
					binName = val.Name
				case *config.BinaryConfig:
					if val != nil {
						binName = val.Name
					}
				}

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
			os.Exit(1)
		}

		fmt.Fprintln(cmd.OutOrStdout(), "No conflicts detected")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(detectConflictsCmd)
}
