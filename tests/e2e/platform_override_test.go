package e2e

import (
	"path/filepath"
	"strings"
	"testing"
)

// A v1 dotfiles.config.ts with project-level platform overrides loads unchanged, and
// the override is selected by the same --platform/--arch flags as tool-level blocks.
func TestE2EProjectPlatformOverrides(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
	h.CopyFixture("platform-override")

	tests := []struct {
		name       string
		targetOS   string
		targetArch string
		wantDir    string
	}{
		{name: "apple silicon takes the override", targetOS: "darwin", targetArch: "arm64", wantDir: "homebrew-bin"},
		{name: "the authoring spelling selects the same override", targetOS: "macos", targetArch: "arm64", wantDir: "homebrew-bin"},
		{name: "intel mac keeps the base value", targetOS: "darwin", targetArch: "amd64", wantDir: "user-bin"},
		{name: "linux keeps the base value", targetOS: "linux", targetArch: "arm64", wantDir: "user-bin"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stdout, stderr, exitCode, err := h.RunCommand("shell", "init", "--config", h.ConfigPath, "--platform", tt.targetOS, "--arch", tt.targetArch)
			if err != nil {
				t.Fatalf("env failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
			}
			if exitCode != 0 {
				t.Fatalf("env returned exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
			}
			want := "export PATH=\"" + filepath.Join(h.TempDir, ".generated", tt.wantDir) + ":$PATH\""
			if !strings.Contains(stdout, want) {
				t.Errorf("expected stdout to contain %q, got:\n%s", want, stdout)
			}
		})
	}
}
