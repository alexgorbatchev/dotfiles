package main

import "github.com/spf13/cobra"

var rootGenerateCmd = &cobra.Command{
	Use:     "generate",
	Aliases: []string{"g"},
	Short:   "Compile and link shims, symlinks, blocks, and templates (shortcut for state generate)",
	Args:    cobra.NoArgs,
	Hidden:  true,
	RunE:    stateGenerateCmd.RunE,
}

var rootInstallCmd = &cobra.Command{
	Use:               "install [tool...]",
	Aliases:           []string{"i"},
	Short:             "Install one or all configured tools (shortcut for tool install)",
	Args:              cobra.ArbitraryArgs,
	ValidArgsFunction: completeToolNames,
	Hidden:            true,
	RunE:              toolInstallCmd.RunE,
}

var rootUpdateCmd = &cobra.Command{
	Use:               "update [tool...]",
	Aliases:           []string{"u"},
	Short:             "Upgrade tools to their latest available release (shortcut for tool update)",
	Args:              cobra.ArbitraryArgs,
	ValidArgsFunction: completeToolNames,
	Hidden:            true,
	RunE:              toolUpdateCmd.RunE,
}

var rootVersionCmd = &cobra.Command{
	Use:    "version",
	Short:  "Print the dotfiles CLI version (shortcut for self version)",
	Args:   cobra.NoArgs,
	Hidden: true,
	Run:    selfVersionCmd.Run,
}

func init() {
	rootGenerateCmd.Flags().BoolVar(&overwrite, "overwrite", false, "Overwrite conflicting files that were not created by the generator")

	rootInstallCmd.Flags().Bool("shim-mode", false, "Quiet installation mode for shims")
	rootInstallCmd.Flags().BoolP("force", "f", false, "Force installation even if already installed")

	rootUpdateCmd.Flags().Bool("shim-mode", false, "Used by shims running @update: report the outcome without progress output")
	rootUpdateCmd.Flags().BoolP("force", "f", false, "Force re-download and re-installation even if already up to date")

	rootCmd.AddCommand(rootGenerateCmd)
	rootCmd.AddCommand(rootInstallCmd)
	rootCmd.AddCommand(rootUpdateCmd)
	rootCmd.AddCommand(rootVersionCmd)
}
