package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EDryRunSandboxing(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	// Initialize the test harness. Since we want to verify in-memory sandboxing,
	// we specifically set "DOTFILES_E2E_TEST" env var to "false" so that the binary
	// boots with MemFS and :memory: database instead of physical ones!
	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_TEST": "false",
		},
	})
	h.MockServerURL = ms.Server.URL

	// Copy the "main" fixture files to the sandbox TempDir
	h.CopyFixture("main")

	// Run generate command with dry-run
	stdout, stderr, exitCode, err := h.Generate("-d")
	if err != nil {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if exitCode != 0 {
		t.Fatalf("generate returned exit code %d, stdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// 1. Verify that output indicates successful tracking and dry-run execution
	output := stdout + stderr
	if !strings.Contains(output, "Command completed successfully (dry-run)") {
		t.Fatalf("expected output to mention successful dry-run completion, got:\n%s", output)
	}

	// 2. Assert that physical files (such as .generated/user-bin/github-release-tool or shell scripts)
	// were NOT created on the physical host system / temp sandbox directory.
	userBinPath := filepath.Join(h.TempDir, ".generated", "user-bin")
	if _, err := os.Stat(userBinPath); err == nil || !os.IsNotExist(err) {
		t.Fatalf("expected physical user-bin directory NOT to be created on host, but it was found at %s", userBinPath)
	}

	shellScriptsPath := filepath.Join(h.TempDir, ".generated", "shell-scripts")
	if _, err := os.Stat(shellScriptsPath); err == nil || !os.IsNotExist(err) {
		t.Fatalf("expected physical shell-scripts directory NOT to be created on host, but it was found at %s", shellScriptsPath)
	}

	// 3. Assert that physical registry.db was NOT created on the physical disk
	dbPath := filepath.Join(h.TempDir, ".generated", "registry.db")
	if _, err := os.Stat(dbPath); err == nil || !os.IsNotExist(err) {
		t.Fatalf("expected physical registry.db database file NOT to be created or modified on disk, but it was found at %s", dbPath)
	}
}
