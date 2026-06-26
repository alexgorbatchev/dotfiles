package e2e

import (
	"os"
	"path/filepath"
	"testing"
)

func TestE2EPacman(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})

	h.CopyFixture("pacman")

	// Write clean, self-contained config.ts to avoid esbuild compile/resolve failures
	configContent := `export default {
  paths: {
    generatedDir: "./.generated",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
};`
	err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	fixtureDir := filepath.Join(h.ProjectRoot, "tests", "e2e", "fixtures", "pacman")
	fakeBinDir := filepath.Join(fixtureDir, "fake-bin")
	fakeExactPacmanLog := filepath.Join(h.TempDir, ".generated", "fake-pacman-exact.log")
	fakeLatestPacmanLog := filepath.Join(h.TempDir, ".generated", "fake-pacman-latest.log")

	// Ensure the parent directories of fake pacman logs exist
	err = os.MkdirAll(filepath.Dir(fakeExactPacmanLog), 0755)
	if err != nil {
		t.Fatalf("failed to create log dir: %v", err)
	}

	// Set custom PATH to include fake-bin and pass FAKE_PACMAN_LOG env var for pacman-tool
	customPath := fakeBinDir + string(filepath.ListSeparator) + os.Getenv("PATH")
	h.Env["PATH"] = customPath

	t.Run("installs exact version of pacman package", func(t *testing.T) {
		h.Env["FAKE_PACMAN_LOG"] = fakeExactPacmanLog

		// Temporarily rename the latest tool config file to avoid ambiguous binary (rg) resolution
		latestToolConfig := filepath.Join(h.TempDir, "tools", "pacman-latest-tool", "pacman-latest-tool.tool.ts")
		tempLatestConfig := filepath.Join(h.TempDir, "tools", "pacman-latest-tool", "pacman-latest-tool.tool.ts.bak")
		err = os.Rename(latestToolConfig, tempLatestConfig)
		if err != nil {
			t.Fatalf("failed to hide pacman-latest-tool: %v", err)
		}
		defer func() {
			_ = os.Rename(tempLatestConfig, latestToolConfig)
		}()

		stdout, stderr, exitCode, err := h.Install([]string{"pacman-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install pacman-tool failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		logBytes, err := os.ReadFile(fakeExactPacmanLog)
		if err != nil {
			t.Fatalf("failed to read exact pacman log: %v", err)
		}
		expectedLog := "pacman -Syu --needed --noconfirm ripgrep\npacman -Q ripgrep\n"
		if string(logBytes) != expectedLog {
			t.Errorf("expected log content %q, but got %q", expectedLog, string(logBytes))
		}
	})

	t.Run("installs latest version of pacman package", func(t *testing.T) {
		h.Env["FAKE_PACMAN_LOG"] = fakeLatestPacmanLog

		// Temporarily rename the exact tool config file to avoid ambiguous binary (rg) resolution
		exactToolConfig := filepath.Join(h.TempDir, "tools", "pacman-tool", "pacman-tool.tool.ts")
		tempExactConfig := filepath.Join(h.TempDir, "tools", "pacman-tool", "pacman-tool.tool.ts.bak")
		err = os.Rename(exactToolConfig, tempExactConfig)
		if err != nil {
			t.Fatalf("failed to hide pacman-tool: %v", err)
		}
		defer func() {
			_ = os.Rename(tempExactConfig, exactToolConfig)
		}()

		stdout, stderr, exitCode, err := h.Install([]string{"pacman-latest-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install pacman-latest-tool failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		logBytes, err := os.ReadFile(fakeLatestPacmanLog)
		if err != nil {
			t.Fatalf("failed to read latest pacman log: %v", err)
		}
		expectedLog := "pacman -S --needed --noconfirm extra/ripgrep\npacman -Q extra/ripgrep\n"
		if string(logBytes) != expectedLog {
			t.Errorf("expected log content %q, but got %q", expectedLog, string(logBytes))
		}
	})
}
