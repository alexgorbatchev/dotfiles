package e2e

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestE2EUpdate(t *testing.T) {
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

	// 1. Run generate first
	stdout, stderr, exitCode, err := h.Generate("-d")
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// 2. Install version 1.0.0 first
	stdout, stderr, exitCode, err = h.Install([]string{"github-release-tool"})
	if err != nil || exitCode != 0 {
		t.Fatalf("initial install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "github-release-tool", "current", "github-release-tool")

	t.Run("should update github-release-tool to newer version", func(t *testing.T) {
		// Verify currently installed version in DB is "latest"
		h.AssertDBToolInstalled("github-release-tool", "latest")

		// Verify we can execute the binary
		if _, err := os.Stat(binaryPath); err != nil {
			t.Fatalf("expected installed binary to exist: %v", err)
		}

		// Set new version 2.0.0 on the mock server
		url := fmt.Sprintf("%s/set-tool-version/repo/github-release-tool/2.0.0", ms.Server.URL)
		resp, err := http.Get(url)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("failed to set tool version on mock server: %v", err)
		}
		resp.Body.Close()

		// Run update command
		stdout, stderr, exitCode, err = h.Update("github-release-tool")
		if err != nil || exitCode != 0 {
			t.Fatalf("update failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify database records the new version 2.0.0
		h.AssertDBToolInstalled("github-release-tool", "2.0.0")
	})

	t.Run("should fail gracefully when updating non-existent tool", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.Update("non-existent-tool")
		if err == nil && exitCode == 0 {
			t.Fatalf("expected update to fail for non-existent-tool, but got exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
		}
	})
}
