package main

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestMainHelp(t *testing.T) {
	oldArgs := os.Args
	defer func() { os.Args = oldArgs }()

	os.Args = []string{"dotfiles", "--help"}
	rootCmd.SetArgs([]string{"--help"})
	err := runMain()
	if err != nil {
		t.Fatalf("runMain failed: %v", err)
	}
	main()
}

func TestMainErrorLogging(t *testing.T) {
	oldArgs := os.Args
	oldExit := exitFunc
	defer func() {
		os.Args = oldArgs
		exitFunc = oldExit
	}()

	var exitCode int
	exitFunc = func(code int) {
		exitCode = code
	}

	var errBuf bytes.Buffer
	rootCmd.SetErr(&errBuf)
	rootCmd.SetOut(&errBuf)
	rootCmd.SetArgs([]string{"nonexistent-command-xyz"})
	os.Args = []string{"dotfiles", "nonexistent-command-xyz"}

	main()

	if exitCode != 1 {
		t.Errorf("expected exit code 1, got %d", exitCode)
	}

	output := errBuf.String()
	if !strings.Contains(output, "ERROR") {
		t.Errorf("expected structured logger ERROR prefix in stderr, got: %q", output)
	}
	if strings.Contains(output, "Error: unknown command") {
		t.Errorf("expected Cobra default 'Error: unknown command' to be silenced, got: %q", output)
	}
	// Verify it does not duplicate the error
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) != 1 {
		t.Errorf("expected exactly 1 error line from structured logger, got %d lines: %q", len(lines), output)
	}
}
