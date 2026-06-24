package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EConflict(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("main")

	// Pre-create user-bin folder inside sandbox and put an unmanaged file there
	userBinDir := filepath.Join(h.TempDir, ".generated", "user-bin")
	err := os.MkdirAll(userBinDir, 0755)
	if err != nil {
		t.Fatalf("failed to create user-bin: %v", err)
	}

	conflictingShimPath := filepath.Join(userBinDir, "github-release-tool")
	err = os.WriteFile(conflictingShimPath, []byte("original unmanaged content"), 0644)
	if err != nil {
		t.Fatalf("failed to create conflicting file: %v", err)
	}

	t.Run("should detect conflicts with existing non-generator files", func(t *testing.T) {
		// Run detect-conflicts
		stdout, stderr, exitCode, err := h.RunCommand("detect-conflicts", "--config", h.ConfigPath)
		if err != nil {
			t.Fatalf("detect-conflicts failed: %v", err)
		}
		if exitCode == 0 {
			t.Fatalf("expected detect-conflicts to fail with exit code 1, but got 0")
		}

		output := stdout + stderr
		if !strings.Contains(output, "Conflicts detected with files not owned by the generator") {
			t.Fatalf("expected output to mention conflict detection, but got:\n%s", output)
		}
		if !strings.Contains(output, "github-release-tool") {
			t.Fatalf("expected output to mention github-release-tool, but got:\n%s", output)
		}
		if !strings.Contains(output, "exists but is not a generator shim") {
			t.Fatalf("expected output to contain 'exists but is not a generator shim', but got:\n%s", output)
		}
	})

	t.Run("should fail to generate when conflicting file exists", func(t *testing.T) {
		// Run generate
		stdout, stderr, exitCode, err := h.Generate("-d")
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr
		if !strings.Contains(output, `Cannot create shim for "github-release-tool"`) {
			t.Fatalf("expected output to warn about not creating shim, but got:\n%s", output)
		}
		if !strings.Contains(output, "conflicting file exists at") {
			t.Fatalf("expected output to mention conflicting file, but got:\n%s", output)
		}
		if !strings.Contains(output, "Use --overwrite to replace it") {
			t.Fatalf("expected output to mention --overwrite option, but got:\n%s", output)
		}

		// The conflicting file should remain intact with the original unmanaged content
		content, err := os.ReadFile(conflictingShimPath)
		if err != nil {
			t.Fatalf("failed to read conflicting file: %v", err)
		}
		if string(content) != "original unmanaged content" {
			t.Fatalf("expected conflicting file to keep original content, but got %q", string(content))
		}
	})

	t.Run("should succeed with --overwrite flag when conflicting file exists", func(t *testing.T) {
		// Run generate with --overwrite
		stdout, stderr, exitCode, err := h.Generate("-d", "--overwrite")
		if err != nil || exitCode != 0 {
			t.Fatalf("generate with --overwrite failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify the shim was successfully generated and is executable
		h.AssertShimExistsAndExecutable("github-release-tool")
	})
}
