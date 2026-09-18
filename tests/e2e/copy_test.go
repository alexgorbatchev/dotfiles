package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const toolConfigWithoutCopy = `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install());
`

// .copy(src, dst) places the file at its target on generate. Whatever the user had
// there survives as <target>.bak, a second generate leaves both alone, and dropping
// the declaration removes the copy while the backup stays.
func TestE2ECopy(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
	h.CopyFixture("copy")

	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
};`
	if err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	const userContent = "user = true\n"
	const managedContent = "managed = true\n"
	target := filepath.Join(h.TempDir, ".generated", "user-home", ".config", "copy-tool", "config.toml")
	backup := target + ".bak"

	// The user already keeps their own file where the copy will land.
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		t.Fatalf("failed to create target directory: %v", err)
	}
	if err := os.WriteFile(target, []byte(userContent), 0644); err != nil {
		t.Fatalf("failed to write pre-existing target: %v", err)
	}

	readFile := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		return string(data)
	}

	generate := func(run int) string {
		t.Helper()
		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate run %d failed: %v\nstdout: %s\nstderr: %s", run, err, stdout, stderr)
		}
		return stdout + stderr
	}

	t.Run("first generate copies and backs up", func(t *testing.T) {
		generate(1)
		if got := readFile(target); got != managedContent {
			t.Errorf("target = %q, want %q", got, managedContent)
		}
		if got := readFile(backup); got != userContent {
			t.Errorf("backup = %q, want %q", got, userContent)
		}
		h.AssertDBOperationLogged("copy-tool", "writeFile", "config.toml")
	})

	t.Run("second generate leaves both alone", func(t *testing.T) {
		output := generate(2)
		if strings.Contains(output, "Removing stale file") {
			t.Errorf("a repeated generate treated its own copy as stale:\n%s", output)
		}
		if got := readFile(target); got != managedContent {
			t.Errorf("target = %q, want %q", got, managedContent)
		}
		if got := readFile(backup); got != userContent {
			t.Errorf("backup = %q after a repeated generate, want %q", got, userContent)
		}
	})

	t.Run("dropping the declaration removes the copy", func(t *testing.T) {
		toolConfigPath := filepath.Join(h.TempDir, "tools", "copy-tool", "copy-tool.tool.ts")
		if err := os.WriteFile(toolConfigPath, []byte(toolConfigWithoutCopy), 0644); err != nil {
			t.Fatalf("failed to rewrite tool config: %v", err)
		}
		output := generate(3)
		if !strings.Contains(output, "Removing stale file") {
			t.Errorf("expected the stale copy to be reported, got:\n%s", output)
		}
		if _, err := os.Stat(target); !os.IsNotExist(err) {
			t.Errorf("stale copy still exists at %s (err=%v)", target, err)
		}
		if got := readFile(backup); got != userContent {
			t.Errorf("backup = %q after the copy was removed, want %q", got, userContent)
		}
	})
}
