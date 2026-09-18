package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A configuration file that exports no configuration is a configuration error: every
// command goes through the same bootstrap, so the one that reports it has to name the
// file and exit non-zero rather than dereference a configuration that is not there.
func TestE2EConfigurationFileExportsNoConfiguration(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigContent: "export default undefined;\n"})

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	if strings.Contains(output, "panic:") || strings.Contains(output, "goroutine 1 [running]") {
		t.Fatalf("expected a configuration error rather than a stack trace:\n%s", output)
	}
	if !strings.Contains(output, h.ConfigPath) {
		t.Errorf("expected the failure to name %q:\n%s", h.ConfigPath, output)
	}
	if !strings.Contains(output, "must export a configuration object") {
		t.Errorf("expected the failure to say what the file must export:\n%s", output)
	}
}

// An asynchronous tool factory that fails is reported the way the synchronous one is.
// Dropping the tool from the configuration and exiting successfully would leave nothing
// in the output to search for, and the tool would be missing from every later command.
func TestE2EAsyncToolFactoryFailureFailsTheLoad(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: "export default { paths: { generatedDir: \"./.generated\" } };\n",
	})

	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating the tools directory: %v", err)
	}
	toolPath := filepath.Join(toolsDir, "boom.tool.ts")
	toolSource := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"export default defineTool(async () => {\n  throw new Error(\"factory exploded\");\n});\n"
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	if !strings.Contains(output, toolPath) {
		t.Errorf("expected the failure to name %q:\n%s", toolPath, output)
	}
	if !strings.Contains(output, "factory exploded") {
		t.Errorf("expected the failure to carry the error the factory threw:\n%s", output)
	}
}
