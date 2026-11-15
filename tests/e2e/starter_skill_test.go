package e2e

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
)

// Serve the newly built CLI as the release asset so the starter's hook must run
// the actual promoted binary and export its own embedded skill, without network.
func TestE2EStarterDotfilesRefreshesSkill(t *testing.T) {
	h := NewTestHarness(t, HarnessOptions{Env: map[string]string{"DOTFILES_E2E_USE_REAL_INSTALLERS": "true"}})
	payload, err := os.ReadFile(h.BinPath)
	if err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	compressed := gzip.NewWriter(&archive)
	tarball := tar.NewWriter(compressed)
	if err := tarball.WriteHeader(&tar.Header{Name: "dotfiles", Size: int64(len(payload)), Mode: 0755}); err != nil {
		t.Fatal(err)
	}
	if _, err := tarball.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := tarball.Close(); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	var release atomic.Int32
	release.Store(1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".tar.gz") {
			_, _ = w.Write(archive.Bytes())
			return
		}
		version := fmt.Sprintf("%d.0.0", release.Load())
		assetURL := "http://" + r.Host + "/dotfiles_" + version + "_linux_amd64.tar.gz"
		_ = json.NewEncoder(w).Encode(map[string]any{"tag_name": "v" + version, "assets": []map[string]any{{"id": 1, "name": "dotfiles_" + version + "_linux_amd64.tar.gz", "size": archive.Len(), "browser_download_url": assetURL}}})
	}))
	t.Cleanup(server.Close)
	project := filepath.Join(h.TempDir, "configured project's $literal")
	cfg := map[string]any{
		"paths":      map[string]any{"dotfilesDir": project, "homeDir": filepath.Join(h.TempDir, "home"), "generatedDir": filepath.Join(project, "generated"), "targetDir": filepath.Join(project, "bin"), "binariesDir": filepath.Join(project, "binaries"), "toolConfigsDir": filepath.Join(project, "tools")},
		"github":     map[string]any{"host": server.URL, "cache": map[string]any{"enabled": false}},
		"downloader": map[string]any{"cache": map[string]any{"enabled": false}},
	}
	encoded, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(h.ConfigPath, append([]byte("export default "), append(encoded, ';')...), 0644); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) (string, int) {
		t.Helper()
		args = append(args, "--config", h.ConfigPath, "--platform", "linux", "--arch", "amd64")
		stdout, stderr, code, err := h.RunCommand(args...)
		if err != nil {
			t.Fatal(err)
		}
		return stdout + stderr, code
	}
	if output, code := run("tool", "scaffold"); code != 0 {
		t.Fatalf("scaffold: %d %s", code, output)
	}
	exported := filepath.Join(project, ".agents", "skills", "dotfiles", "SKILL.md")
	want, err := embedded.SkillFS.ReadFile("skill/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	assertExport := func() {
		t.Helper()
		got, err := os.ReadFile(exported)
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("skill differs from installed binary: %v", err)
		}
		if _, err := os.Stat(filepath.Join(h.TempDir, ".agents")); !os.IsNotExist(err) {
			t.Fatalf("export used process directory: %v", err)
		}
	}
	if output, code := run("tool", "install", "dotfiles"); code != 0 {
		t.Fatalf("install: %d %s", code, output)
	}
	assertExport()
	if err := os.WriteFile(exported, []byte("stale skill"), 0644); err != nil {
		t.Fatal(err)
	}
	if output, code := run("tool", "install", "dotfiles", "--force"); code != 0 {
		t.Fatalf("reinstall: %d %s", code, output)
	}
	assertExport()
	if err := os.WriteFile(exported, []byte("stale skill"), 0644); err != nil {
		t.Fatal(err)
	}
	if output, code := run("tool", "install", "dotfiles", "--force", "--dry-run"); code != 0 {
		t.Fatalf("dry run: %d %s", code, output)
	}
	if got, err := os.ReadFile(exported); err != nil || string(got) != "stale skill" {
		t.Fatalf("dry run changed exported skill: %v", err)
	}
	release.Store(2)
	if output, code := run("tool", "update", "dotfiles"); code != 0 {
		t.Fatalf("update: %d %s", code, output)
	}
	assertExport()
	if err := os.Remove(exported); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(exported, 0755); err != nil {
		t.Fatal(err)
	}
	release.Store(3)
	if output, code := run("tool", "update", "dotfiles"); code == 0 || !strings.Contains(output, "after-install") || !strings.Contains(output, "extracting embedded skill") {
		t.Fatalf("export failure hidden: %d %s", code, output)
	}
}
