package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// shimSnapshot is the content and modification time of every file in the shim
// directory, so two generate runs can be compared for having rewritten anything.
type shimSnapshot map[string]struct {
	content string
	modTime time.Time
}

func snapshotShims(t *testing.T, dir string) shimSnapshot {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("reading shim directory %s: %v", dir, err)
	}
	snapshot := make(shimSnapshot, len(entries))
	for _, entry := range entries {
		path := filepath.Join(dir, entry.Name())
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat %s: %v", path, err)
		}
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		snapshot[entry.Name()] = struct {
			content string
			modTime time.Time
		}{content: string(content), modTime: info.ModTime()}
	}
	return snapshot
}

// A manual tool that declares .bin() without a binaryPath gets no shim, as in v1:
// its command is expected to come from shell functions, and the author is warned.
// Because generation and the stale-shim cleanup agree on that, a second generate
// removes nothing, regenerates nothing and leaves every shim byte- and mtime-identical.
func TestE2EManualToolWithoutBinaryPathHasNoShim(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
	h.CopyFixture("manual-shim")

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

	shimDir := filepath.Join(h.TempDir, ".generated", "user-bin")
	const warning = "Skipping shim generation"

	generate := func(run int) string {
		t.Helper()
		stdout, stderr, exitCode, err := h.Generate()
		if err != nil || exitCode != 0 {
			t.Fatalf("generate run %d failed: %v\nstdout: %s\nstderr: %s", run, err, stdout, stderr)
		}
		output := stdout + stderr
		if strings.Contains(output, "Removing stale shim") {
			t.Errorf("generate run %d removed a shim it was about to regenerate:\n%s", run, output)
		}
		if !strings.Contains(output, warning) {
			t.Errorf("generate run %d did not warn that shell-fn gets no shim:\n%s", run, output)
		}
		if _, err := os.Stat(filepath.Join(shimDir, "shell-fn")); !os.IsNotExist(err) {
			t.Errorf("generate run %d left a shim for the manual tool without binaryPath (err=%v)", run, err)
		}
		return output
	}

	generate(1)
	h.AssertShimExistsAndExecutable("scripted")
	first := snapshotShims(t, shimDir)

	generate(2)
	second := snapshotShims(t, shimDir)

	if len(first) != len(second) {
		t.Fatalf("shim directory changed between runs: %d files, then %d", len(first), len(second))
	}
	for name, before := range first {
		after, ok := second[name]
		if !ok {
			t.Errorf("shim %s disappeared on the second run", name)
			continue
		}
		if after.content != before.content {
			t.Errorf("shim %s was rewritten with different content on the second run", name)
		}
		if !after.modTime.Equal(before.modTime) {
			t.Errorf("shim %s was rewritten on the second run: mtime %s, then %s", name, before.modTime, after.modTime)
		}
	}
}
