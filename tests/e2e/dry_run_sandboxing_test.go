package e2e

import (
	"os"
	"path/filepath"
	"testing"
)

func TestE2EDryRunSandboxing(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.MockServerURL = ms.Server.URL

	// Copy the "main" fixture files to the sandbox TempDir
	h.CopyFixture("main")

	// Determine output directory of the generation, which is .generated under sandbox TempDir
	generatedDir := filepath.Join(h.TempDir, ".generated")

	// Ensure that before running, no generated dir exists
	_ = os.RemoveAll(generatedDir)

	// Run generate command with --dry-run
	stdout, stderr, exitCode, err := h.Generate("--dry-run")
	if err != nil {
		t.Fatalf("generate --dry-run failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if exitCode != 0 {
		t.Fatalf("generate --dry-run returned exit code %d, stdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// 1. Assert filesystem side-effects: no actual .generated files/symlinks created on host
	if _, err := os.Stat(generatedDir); !os.IsNotExist(err) {
		t.Errorf("expected generated output directory %q to NOT exist on dry-run, but it exists", generatedDir)
	}

	// 2. Assert physical registry.db was not created on host
	dbPath := filepath.Join(generatedDir, "registry.db")
	if _, err := os.Stat(dbPath); !os.IsNotExist(err) {
		t.Errorf("expected physical database file %q to NOT exist on dry-run, but it exists", dbPath)
	}
}
