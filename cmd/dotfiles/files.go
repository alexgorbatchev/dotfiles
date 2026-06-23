package main

import (
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/spf13/cobra"
)

var filesCmd = &cobra.Command{
	Use:   "files",
	Short: "Lists files and locations managed by dotfiles installer",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		services, err := BootstrapServices(ctx, cfgFile)
		if err != nil {
			return err
		}
		defer services.DB.Close()

		ops, err := services.Registry.GetFileOperations(ctx, registry.FileOperationFilter{})
		if err != nil {
			return err
		}

		if len(ops) == 0 {
			fmt.Fprintln(cmd.OutOrStdout(), "No files currently managed")
			return nil
		}

		for _, op := range ops {
			fmt.Fprintf(cmd.OutOrStdout(), "- %s (%s): %s\n", op.ToolName, op.FileType, op.FilePath)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(filesCmd)
}
