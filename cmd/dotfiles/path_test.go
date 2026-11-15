package main

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

// TestBinCommand_PrintsTargetDir runs the target path query against the on-disk
// fixture, whose targetDir ({paths.generatedDir}/user-bin) and binariesDir
// ({paths.generatedDir}/binaries) differ, so printing the wrong one is visible.
func TestBinCommand_PrintsTargetDir(t *testing.T) {
	absConfig := filepath.Join(findRepoRoot(), "test-project", "dotfiles.config.ts")
	wantDir := filepath.Join(findRepoRoot(), "test-project", ".generated", "user-bin")

	t.Run("human", func(t *testing.T) {
		out, err := runCommand("-c", absConfig, "path", "target")
		if err != nil {
			t.Fatalf("path target: %v\n%s", err, out.Combined)
		}
		if out.Stdout != wantDir+"\n" {
			t.Fatalf("stdout = %q, want the configured target dir %q", out.Stdout, wantDir)
		}
	})

	t.Run("json", func(t *testing.T) {
		out, err := runCommand("-c", absConfig, "path", "target", "--json")
		if err != nil {
			t.Fatalf("path target --json: %v\n%s", err, out.Combined)
		}
		var got map[string]string
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got["path"] != wantDir {
			t.Fatalf("path = %q, want the configured target dir %q", got["path"], wantDir)
		}
	})
}
