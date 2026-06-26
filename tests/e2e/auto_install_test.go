package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EAutoInstall(t *testing.T) {
	ms := NewMockServer(t, "auto-install")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("auto-install")

	// Write clean, self-contained config.ts with absolute paths
	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
  github: {
    host: "` + ms.Server.URL + `",
    cache: {
      enabled: false,
    },
  },
  downloader: {
    cache: {
      enabled: false,
    },
  },
};`
	err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "auto-install-tool", "current", "auto-install-tool")

	// Verify the binary does NOT exist before generate
	if _, err := os.Stat(binaryPath); err == nil || !os.IsNotExist(err) {
		t.Fatalf("expected binary to NOT exist before generate")
	}

	// Run generate command - this should auto-install the tool
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify stdout/stderr contains auto-install message (real installers log to stderr)
	combinedOutput := stdout + stderr
	if !strings.Contains(combinedOutput, "auto-install-tool") {
		t.Errorf("expected output to mention auto-install of auto-install-tool, but got:\n%s", combinedOutput)
	}

	// Verify the binary was installed and is executable
	fi, err := os.Stat(binaryPath)
	if err != nil {
		t.Fatalf("expected binary to exist at %s after generate: %v", binaryPath, err)
	}
	if fi.Mode()&0111 == 0 {
		t.Errorf("expected installed binary to be executable")
	}

	// Verify shim exists and is executable
	h.AssertShimExistsAndExecutable("auto-install-tool")

	// Verify execution of auto-installed tool binary directly
	cmd := exec.Command(binaryPath, "--version")
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to execute binary: %v\noutput: %s", err, string(out))
	}
	if !strings.Contains(string(out), "auto-install-tool version 1.0.0") {
		t.Errorf("expected version output to contain 'auto-install-tool version 1.0.0', got %q", string(out))
	}

	// Verify environment variable is set
	h.AssertEnvironmentVariable("auto-install-tool", "AUTO_INSTALL_TOOL_HOME", "~/.auto-install-tool")

	// Run generate again and verify it does NOT reinstall when already installed
	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("subsequent generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Since it is already installed, the "Auto-installed" message should not appear on re-run
	combinedOutput = stdout + stderr
	if strings.Contains(combinedOutput, "Auto-installed: auto-install-tool") {
		t.Errorf("expected subsequent generate to skip auto-install logs, but got:\n%s", combinedOutput)
	}
}
