package e2e

import (
	"os"
	"path/filepath"
	"testing"
)

func TestE2EGhCli(t *testing.T) {
	t.Parallel()

	// 1. Standard GitHub (github.com)
	t.Run("Standard GitHub", func(t *testing.T) {
		ms := NewMockServer(t, "gh-cli")
		defer ms.Close()

		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
			Env: map[string]string{
				"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
			},
		})
		h.MockServerURL = ms.Server.URL
		h.CopyFixture("gh-cli")

		// Point host to mock server for standard github in sandbox config.ts
		configPath := filepath.Join(h.TempDir, "config.ts")
		configContent := `export default {
  paths: {
    generatedDir: "./.generated",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
  github: {
    host: "` + ms.Server.URL + `",
    cache: { enabled: false },
  },
  downloader: {
    cache: { enabled: false },
  },
};`
		_ = os.WriteFile(configPath, []byte(configContent), 0644)

		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		stdout, stderr, exitCode, err = h.Install([]string{"gh-cli-test-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "gh-cli-test-tool", "current", "gh-cli-test-tool")
		if _, err := os.Stat(binaryPath); err != nil {
			t.Fatalf("expected binary to exist at %s: %v", binaryPath, err)
		}
	})

	// 2. GitHub Enterprise
	t.Run("GitHub Enterprise", func(t *testing.T) {
		ms := NewMockServer(t, "gh-cli-enterprise")
		defer ms.Close()

		h := NewTestHarness(t, HarnessOptions{
			ConfigPath: "config.ts",
			Env: map[string]string{
				"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
			},
		})
		h.MockServerURL = ms.Server.URL
		h.CopyFixture("gh-cli-enterprise")

		// Point host to mock server for enterprise in sandbox config.ts
		configPath := filepath.Join(h.TempDir, "config.ts")
		configContent := `export default {
  paths: {
    generatedDir: "./.generated",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
  github: {
    host: "` + ms.Server.URL + `",
    cache: { enabled: false },
  },
  downloader: {
    cache: { enabled: false },
  },
};`
		_ = os.WriteFile(configPath, []byte(configContent), 0644)

		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate enterprise failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		stdout, stderr, exitCode, err = h.Install([]string{"enterprise-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install enterprise failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "enterprise-tool", "current", "enterprise-tool")
		if _, err := os.Stat(binaryPath); err != nil {
			t.Fatalf("expected binary to exist at %s: %v", binaryPath, err)
		}
	})
}
