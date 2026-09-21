package main

import (
	"fmt"
	"io"

	"github.com/alexgorbatchev/dotfiles/pkg/cliout"
	"github.com/spf13/cobra"
)

var stdioIsTerminal = func(in io.Reader, out io.Writer) bool {
	return cliout.IsTerminal(in) && cliout.IsTerminal(out)
}

func confirmEnvDeletion(cmd *cobra.Command, envDir string) (bool, error) {
	if cliout.IsAgentMode() || !stdioIsTerminal(cmd.InOrStdin(), cmd.ErrOrStderr()) {
		return false, fmt.Errorf("deleting the virtual environment at %s needs confirmation, but there is no interactive terminal to ask on; re-run with --force to delete without a prompt", envDir)
	}
	confirmed, err := cliout.Confirm(cmd.InOrStdin(), cmd.ErrOrStderr(), fmt.Sprintf("Delete environment at '%s'?", envDir))
	if err != nil {
		return false, fmt.Errorf("confirming deletion of %s: %w", envDir, err)
	}
	return confirmed, nil
}

var venvCmd = &cobra.Command{
	Use:   "venv",
	Short: "Isolated dotfiles virtual environments",
}

func init() {
	venvCmd.AddCommand(venvCreateCmd)
	venvCmd.AddCommand(venvDeleteCmd)
	venvCmd.AddCommand(venvListCmd)
	rootCmd.AddCommand(venvCmd)
}
