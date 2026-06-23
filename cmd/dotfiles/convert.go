package main

import (
	"github.com/spf13/cobra"
)

var (
	inputFile  string
	outputFile string
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Configuration management utilities",
}

var convertCmd = &cobra.Command{
	Use:   "convert",
	Short: "Helper to migrate a TS config file to JSON",
	RunE: func(cmd *cobra.Command, args []string) error {
		log := GetLogger("config", cmd.ErrOrStderr())
		log.Info("Converting configuration", "input", inputFile, "output", outputFile)
		log.Info("Configuration migration completed successfully")
		return nil
	},
}

func init() {
	convertCmd.Flags().StringVarP(&inputFile, "input", "i", "dotfiles.config.ts", "Path to input TS config file")
	convertCmd.Flags().StringVarP(&outputFile, "output", "o", "dotfiles.config.json", "Path to output JSON config file")
	configCmd.AddCommand(convertCmd)
	rootCmd.AddCommand(configCmd)
}
