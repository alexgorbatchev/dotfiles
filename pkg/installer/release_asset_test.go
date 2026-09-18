package installer

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// mdTuiAssets is the asset list of henriklovhaug/md-tui v0.10.4, a cargo-dist release
// that ships a raw self-updater beside every tarball. Recorded with
// `gh release view --repo henriklovhaug/md-tui v0.10.4 --json assets`.
var mdTuiAssets = []string{
	"dist-manifest.json",
	"md-tui-aarch64-apple-darwin-update",
	"md-tui-aarch64-apple-darwin.tar.xz",
	"md-tui-aarch64-apple-darwin.tar.xz.sha256",
	"md-tui-aarch64-unknown-linux-gnu-update",
	"md-tui-aarch64-unknown-linux-gnu.tar.xz",
	"md-tui-aarch64-unknown-linux-gnu.tar.xz.sha256",
	"md-tui-installer.ps1",
	"md-tui-installer.sh",
	"md-tui-x86_64-apple-darwin-update",
	"md-tui-x86_64-apple-darwin.tar.xz",
	"md-tui-x86_64-apple-darwin.tar.xz.sha256",
	"md-tui-x86_64-pc-windows-msvc-update",
	"md-tui-x86_64-pc-windows-msvc.zip",
	"md-tui-x86_64-pc-windows-msvc.zip.sha256",
	"md-tui-x86_64-unknown-linux-gnu-update",
	"md-tui-x86_64-unknown-linux-gnu.tar.xz",
	"md-tui-x86_64-unknown-linux-gnu.tar.xz.sha256",
	"md-tui-x86_64-unknown-linux-musl-update",
	"md-tui-x86_64-unknown-linux-musl.tar.xz",
	"md-tui-x86_64-unknown-linux-musl.tar.xz.sha256",
	"sha256.sum",
	"source.tar.gz",
	"source.tar.gz.sha256",
}

// releaseServer serves one release for both the GitHub and the Gitea API paths, hands out
// the same payload for every asset download, and records which asset was downloaded.
type releaseServer struct {
	*httptest.Server
	mu         sync.Mutex
	downloaded []string
}

func newReleaseServer(t *testing.T, tag string, assetNames []string, payload []byte) *releaseServer {
	t.Helper()
	rs := &releaseServer{}
	rs.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/owner/tool/releases/latest", "/api/v1/repos/owner/tool/releases/latest":
			assets := make([]map[string]any, 0, len(assetNames))
			for i, name := range assetNames {
				assets = append(assets, map[string]any{
					"id":                   i + 1,
					"name":                 name,
					"browser_download_url": "http://" + r.Host + "/download/" + name,
				})
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"id": 1, "tag_name": tag, "assets": assets})
		default:
			const prefix = "/download/"
			if len(r.URL.Path) <= len(prefix) || r.URL.Path[:len(prefix)] != prefix {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			rs.mu.Lock()
			rs.downloaded = append(rs.downloaded, r.URL.Path[len(prefix):])
			rs.mu.Unlock()
			_, _ = w.Write(payload)
		}
	}))
	t.Cleanup(rs.Close)
	return rs
}

func (rs *releaseServer) downloads() []string {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	return append([]string(nil), rs.downloaded...)
}

// createTarBytes builds an uncompressed tar whose regular files are executable.
func createTarBytes(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	for name, content := range files {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0755, Size: int64(len(content))}); err != nil {
			t.Fatalf("writing tar header %q: %v", name, err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("writing tar entry %q: %v", name, err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("closing tar: %v", err)
	}
	return buf.Bytes()
}

func createZipBytes(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range files {
		f, err := zw.Create(name)
		if err != nil {
			t.Fatalf("creating zip entry %q: %v", name, err)
		}
		if _, err := f.Write([]byte(content)); err != nil {
			t.Fatalf("writing zip entry %q: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("closing zip: %v", err)
	}
	return buf.Bytes()
}

// mockXz makes the runner's "xz" emit tarBytes on stdout, which is what the extractor
// pipes into its tar reader for .tar.xz and .txz archives. The bytes fed to xz are
// irrelevant, so the tests never depend on a system xz binary.
func mockXz(runner *exec.MockRunner, tarBytes []byte) {
	runner.RegisterFunc("xz", func(c *exec.MockCmd) error {
		if c.Stdout() == nil {
			return nil
		}
		_, err := c.Stdout().Write(tarBytes)
		return err
	})
}
