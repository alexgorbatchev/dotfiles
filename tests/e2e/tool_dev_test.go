package e2e

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestE2EDevelopmentOverrideLifecycle(t *testing.T) {
	var requests atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		fmt.Fprint(w, "#!/bin/sh\necho release-build\n")
	}))
	defer server.Close()
	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		ConfigContent: `export default { paths: {
  generatedDir: "./.generated", homeDir: "./home", targetDir: "./bin", toolConfigsDir: "./tools"
} };`,
		Env: map[string]string{"DOTFILES_E2E_USE_REAL_INSTALLERS": "true", "DOTFILES_GITHUB_HOST": server.URL},
	})
	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatal(err)
	}
	definition := fmt.Sprintf(`import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool(install => install("curl-binary", {url: %q}).bin("probe").version("1.0.0"));`, server.URL+"/probe")
	if err := os.WriteFile(filepath.Join(toolsDir, "probe.tool.ts"), []byte(definition), 0644); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) string {
		t.Helper()
		stdout, stderr, code, err := h.RunCommand(append([]string{"--config", h.ConfigPath}, args...)...)
		if err != nil || code != 0 {
			t.Fatalf("%v: code %d, %v\n%s%s", args, code, err, stdout, stderr)
		}
		return stdout + stderr
	}
	run("tool", "install", "probe")
	h.AssertDBToolInstalled("probe", "1.0.0")
	initialRequests := requests.Load()
	if initialRequests == 0 {
		t.Fatal("release was not installed through the local upstream")
	}
	source := filepath.Join(h.TempDir, "local-probe")
	if err := os.WriteFile(source, []byte("#!/bin/sh\necho development-build\n"), 0755); err != nil {
		t.Fatal(err)
	}
	use := []string{"tool", "dev", "use", "probe", "--bin", "probe=" + source, "--version", "local.1"}
	run(append(use, "--dry-run")...)
	store := devtools.New(fs.NewOSFS(), filepath.Join(h.TempDir, ".generated", "dev-tools"))
	if record, err := store.Lookup("probe"); err != nil || record != nil {
		t.Fatalf("dry-run registered a build: %#v, %v", record, err)
	}
	run(use...)
	record, err := store.Lookup("probe")
	if err != nil || record == nil {
		t.Fatalf("development record = %#v, %v", record, err)
	}
	run("tool", "dev", "off", "probe", "--dry-run")
	if after, err := store.Lookup("probe"); err != nil || !reflect.DeepEqual(record, after) {
		t.Fatalf("dry-run deactivated the build: %#v, %v", after, err)
	}
	if err := os.Remove(source); err != nil {
		t.Fatal(err)
	}
	shim := filepath.Join(h.TempDir, "bin", "probe")
	assertShim := func(want string) {
		t.Helper()
		stdout, stderr, code, err := runShim(h, shim)
		if err != nil || code != 0 || strings.TrimSpace(stdout) != want {
			t.Fatalf("shim: code %d, %v\n%s%s; want %q", code, err, stdout, stderr, want)
		}
	}
	assertShim("development-build")
	for _, args := range [][]string{
		{"tool", "install", "probe", "--force"},
		{"tool", "update", "probe", "--force"},
		{"tool", "uninstall", "probe"},
		{"state", "generate"},
		{"state", "cleanup"},
		{"cache", "clear"},
	} {
		run(args...)
		assertShim("development-build")
	}
	if stdout, stderr, code, err := runShim(h, shim, "@update"); err != nil || code != 0 {
		t.Fatalf("shim @update: code %d, %v\n%s%s", code, err, stdout, stderr)
	}
	assertShim("development-build")
	h.AssertDBToolInstalled("probe", "1.0.0")
	if requests.Load() != initialRequests {
		t.Fatalf("maintenance queried upstream while development was active: %d -> %d requests", initialRequests, requests.Load())
	}
	if err := os.Remove(record.Binaries["probe"]); err != nil {
		t.Fatal(err)
	}
	stdout, stderr, code, err := runShim(h, shim)
	if err != nil || code == 0 || !strings.Contains(strings.ToLower(stdout+stderr), "development") {
		t.Fatalf("missing build silently fell back: code %d, %v\n%s%s", code, err, stdout, stderr)
	}
	stdout, stderr, code, err = h.RunCommand("--config", h.ConfigPath, "tool", "install", "probe", "--force")
	if err != nil || code == 0 || !strings.Contains(stderr, "development executable") {
		t.Fatalf("missing build was not reported: code %d, %v\n%s%s", code, err, stdout, stderr)
	}
	if requests.Load() != initialRequests {
		t.Fatal("missing development build triggered release installation")
	}
	run("tool", "dev", "off", "probe")
	assertShim("release-build")
	h.AssertDBToolInstalled("probe", "1.0.0")

	// Direct execution of the copied CLI has no default-named project config in
	// its working directory. Ownership must still stop self replacement.
	run("tool", "dev", "use", "dotfiles", "--bin", "dotfiles="+h.BinPath)
	cliRecord, err := store.Lookup("dotfiles")
	if err != nil || cliRecord == nil {
		t.Fatalf("CLI development record = %#v, %v", cliRecord, err)
	}
	stdout, stderr, code, err = runShim(h, cliRecord.Binaries["dotfiles"], "self", "upgrade", "0.0.1", "--force")
	if err != nil || code != 0 || !strings.Contains(stderr, "Development build active") || requests.Load() != initialRequests {
		t.Fatalf("direct development CLI upgraded itself: code %d, %v\n%s%s", code, err, stdout, stderr)
	}
}
