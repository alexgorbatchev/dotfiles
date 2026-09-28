package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestE2EToolInstallExecutesDefineToolBodyOnce verifies that `dotfiles tool install`
// executes the defineTool body exactly once, retaining the load-time VM for lifecycle
// hooks so that defineTool closures are preserved and side effects do not repeat.
func TestE2EToolInstallExecutesDefineToolBodyOnce(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.CopyFixture("main")

	toolContent := `
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) => {
  ctx.log.info("DEFINETOOL_BODY_EVALUATION_TOKEN");
  return install("manual")
    .hook("before-install", async ({ log }) => {
      log.info("BEFORE_INSTALL_HOOK_EXECUTED");
    })
    .hook("after-install", async ({ log }) => {
      log.info("AFTER_INSTALL_HOOK_EXECUTED");
    });
});
`
	toolPath := filepath.Join(h.TempDir, "tools", "eval-once-test.tool.ts")
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing test tool: %v", err)
	}

	stdout, stderr, exitCode, err := h.Install([]string{"eval-once-test"})
	if err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	combinedOutput := stdout + "\n" + stderr

	if !strings.Contains(combinedOutput, "BEFORE_INSTALL_HOOK_EXECUTED") {
		t.Errorf("expected before-install hook to run, output:\n%s", combinedOutput)
	}
	if !strings.Contains(combinedOutput, "AFTER_INSTALL_HOOK_EXECUTED") {
		t.Errorf("expected after-install hook to run, output:\n%s", combinedOutput)
	}

	tokenCount := strings.Count(combinedOutput, "DEFINETOOL_BODY_EVALUATION_TOKEN")
	if tokenCount != 1 {
		t.Errorf("expected defineTool body to execute exactly once during install, got %d times. Output:\n%s", tokenCount, combinedOutput)
	}
}
