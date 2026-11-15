package main

import (
	"strings"
	"testing"
)

// TestPositionalArgumentValidation covers the Args validator of every subcommand.
// Cobra validates positional arguments before RunE, so a rejected command line
// never reaches BootstrapServices and no configuration file is needed.
func TestPositionalArgumentValidation(t *testing.T) {
	const atMostOne = "accepts at most 1 arg(s), received 2"

	tests := []struct {
		name    string
		args    []string
		wantErr string
	}{
		{"tool which requires a tool", []string{"tool", "which"}, "accepts 1 arg(s), received 0"},
		{"tool which rejects a second tool", []string{"tool", "which", "bat", "fd"}, "accepts 1 arg(s), received 2"},
		{"tool info requires a tool", []string{"tool", "info"}, "accepts 1 arg(s), received 0"},
		{"tool info rejects a second tool", []string{"tool", "info", "bat", "fd"}, "accepts 1 arg(s), received 2"},
		{"state log rejects a second tool", []string{"state", "log", "bat", "fd"}, atMostOne},
		{"tool files rejects a second tool", []string{"tool", "files", "bat", "fd"}, atMostOne},
		{"tool validate rejects a second tool", []string{"tool", "validate", "bat", "fd"}, atMostOne},
		{"path rejects a second name", []string{"path", "bat", "fd"}, atMostOne},
		{"self upgrade rejects a second version", []string{"self", "upgrade", "1.0.0", "2.0.0"}, atMostOne},
		{"skill copy requires a path", []string{"skill", "copy"}, "accepts 1 arg(s), received 0"},
		{"skill copy rejects a second path", []string{"skill", "copy", "a", "b"}, "accepts 1 arg(s), received 2"},
		{"venv create rejects a second name", []string{"venv", "create", "a", "b"}, atMostOne},
		{"venv delete rejects a second name", []string{"venv", "delete", "a", "b"}, atMostOne},
		{"state generate takes no arguments", []string{"state", "generate", "bat"}, `unknown command "bat" for "dotfiles state generate"`},
		{"state pull takes no arguments", []string{"state", "pull", "bat"}, `unknown command "bat" for "dotfiles state pull"`},
		{"pull takes no arguments", []string{"pull", "bat"}, `unknown command "bat" for "dotfiles pull"`},
		{"state cleanup takes no arguments", []string{"state", "cleanup", "bat"}, `unknown command "bat" for "dotfiles state cleanup"`},
		{"self version takes no arguments", []string{"self", "version", "bat"}, `unknown command "bat" for "dotfiles self version"`},
		{"version takes no arguments", []string{"version", "bat"}, `unknown command "bat" for "dotfiles version"`},
		{"shell audit takes no arguments", []string{"shell", "audit", "bat"}, `unknown command "bat" for "dotfiles shell audit"`},
		{"venv list takes no arguments", []string{"venv", "list", "bat"}, `unknown command "bat" for "dotfiles venv list"`},
		{"path list takes no arguments", []string{"path", "list", "bat"}, `unknown command "bat" for "dotfiles path list"`},
		{"tool list takes no arguments", []string{"tool", "list", "bat"}, `unknown command "bat" for "dotfiles tool list"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCommand(tt.args...)
			if err == nil {
				t.Fatalf("%v: expected an argument error", tt.args)
			}
			if err.Error() != tt.wantErr {
				t.Fatalf("%v: error = %q, want %q", tt.args, err.Error(), tt.wantErr)
			}
		})
	}
}

func TestSubcommandArgConsistency(t *testing.T) {
	if stateDiffCmd.Use != "diff [tool]" {
		t.Errorf("stateDiffCmd.Use = %q, want %q", stateDiffCmd.Use, "diff [tool]")
	}
	if toolFilesCmd.Use != "files [tool]" {
		t.Errorf("toolFilesCmd.Use = %q, want %q", toolFilesCmd.Use, "files [tool]")
	}
	for _, cmd := range rootCmd.Commands() {
		if strings.Contains(cmd.Use, "toolName") {
			t.Errorf("command %q has inconsistent argument name %q (must use 'tool' instead of 'toolName')", cmd.Name(), cmd.Use)
		}
	}
}
