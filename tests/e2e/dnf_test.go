package e2e

import (
	"os"
	"path/filepath"
	"testing"
)

func TestE2EDnf(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})

	h.CopyFixture("dnf")

	// Write clean, self-contained config.ts with absolute paths
	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
};`
	err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	fixtureDir := filepath.Join(h.ProjectRoot, "tests", "e2e", "fixtures", "dnf")
	fakeBinDir := filepath.Join(fixtureDir, "fake-bin")
	fakeDnfLog := filepath.Join(h.TempDir, ".generated", "fake-dnf.log")

	// Ensure the parent directory of fake dnf log exists
	err = os.MkdirAll(filepath.Dir(fakeDnfLog), 0755)
	if err != nil {
		t.Fatalf("failed to create log dir: %v", err)
	}

	// Set custom PATH to include fake-bin and pass FAKE_DNF_LOG env var
	customPath := fakeBinDir + string(filepath.ListSeparator) + os.Getenv("PATH")
	h.Env["PATH"] = customPath
	h.Env["FAKE_DNF_LOG"] = fakeDnfLog

	// Run install command
	stdout, stderr, exitCode, err := h.Install([]string{"dnf-tool"})
	if err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Read and verify fake dnf log file content matching Go-native dnf installer behavior
	logBytes, err := os.ReadFile(fakeDnfLog)
	if err != nil {
		t.Fatalf("failed to read fake dnf log: %v", err)
	}
	logStr := string(logBytes)
	expectedLog := "dnf makecache\ndnf install -y ripgrep\nrpm -q --qf %{VERSION}-%{RELEASE} ripgrep\n"
	if logStr != expectedLog {
		t.Errorf("expected log file content %q, but got %q", expectedLog, logStr)
	}
}
