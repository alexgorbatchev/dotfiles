package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/spf13/cobra"
)

var whyCmd = &cobra.Command{
	Use:           "why <tool>",
	Short:         "Print full path to the .tool.ts file that installs a tool or binary",
	Args:          cobra.ExactArgs(1),
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		query := args[0]
		logLevel = "quiet"

		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return fmt.Errorf("bootstrap services: %w", err)
		}
		defer services.DB.Close()

		targetTool := config.FindTool(services.ToolConfigs, query)
		if targetTool == nil || targetTool.ConfigFilePath == "" {
			return fmt.Errorf("tool %q not found", query)
		}

		if exists, _ := fileExists(targetTool.ConfigFilePath); !exists {
			return fmt.Errorf("config file for %q does not exist: %s", query, targetTool.ConfigFilePath)
		}

		fmt.Fprintln(cmd.OutOrStdout(), targetTool.ConfigFilePath)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(whyCmd)
}
