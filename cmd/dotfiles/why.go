package main

import (
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/spf13/cobra"
)

var whyCmd = &cobra.Command{
	Use:           "why <tool>",
	Short:         "Print full path to the .tool.ts file that installs a tool or binary",
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 {
			if isDevTest() {
				return fmt.Errorf("tool argument required")
			}
			os.Exit(1)
		}

		query := args[0]
		logLevel = "quiet"

		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			if isDevTest() {
				return err
			}
			os.Exit(1)
		}
		defer services.DB.Close()

		targetTool := config.FindTool(services.ToolConfigs, query)
		if targetTool == nil || targetTool.ConfigFilePath == "" {
			if isDevTest() {
				return fmt.Errorf("tool %q not found", query)
			}
			os.Exit(1)
		}

		if exists, _ := fileExists(targetTool.ConfigFilePath); !exists {
			if isDevTest() {
				return fmt.Errorf("config file for %q does not exist: %s", query, targetTool.ConfigFilePath)
			}
			os.Exit(1)
		}

		fmt.Fprintln(cmd.OutOrStdout(), targetTool.ConfigFilePath)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(whyCmd)
}
