package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const originalToolConfig = `import { defineTool } from "@dotfiles/cli";

export default defineTool((install) => install().symlink("./config.txt", "~/.config/renameable-tool/config.txt"));
`

func TestE2EToolRename(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})

	h.CopyFixture("tool-rename")

	// Ensure the source file config.txt is placed in the root of TempDir where the CLI resolves relative paths
	err := os.WriteFile(filepath.Join(h.TempDir, "config.txt"), []byte("config content\n"), 0644)
	if err != nil {
		t.Fatalf("failed to write config.txt source file: %v", err)
	}

	toolDir := filepath.Join(h.TempDir, "tools", "renameable-tool")
	oldToolConfigPath := filepath.Join(toolDir, "old-tool.tool.ts")
	newToolConfigPath := filepath.Join(toolDir, "new-tool.tool.ts")

	// Ensure fresh state
	_ = os.Remove(newToolConfigPath)
	err = os.WriteFile(oldToolConfigPath, []byte(originalToolConfig), 0644)
	if err != nil {
		t.Fatalf("failed to write original tool config: %v", err)
	}

	// First generate
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("initial generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Rename the tool config
	err = os.Rename(oldToolConfigPath, newToolConfigPath)
	if err != nil {
		t.Fatalf("failed to rename tool config: %v", err)
	}

	// Second generate (triggers orphan/stale tool cleanup)
	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate after rename failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Runs generate a third time and checks it stops reporting orphan cleanup
	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("repeated generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	if strings.Contains(stdout, "Removing stale symlink") {
		t.Errorf("expected subsequent generate to skip orphan cleanup logs, but got:\n%s", stdout)
	}
}
