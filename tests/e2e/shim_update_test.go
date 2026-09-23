package e2e

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestE2EShimUpdate runs a generated shim's `@update` the way a user does. The shim
// prints nothing of its own, so what the user reads is what `tool update --shim-mode`
// reports: the outcome for the tool, without the progress of checking and installing.
// For a tool pinned by its `version` install parameter, that outcome is the refusal,
// which must reach the user, while the command succeeds as a refusal does elsewhere.
func TestE2EShimUpdate(t *testing.T) {
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

	const toolName = "github-release-tool"
	if stdout, stderr, exitCode, err := h.Generate(); err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if stdout, stderr, exitCode, err := h.Install([]string{toolName}); err != nil || exitCode != 0 {
		t.Fatalf("initial install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	h.AssertDBToolInstalled(toolName, "1.0.0")
	shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", toolName)

	setUpstreamVersion := func(t *testing.T, version string) {
		t.Helper()
		resp, err := http.Get(fmt.Sprintf("%s/set-tool-version/repo/%s/%s", ms.Server.URL, toolName, version))
		if err != nil {
			t.Fatalf("setting the upstream version to %s: %v", version, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("setting the upstream version to %s: status %d", version, resp.StatusCode)
		}
	}

	t.Run("an unpinned tool reports its update", func(t *testing.T) {
		setUpstreamVersion(t, "2.0.0")
		stdout, stderr, exitCode, err := runShim(h, shimPath, "@update")
		if err != nil || exitCode != 0 {
			t.Fatalf("@update failed: %v\nexitCode: %d\nstdout: %s\nstderr: %s", err, exitCode, stdout, stderr)
		}
		for _, want := range []string{
			"[update] [" + toolName + "] New version available: 1.0.0 -> 2.0.0",
			"[update] [" + toolName + "] Successfully updated to version 2.0.0",
		} {
			if !strings.Contains(stderr, want) {
				t.Errorf("stderr does not contain %q:\n%s", want, stderr)
			}
		}
		if strings.Contains(stderr, "Fetching release info") || strings.Contains(stderr, "Checking for updates") {
			t.Errorf("stderr reports the progress shim mode hides:\n%s", stderr)
		}
		if stdout != "" {
			t.Errorf("stdout = %q, want nothing: the shim prints nothing of its own for @update", stdout)
		}
		h.AssertDBToolInstalled(toolName, "2.0.0")
	})

	t.Run("a tool pinned by its version install parameter reports the pin", func(t *testing.T) {
		toolFile := filepath.Join(h.TempDir, "tools", toolName, toolName+".tool.ts")
		pinnedTool := `import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("github-release", {
    repo: "repo/github-release-tool",
    version: "2.0.0",
  }).bin("github-release-tool"),
);
`
		if err := os.WriteFile(toolFile, []byte(pinnedTool), 0644); err != nil {
			t.Fatalf("pinning the tool: %v", err)
		}
		setUpstreamVersion(t, "3.0.0")

		stdout, stderr, exitCode, err := runShim(h, shimPath, "@update")
		if err != nil || exitCode != 0 {
			t.Fatalf("@update failed: %v\nexitCode: %d\nstdout: %s\nstderr: %s", err, exitCode, stdout, stderr)
		}
		want := "[update] [" + toolName + "] Tool \"" + toolName + "\" is pinned to version `2.0.0` by its \"version\" install parameter. " +
			"Set \"version\" to \"latest\" in the tool config to enable updates"
		if !strings.Contains(stderr, want) {
			t.Errorf("stderr does not contain the refusal %q:\n%s", want, stderr)
		}
		if strings.Contains(stderr, "New version available") || strings.Contains(stderr, "Successfully updated") {
			t.Errorf("stderr reports an update of a pinned tool:\n%s", stderr)
		}
		if stdout != "" {
			t.Errorf("stdout = %q, want nothing: the shim prints nothing of its own for @update", stdout)
		}
		h.AssertDBToolInstalled(toolName, "2.0.0")
	})
}
