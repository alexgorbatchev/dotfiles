package main

import "github.com/spf13/cobra"

var skillCopyCmd = &cobra.Command{
	Use:   "copy <path>",
	Args:  cobra.ExactArgs(1),
	Short: "Copy the bundled dotfiles skill to a target directory",
	RunE: func(cmd *cobra.Command, args []string) error {
		return copySkillToPath(cmd, args[0])
	},
}
