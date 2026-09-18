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

// A tool file is read again every time a hook fires, so an asynchronous factory can
// succeed while the configuration is loaded and fail once the installation is under
// way: it awaits a lookup whose answer the installation itself has changed. The tool
// here rejects as soon as its own before-install hook has run, which is the shape of
// the real case -- a factory awaiting a network or filesystem lookup that fails on this
// machine -- without depending on anything outside the test.
//
// Unobserved, that rejection costs the tool every handler registered after the factory's
// first await and the command still exits 0, so there is nothing in the output to search
// for. The installation has to fail instead, naming the file and the error.
func TestE2EHookToolFactoryFailureFailsTheInstall(t *testing.T) {
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
		t.Fatalf("writing config.ts: %v", err)
	}

	toolDir := filepath.Join(h.TempDir, "tools", "late-failure")
	if err := os.MkdirAll(toolDir, 0755); err != nil {
		t.Fatalf("creating the tool directory: %v", err)
	}
	toolPath := filepath.Join(toolDir, "late-failure.tool.ts")
	toolContent := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"\n" +
		"export default defineTool(async (install, ctx) => {\n" +
		"  const marker = ctx.toolDir + \"/installing\";\n" +
		"  const builder = install(\"manual\")\n" +
		"    .hook(\"before-install\", async ({ $, stagingDir, fileSystem }) => {\n" +
		"      await $`echo staged > ${stagingDir}/payload.txt`;\n" +
		"      await fileSystem.writeFile(marker, \"installing\");\n" +
		"    })\n" +
		"    .hook(\"after-install\", async ({ log, toolName }) => {\n" +
		"      log.info(\"after-install ran for \" + toolName);\n" +
		"    });\n" +
		"  if (await ctx.fs.exists(marker)) {\n" +
		"    throw new Error(\"the lookup this tool file awaits failed\");\n" +
		"  }\n" +
		"  return builder;\n" +
		"});\n"
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	stdout, stderr, exitCode, err = h.Install([]string{"late-failure"})
	if err != nil {
		t.Fatalf("running install: %v", err)
	}
	output := stdout + stderr
	if exitCode == 0 {
		t.Fatalf("install of a tool whose factory failed at hook time exited 0:\n%s", output)
	}
	if !strings.Contains(output, toolPath) {
		t.Errorf("expected the failure to name %q:\n%s", toolPath, output)
	}
	if !strings.Contains(output, "the lookup this tool file awaits failed") {
		t.Errorf("expected the failure to carry the error the factory threw:\n%s", output)
	}
	if strings.Contains(output, "after-install ran for late-failure") {
		t.Errorf("the after-install hook ran although its tool file never finished evaluating:\n%s", output)
	}
}
