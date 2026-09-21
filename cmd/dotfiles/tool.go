package main

import "github.com/spf13/cobra"

var toolCmd = &cobra.Command{
	Use:   "tool",
	Short: "Managed tool configurations (.tool.ts) and packages",
}

func init() {
	toolCmd.AddCommand(toolListCmd)
	toolCmd.AddCommand(toolInfoCmd)
	toolCmd.AddCommand(toolWhichCmd)
	toolCmd.AddCommand(toolInstallCmd)
	toolCmd.AddCommand(toolUninstallCmd)
	toolCmd.AddCommand(toolUpdateCmd)
	toolCmd.AddCommand(toolCheckCmd)
	toolCmd.AddCommand(toolValidateCmd)
	toolCmd.AddCommand(toolFilesCmd)
	toolCmd.AddCommand(toolScaffoldCmd)
	rootCmd.AddCommand(toolCmd)
}
