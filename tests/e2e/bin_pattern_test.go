package e2e

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// TestE2EBinGlobPattern installs an archive laid out as mytool-1.2.3/bin/mytool through
// .bin("mytool", "mytool-*/bin/mytool"): the glob has to resolve the versioned directory
// and the promoted binary has to keep finding its lib directory relative to itself.
func TestE2EBinGlobPattern(t *testing.T) {
	t.Parallel()

	tarData := createToolchainTarGz(t, "mytool-1.2.3")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(tarData)
	}))
	defer server.Close()

	h := NewTestHarness(t, HarnessOptions{
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
		ConfigContent: `
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    generatedDir: configFileDir + "/.generated",
    toolConfigsDir: configFileDir + "/tools",
  },
}));
`,
	})

	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools directory: %v", err)
	}

	toolContent := fmt.Sprintf(`
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("curl-tar", {
    url: %q,
  }).bin("mytool", "mytool-*/bin/mytool")
);
`, server.URL)

	if err := os.WriteFile(filepath.Join(toolsDir, "glob-toolchain.tool.ts"), []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing glob-toolchain.tool.ts: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	stdout, stderr, exitCode, err = h.Install([]string{"glob-toolchain"})
	if err != nil || exitCode != 0 {
		t.Fatalf("install glob-toolchain failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	promoted := filepath.Join(h.TempDir, ".generated", "binaries", "glob-toolchain", "current", "mytool")
	target, err := os.Readlink(promoted)
	if err != nil {
		t.Fatalf("expected the promoted binary to be a symlink into the archive layout: %v", err)
	}
	if want := filepath.Join("mytool-1.2.3", "bin", "mytool"); target != want {
		t.Fatalf("promoted binary links to %q, want %q", target, want)
	}

	shimPath := filepath.Join(h.TempDir, ".generated", "bin", "mytool")
	out, err := exec.Command(shimPath).CombinedOutput()
	if err != nil {
		t.Fatalf("executing mytool shim failed: %v\noutput: %s", err, string(out))
	}
	if !strings.Contains(string(out), "TOOLCHAIN_HEALTHY") {
		t.Errorf("expected output to contain TOOLCHAIN_HEALTHY, got:\n%s", string(out))
	}
}
