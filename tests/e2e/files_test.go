package e2e

import (
	"strings"
	"testing"
)

func TestE2EFiles(t *testing.T) {
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

	t.Run("should display message when no files are managed", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.RunCommand("files", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("files command failed on clean DB: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if !strings.Contains(stdout, "No files currently managed") {
			t.Errorf("expected clean state message, got:\n%s", stdout)
		}
	})

	t.Run("should display tree of installed tool files after generate and install", func(t *testing.T) {
		// Generate first
		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Install a tool
		stdout, stderr, exitCode, err = h.Install([]string{"github-release-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Then check files command
		stdout, stderr, exitCode, err = h.RunCommand("files", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("files command failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		if !strings.Contains(stdout, "github-release-tool") {
			t.Errorf("expected stdout to contain 'github-release-tool', got:\n%s", stdout)
		}
		if !strings.Contains(stdout, "(shim)") && !strings.Contains(stdout, "(binary)") {
			t.Errorf("expected stdout to contain file types, got:\n%s", stdout)
		}
	})
}
