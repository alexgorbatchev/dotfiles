package e2e

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func createToolchainTarGz(t *testing.T) []byte {
	t.Helper()
	tmpDir := t.TempDir()
	tarPath := filepath.Join(tmpDir, "toolchain.tar.gz")

	f, err := os.Create(tarPath)
	if err != nil {
		t.Fatalf("creating temp tar.gz: %v", err)
	}

	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)

	// Binary script that resolves physical symlinks to check if its sibling ../lib/marker file exists
	binScript := "#!/bin/sh\nPRG=\"$0\"\nwhile [ -h \"$PRG\" ]; do\n  DIR=$(dirname \"$PRG\")\n  TARGET=$(readlink \"$PRG\")\n  if [ \"${TARGET#/}\" = \"$TARGET\" ]; then\n    PRG=\"$DIR/$TARGET\"\n  else\n    PRG=\"$TARGET\"\n  fi\ndone\nSCRIPT_DIR=$(cd \"$(dirname \"$PRG\")\" && pwd -P)\nif [ -f \"$SCRIPT_DIR/../lib/marker\" ]; then\n  echo \"TOOLCHAIN_HEALTHY\"\nelse\n  echo \"TOOLCHAIN_BROKEN: lib/marker missing relative to binary\"\n  exit 1\nfi\n"

	files := map[string]string{
		"mytool-root/bin/mytool": binScript,
		"mytool-root/lib/marker": "lib-data",
	}

	for name, content := range files {
		hdr := &tar.Header{
			Name: name,
			Mode: 0755,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("writing header: %v", err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("writing body: %v", err)
		}
	}

	_ = tw.Close()
	_ = gw.Close()
	_ = f.Close()

	data, err := os.ReadFile(tarPath)
	if err != nil {
		t.Fatalf("reading tar.gz data: %v", err)
	}
	return data
}

func TestE2ENestedToolchain(t *testing.T) {
	t.Parallel()

	tarData := createToolchainTarGz(t)

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

	// Create tools/toolchain.tool.ts
	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools directory: %v", err)
	}

	toolContent := fmt.Sprintf(`
import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("curl-tar", {
    url: %q,
  }).bin("mytool", "mytool-root/bin/mytool")
);
`, server.URL)

	if err := os.WriteFile(filepath.Join(toolsDir, "toolchain.tool.ts"), []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing toolchain.tool.ts: %v", err)
	}

	// 1. Generate shims
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// 2. Install nested toolchain tool using real installer
	stdout, stderr, exitCode, err = h.Install([]string{"toolchain"})
	if err != nil || exitCode != 0 {
		t.Fatalf("install toolchain failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// 3. Execute generated shim directly and verify it finds its relative toolchain library folder
	shimPath := filepath.Join(h.TempDir, ".generated", "bin", "mytool")
	cmd := exec.Command(shimPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("executing mytool shim failed: %v\noutput: %s", err, string(out))
	}

	if !strings.Contains(string(out), "TOOLCHAIN_HEALTHY") {
		t.Errorf("expected output to contain TOOLCHAIN_HEALTHY, got:\n%s", string(out))
	}
}
