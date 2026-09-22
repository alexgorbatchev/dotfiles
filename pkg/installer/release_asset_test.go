package installer

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
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

func TestPrepareDestDir(t *testing.T) {
	memFS := fs.NewMemFS()

	dir, err := prepareDestDir(memFS, "/custom/bin")
	if err != nil || dir != "/custom/bin" {
		t.Fatalf("prepareDestDir(/custom/bin) = %q, %v; want /custom/bin", dir, err)
	}
	exists, err := memFS.Exists("/custom/bin")
	if err != nil || !exists {
		t.Errorf("expected /custom/bin to exist")
	}

	tempDir, err := prepareDestDir(memFS, "")
	if err != nil || tempDir == "" {
		t.Fatalf("prepareDestDir(\"\") = %q, %v; want non-empty tempDir", tempDir, err)
	}

	badFS := &mockErrorFS{FS: memFS}
	_, err = prepareDestDir(badFS, "/readonly/bin")
	if err == nil {
		t.Errorf("expected prepareDestDir on failing fs to fail")
	}
}

func TestMatchReleaseAsset(t *testing.T) {
	type asset struct {
		Name string
	}
	nameFn := func(a asset) string { return a.Name }
	sysInfoLinux := arch.SystemInfo{OS: "linux", Arch: "amd64"}

	tests := []struct {
		name         string
		assets       []asset
		sysInfo      arch.SystemInfo
		assetPattern string
		wantName     string
		wantNil      bool
	}{
		{
			name:         "empty asset list",
			assets:       nil,
			sysInfo:      sysInfoLinux,
			assetPattern: "",
			wantNil:      true,
		},
		{
			name: "pattern with no matching candidates",
			assets: []asset{
				{Name: "tool-linux-amd64.tar.gz"},
			},
			sysInfo:      sysInfoLinux,
			assetPattern: "*.zip",
			wantNil:      true,
		},
		{
			name: "pattern matches but no strict platform match -> fallback to first candidate",
			assets: []asset{
				{Name: "tool-universal.zip"},
				{Name: "tool-extra.zip"},
			},
			sysInfo:      sysInfoLinux,
			assetPattern: "*.zip",
			wantName:     "tool-universal.zip",
		},
		{
			name: "strict platform match found without pattern",
			assets: []asset{
				{Name: "tool-darwin-arm64.tar.gz"},
				{Name: "tool-linux-amd64.tar.gz"},
				{Name: "tool-windows-amd64.zip"},
			},
			sysInfo:      sysInfoLinux,
			assetPattern: "",
			wantName:     "tool-linux-amd64.tar.gz",
		},
		{
			name: "pattern filter narrows before platform matching",
			assets: []asset{
				{Name: "tool-linux-amd64.deb"},
				{Name: "tool-linux-amd64.tar.gz"},
			},
			sysInfo:      sysInfoLinux,
			assetPattern: "*.tar.gz",
			wantName:     "tool-linux-amd64.tar.gz",
		},
		{
			name: "universal or architecture-agnostic asset matched without pattern (onefetch macOS)",
			assets: []asset{
				{Name: "onefetch-linux.tar.gz"},
				{Name: "onefetch-mac.tar.gz"},
				{Name: "onefetch-setup.exe"},
				{Name: "onefetch-win.tar.gz"},
				{Name: "onefetch_amd64.deb"},
			},
			sysInfo:      arch.SystemInfo{OS: "darwin", Arch: "arm64"},
			assetPattern: "",
			wantName:     "onefetch-mac.tar.gz",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchReleaseAsset(tt.assets, nameFn, tt.sysInfo, tt.assetPattern)
			if tt.wantNil {
				if got != nil {
					t.Fatalf("matchReleaseAsset = %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("matchReleaseAsset = nil, want %q", tt.wantName)
			}
			if got.Name != tt.wantName {
				t.Fatalf("matchReleaseAsset = %q, want %q", got.Name, tt.wantName)
			}
		})
	}
}

func TestGiteaInstaller_MatchAssetMethod(t *testing.T) {
	inst := NewGiteaInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, &SystemContext{OS: "linux", Arch: "amd64"})
	assets := []giteaAsset{
		{Name: "tool-linux-amd64.tar.gz"},
		{Name: "tool-darwin-arm64.tar.gz"},
	}

	matched := inst.matchAsset(assets, "")
	if matched == nil || matched.Name != "tool-linux-amd64.tar.gz" {
		t.Errorf("inst.matchAsset = %v, want tool-linux-amd64.tar.gz", matched)
	}

	instNilCtx := NewGiteaInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, nil)
	_ = instNilCtx.matchAsset(assets, "")
}

func TestGitHubInstaller_MatchAssetNilContext(t *testing.T) {
	instNilCtx := NewGitHubInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, nil)
	assets := []githubAsset{
		{Name: "tool-linux-amd64.tar.gz"},
	}
	_ = instNilCtx.matchAsset(assets, "")
}

func TestSelectReleaseAsset(t *testing.T) {
	type asset struct {
		Name string
	}
	nameFn := func(a asset) string { return a.Name }
	sysCtx := &SystemContext{OS: "linux", Arch: "amd64"}

	t.Run("no asset found returns descriptive error", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "mytool"}
		_, err := selectReleaseAsset(context.Background(), releaseAssetSelection[asset]{
			Tool:         tool,
			SysCtx:       sysCtx,
			ReleaseTag:   "v1.0.0",
			Assets:       []asset{{Name: "mytool-windows-amd64.exe"}},
			AssetName:    nameFn,
			AssetPattern: "*.tar.gz",
		})
		if err == nil {
			t.Fatal("expected error for unmatched asset, got nil")
		}
		wantSubstr := `no compatible asset found for release "v1.0.0" matching linux/amd64 and pattern *.tar.gz`
		if err.Error() != wantSubstr {
			t.Errorf("error = %q, want %q", err.Error(), wantSubstr)
		}
	})

	t.Run("nil sysCtx defaults properly", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "mytool"}
		_, err := selectReleaseAsset(context.Background(), releaseAssetSelection[asset]{
			Tool:       tool,
			SysCtx:     nil,
			ReleaseTag: "v1.0.0",
			Assets:     []asset{{Name: "nonexistent"}},
			AssetName:  nameFn,
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
