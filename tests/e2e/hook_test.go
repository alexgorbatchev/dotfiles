package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EHook(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("main")

	// Generate first
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	toolName := "hook-test-tool"
	binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", toolName, "current", toolName)

	// Verify the binary does NOT exist before install
	if _, err := os.Stat(binaryPath); err == nil || !os.IsNotExist(err) {
		t.Fatalf("expected binary to NOT exist before install")
	}

	// Run install command
	stdout, stderr, exitCode, err = h.Install([]string{toolName})
	if err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify the binary was installed and is executable
	fi, err := os.Stat(binaryPath)
	if err != nil {
		t.Fatalf("expected binary to exist at %s after install: %v", binaryPath, err)
	}
	if fi.Mode()&0111 == 0 {
		t.Errorf("expected installed binary to be executable")
	}

	// Concatenate output because logs are output to stderr
	combinedOutput := stdout + stderr

	// Verify combinedOutput has correct prefix/logs for hook executions
	expectedLines := []string{
		"[hook-test-tool] $ echo \"shell-output-for-hook-test-tool\"",
		"[hook-test-tool] | shell-output-for-hook-test-tool",
		"[hook-test-tool] $ ./scripts/test-output.sh",
		"[hook-test-tool] | Starting initialization...",
		"[hook-test-tool] | Warning: this is a test warning",
		"[hook-test-tool] | Loading configuration...",
		"[hook-test-tool] | Error: simulated error message",
		"[hook-test-tool] | Processing data...",
		"[hook-test-tool] | Another stderr line",
		"[hook-test-tool] | Initialization complete!",
	}

	for _, line := range expectedLines {
		if !strings.Contains(combinedOutput, line) {
			t.Errorf("expected output to contain hook output line %q, but got:\n%s", line, combinedOutput)
		}
	}
}
