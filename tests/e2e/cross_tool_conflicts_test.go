package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2ECrossToolConflicts(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("main")

	// Add a tool with an alias that shadows shim "github-release-tool" from github-release-tool
	toolContent := `import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("manual")
    .zsh((shell) =>
      shell.aliases({
        "github-release-tool": "echo shadow-grt",
      }),
    ),
);
`
	toolPath := filepath.Join(h.TempDir, "tools", "flutter.tool.ts")
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatalf("failed to write tool file: %v", err)
	}

	t.Run("generate warns about alias shadowing shim", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr
		wantWarning := `[flutter] alias "github-release-tool" ('echo shadow-grt') shadows shim "github-release-tool" from tools/github-release-tool/github-release-tool.tool.ts`
		if !strings.Contains(output, wantWarning) {
			t.Fatalf("expected warning %q, got output:\n%s", wantWarning, output)
		}
	})

	// The typecheck fixture declares tsc with `shim: false`, so it is never on PATH and
	// an alias of the same name shadows nothing.
	t.Run("validate ignores aliases matching shimless binaries", func(t *testing.T) {
		hTypecheck := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
		hTypecheck.CopyFixture("typecheck")
		installCompilerInSandbox(t, hTypecheck)

		// Add flutter tool with an alias named after the shimless tsc binary
		toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("manual")
    .zsh((shell) =>
      shell.aliases({
        tsc: "echo shadow-tsc",
      }),
    ),
);
`
		if err := os.WriteFile(filepath.Join(hTypecheck.TempDir, "tools", "flutter.tool.ts"), []byte(toolContent), 0644); err != nil {
			t.Fatalf("writing flutter tool: %v", err)
		}

		stdout, stderr, exitCode, err := hTypecheck.RunCommand("tool", "validate", "--config", hTypecheck.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("validate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr
		if strings.Contains(output, "warning(s) found") || strings.Contains(output, `alias "tsc"`) {
			t.Fatalf("expected no conflict warning for shimless tsc, got:\n%s", output)
		}
		if !strings.Contains(output, "all valid") {
			t.Fatalf("expected validate to report all tools valid, got:\n%s", output)
		}
	})
}
