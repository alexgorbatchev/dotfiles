package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A manual tool whose before-install hook stages files must receive the staging
// directory as an absolute path, because its commands run from the tool's own
// directory rather than from where the CLI was invoked. The project configuration
// here deliberately uses a relative generatedDir so a path handed over unresolved
// would land the staged files inside the tool directory instead.
func TestE2EHookStagingDir(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})

	configContent := `export default {
  paths: {
    generatedDir: "./.generated",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
};`
	if err := os.WriteFile(h.ConfigPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	writeTool := func(toolName, beforeInstall string) {
		t.Helper()
		toolDir := filepath.Join(h.TempDir, "tools", toolName)
		if err := os.MkdirAll(toolDir, 0755); err != nil {
			t.Fatalf("failed to create tool directory: %v", err)
		}
		toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("manual")
    .hook("before-install", async ({ $, stagingDir, log }) => {
      ` + beforeInstall + `
    })
    .hook("after-install", async ({ toolName, installedDir, log }) => {
      log.info("after-install ran for " + toolName + " in " + installedDir);
    }),
);
`
		if err := os.WriteFile(filepath.Join(toolDir, toolName+".tool.ts"), []byte(toolContent), 0644); err != nil {
			t.Fatalf("failed to write tool config: %v", err)
		}
	}

	writeTool("staged-plugin", "await $`echo staged > ${stagingDir}/payload.txt`;")
	writeTool("unstaged-plugin", `log.info("staging nothing for " + stagingDir);`)

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	t.Run("hook stages into the real staging directory", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.Install([]string{"staged-plugin"})
		output := stdout + stderr
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\noutput: %s", err, output)
		}

		payloadPath := filepath.Join(h.TempDir, ".generated", "binaries", "staged-plugin", "current", "payload.txt")
		payload, err := os.ReadFile(payloadPath)
		if err != nil {
			t.Fatalf("staged file was not promoted to %s: %v\noutput: %s", payloadPath, err, output)
		}
		if strings.TrimSpace(string(payload)) != "staged" {
			t.Errorf("promoted payload = %q, want %q", string(payload), "staged")
		}

		strayDir := filepath.Join(h.TempDir, "tools", "staged-plugin", ".generated")
		if _, err := os.Stat(strayDir); err == nil {
			t.Errorf("the hook wrote into %s: stagingDir was handed over relative to the wrong directory", strayDir)
		}

		installedDir := filepath.Join(h.TempDir, ".generated", "binaries", "staged-plugin", "current")
		wantLine := "after-install ran for staged-plugin in " + installedDir
		if !strings.Contains(output, wantLine) {
			t.Errorf("expected output to contain %q, got:\n%s", wantLine, output)
		}
	})

	t.Run("hook that stages nothing fails the install", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.Install([]string{"unstaged-plugin"})
		output := stdout + stderr
		if err != nil {
			t.Fatalf("running install: %v", err)
		}
		if exitCode == 0 {
			t.Fatalf("install of a tool that staged nothing exited 0:\n%s", output)
		}
		if !strings.Contains(output, "is empty") {
			t.Errorf("expected the failure to name the empty staging directory, got:\n%s", output)
		}
		if strings.Contains(output, "after-install ran for unstaged-plugin") {
			t.Errorf("after-install ran for a failed install:\n%s", output)
		}

		toolBinariesDir := filepath.Join(h.TempDir, ".generated", "binaries", "unstaged-plugin")
		if _, err := os.Stat(toolBinariesDir); err == nil {
			t.Errorf("%s exists: a failed install must leave no payload directory behind", toolBinariesDir)
		}
	})
}
