package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var envCmd = &cobra.Command{
	Use:   "env",
	Short: "Outputs export strings for current shell settings",
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

func init() {
	rootCmd.AddCommand(envCmd)
}
