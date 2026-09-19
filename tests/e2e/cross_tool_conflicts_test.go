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

	// Add a tool with an alias that shadows binary "github-release-tool" from github-release-tool
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

	t.Run("generate warns about alias shadowing binary", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr
		wantWarning := `[flutter] alias "github-release-tool" ('echo shadow-grt') shadows binary "github-release-tool" from tools/github-release-tool/github-release-tool.tool.ts`
		if !strings.Contains(output, wantWarning) {
			t.Fatalf("expected warning %q, got output:\n%s", wantWarning, output)
		}
	})

	t.Run("validate warns about cross tool conflicts", func(t *testing.T) {
		hTypecheck := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
		hTypecheck.CopyFixture("typecheck")
		installCompilerInSandbox(t, hTypecheck)

		// Add flutter tool that shadows binary "tsc" from typescript tool
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

		stdout, stderr, exitCode, err := hTypecheck.RunCommand("validate", "--config", hTypecheck.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("validate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr
		if !strings.Contains(output, `[WARN] 1 warning(s) found:`) {
			t.Fatalf("expected warning header in validate output, got:\n%s", output)
		}
		if !strings.Contains(output, `alias "tsc" ('echo shadow-tsc') shadows binary "tsc" from tools/typescript.tool.ts`) {
			t.Fatalf("expected conflict warning text in validate output, got:\n%s", output)
		}
	})
}
