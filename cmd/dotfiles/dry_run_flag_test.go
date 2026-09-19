package main

import (
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/spf13/cobra"
)

// TestDryRunFlagReachesContext pins the wiring between the --dry-run flag and the
// context every pipeline reads it from. The flag used to be recovered by scanning
// os.Args, so it was invisible to anything that drives rootCmd in-process: under
// `go test` the arguments belong to the test binary, and a "--dry-run install"
// performed a real installation.
func TestDryRunFlagReachesContext(t *testing.T) {
	t.Setenv("DOTFILES_DRY_RUN", "")

	var seen bool
	probeCmd := &cobra.Command{
		Use:    "dry-run-probe",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			seen = config.IsDryRunEnabled(cmd.Context())
			return nil
		},
	}
	rootCmd.AddCommand(probeCmd)
	defer rootCmd.RemoveCommand(probeCmd)

	tests := []struct {
		name string
		args []string
		want bool
	}{
		{name: "long flag", args: []string{"--dry-run", "dry-run-probe"}, want: true},
		{name: "short flag", args: []string{"-d", "dry-run-probe"}, want: true},
		{name: "flag after subcommand", args: []string{"dry-run-probe", "--dry-run"}, want: true},
		{name: "flag absent", args: []string{"dry-run-probe"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seen = false
			if _, err := executeCommand(tt.args...); err != nil {
				t.Fatalf("executeCommand(%v) returned error: %v", tt.args, err)
			}
			if seen != tt.want {
				t.Errorf("IsDryRunEnabled(cmd.Context()) = %v, want %v", seen, tt.want)
			}
		})
	}
}
