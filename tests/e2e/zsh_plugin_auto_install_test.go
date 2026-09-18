package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

const zshPluginToolName = "zsh-plugin-tool"

// newZshPluginRepo creates a local git repository holding a zsh plugin and
// returns its file:// URL so the installer clones it without network access.
func newZshPluginRepo(t *testing.T, root, pluginName string) string {
	t.Helper()

	repoDir := filepath.Join(root, "plugin-src", pluginName)
	if err := os.MkdirAll(repoDir, 0755); err != nil {
		t.Fatalf("failed to create plugin repo dir: %v", err)
	}
	pluginFile := filepath.Join(repoDir, pluginName+".plugin.zsh")
	if err := os.WriteFile(pluginFile, []byte("echo \"plugin loaded\"\n"), 0644); err != nil {
		t.Fatalf("failed to write plugin file: %v", err)
	}

	gitCommands := [][]string{
		{"init", "-q"},
		{"add", "."},
		{"-c", "user.name=dotfiles-e2e", "-c", "user.email=e2e@example.invalid", "commit", "-q", "-m", "init"},
	}
	for _, args := range gitCommands {
		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v failed: %v\n%s", args, err, out)
		}
	}

	return "file://" + filepath.ToSlash(repoDir)
}

// writeZshPluginProject writes a project whose single tool is a zsh plugin cloned
// from repoURL into pluginName. autoParam is inserted verbatim into the install
// parameters, so the caller decides whether `auto` is omitted or set explicitly.
func writeZshPluginProject(t *testing.T, h *TestHarness, repoURL, pluginName, autoParam string) {
	t.Helper()

	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
  downloader: {
    cache: {
      enabled: false,
    },
  },
};`
	if err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	toolConfigContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("zsh-plugin", {
    url: "` + repoURL + `",
    pluginName: "` + pluginName + `",` + autoParam + `
  }),
);`
	toolDir := filepath.Join(h.TempDir, "tools", zshPluginToolName)
	if err := os.MkdirAll(toolDir, 0755); err != nil {
		t.Fatalf("failed to create tool directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolDir, zshPluginToolName+".tool.ts"), []byte(toolConfigContent), 0644); err != nil {
		t.Fatalf("failed to write tool config: %v", err)
	}
}

// TestE2EZshPluginAutoInstallDefault covers issue #36: a zsh plugin that does
// not spell out `auto` is installed during `generate`, because the method
// defaults `auto` to true, while `auto: false` still opts out.
func TestE2EZshPluginAutoInstallDefault(t *testing.T) {
	t.Parallel()

	const pluginName = "e2e-plugin"

	tests := []struct {
		name          string
		autoParam     string
		wantInstalled bool
	}{
		{name: "auto omitted installs during generate", autoParam: "", wantInstalled: true},
		{name: "auto false requires explicit install", autoParam: "\n    auto: false,", wantInstalled: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			h := NewTestHarness(t, HarnessOptions{
				ConfigPath: "config.ts",
				Env: map[string]string{
					"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
				},
			})
			repoURL := newZshPluginRepo(t, h.TempDir, pluginName)
			writeZshPluginProject(t, h, repoURL, pluginName, tt.autoParam)

			stdout, stderr, exitCode, err := h.Generate()
			if err != nil || exitCode != 0 {
				t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
			}

			pluginFile := filepath.Join(h.TempDir, ".generated", "binaries", zshPluginToolName, "current", pluginName, pluginName+".plugin.zsh")
			_, statErr := os.Stat(pluginFile)
			if tt.wantInstalled {
				if statErr != nil {
					t.Fatalf("expected generate to clone the plugin to %s: %v\nstdout: %s\nstderr: %s", pluginFile, statErr, stdout, stderr)
				}
				h.AssertShellInitContains("zsh", "source \""+filepath.ToSlash(pluginFile)+"\"")
				return
			}
			if !os.IsNotExist(statErr) {
				t.Fatalf("expected generate to leave the plugin uninstalled at %s, stat error: %v", pluginFile, statErr)
			}
		})
	}
}
