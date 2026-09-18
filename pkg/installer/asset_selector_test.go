package installer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// writeSelectorTool puts a tool file on disk and returns a configuration that records
// the resolver the loader would have recorded for it.
func writeSelectorTool(t *testing.T, name, body string, resolver string, params map[string]any) *config.ToolConfig {
	t.Helper()
	dir := t.TempDir()
	toolPath := filepath.Join(dir, name+".tool.ts")
	if err := os.WriteFile(toolPath, []byte(body), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}
	if params == nil {
		params = map[string]any{}
	}
	params["resolvers"] = []any{resolver}
	return &config.ToolConfig{Name: name, ConfigFilePath: toolPath, InstallParams: params}
}

// selectorReleaseServer answers the release API with the given assets, serves each
// asset's bytes from the same host, and records which ones were actually fetched --
// which is how a test tells what the selector chose, since the installer renames what
// it downloads to the binary's name.
type selectorServer struct {
	*httptest.Server
	mu        sync.Mutex
	downloads []string
}

func (s *selectorServer) fetched() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.downloads...)
}

func selectorReleaseServer(t *testing.T, tagName string, assetNames []string) *selectorServer {
	t.Helper()
	recorder := &selectorServer{}
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if name, found := strings.CutPrefix(r.URL.Path, "/assets/"); found {
			recorder.mu.Lock()
			recorder.downloads = append(recorder.downloads, name)
			recorder.mu.Unlock()
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("binary payload"))
			return
		}
		assets := make([]map[string]any, 0, len(assetNames))
		for i, name := range assetNames {
			assets = append(assets, map[string]any{
				"id":                   i + 1,
				"name":                 name,
				"browser_download_url": server.URL + "/assets/" + name,
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":         1,
			"tag_name":   tagName,
			"name":       tagName,
			"prerelease": false,
			"draft":      false,
			"assets":     assets,
		})
	}))
	t.Cleanup(server.Close)
	recorder.Server = server
	return recorder
}

// v1's assetSelector could decide on the whole set of assets at once -- "prefer the
// musl build when the release ships one" -- which no per-filename pattern expresses.
func TestGitHubInstaller_AssetSelectorChoosesTheAsset(t *testing.T) {
	server := selectorReleaseServer(t, "v1.2.3", []string{
		"tool-x86_64-unknown-linux-gnu",
		"tool-x86_64-unknown-linux-musl",
		"tool-checksums.txt",
	})

	tool := writeSelectorTool(t, "picky", `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("github-release", {
				repo: "owner/picky",
				assetSelector: ({ assets, release }) => {
					if (release.tag_name !== "v1.2.3") return undefined;
					return assets.find((a) => a.name.endsWith("musl")) ?? assets.find((a) => a.name.endsWith("gnu"));
				},
			}).bin("picky"),
		);
	`, assetSelectorParam, map[string]any{"repo": "owner/picky"})

	fsys := fs.NewMemFS()
	inst := &GitHubInstaller{
		runner:     exec.NewMockRunner(),
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, exec.NewMockRunner()),
		sysCtx:     &SystemContext{OS: "linux", Arch: "amd64"},
		httpClient: server.Client(),
		BaseURL:    server.URL,
		BinDir:     "/staging",
	}

	if _, err := inst.Install(context.Background(), tool); err != nil {
		t.Fatalf("Install returned error: %v", err)
	}

	// The selector's choice is what was fetched, not what the platform matcher would
	// have picked on its own -- it prefers the gnu build on a glibc host.
	fetched := server.fetched()
	if len(fetched) != 1 || fetched[0] != "tool-x86_64-unknown-linux-musl" {
		t.Errorf("fetched %v, want only the asset the selector chose", fetched)
	}
}

// A selector that returns nothing must fail loudly. Falling back to the built-in
// matcher would install a different asset than the author asked for.
func TestGitHubInstaller_AssetSelectorChoosingNothingFails(t *testing.T) {
	server := selectorReleaseServer(t, "v1.0.0", []string{"tool-linux-amd64.tar.gz"})

	tool := writeSelectorTool(t, "fussy", `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("github-release", {
				repo: "owner/fussy",
				assetSelector: () => undefined,
			}).bin("fussy"),
		);
	`, assetSelectorParam, map[string]any{"repo": "owner/fussy"})

	fsys := fs.NewMemFS()
	inst := &GitHubInstaller{
		runner:     exec.NewMockRunner(),
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, exec.NewMockRunner()),
		sysCtx:     &SystemContext{OS: "linux", Arch: "amd64"},
		httpClient: server.Client(),
		BaseURL:    server.URL,
		BinDir:     "/staging",
	}

	_, err := inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatalf("expected the installation to fail when the selector chose nothing")
	}
	if !strings.Contains(err.Error(), "chose no asset") {
		t.Errorf("error = %v, want it to say the selector chose nothing", err)
	}
	if !strings.Contains(err.Error(), "tool-linux-amd64.tar.gz") {
		t.Errorf("error = %v, want it to list what the release offered", err)
	}
}

// Naming something the release does not have is a mistake in the selector, not a
// reason to download a different file.
func TestGitHubInstaller_AssetSelectorChoosingAnUnknownAssetFails(t *testing.T) {
	server := selectorReleaseServer(t, "v1.0.0", []string{"tool-linux-amd64.tar.gz"})

	tool := writeSelectorTool(t, "astray", `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("github-release", {
				repo: "owner/astray",
				assetSelector: () => ({ name: "not-in-this-release.tar.gz", browser_download_url: "", id: 0 }),
			}).bin("astray"),
		);
	`, assetSelectorParam, map[string]any{"repo": "owner/astray"})

	fsys := fs.NewMemFS()
	inst := &GitHubInstaller{
		runner:     exec.NewMockRunner(),
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, exec.NewMockRunner()),
		sysCtx:     &SystemContext{OS: "linux", Arch: "amd64"},
		httpClient: server.Client(),
		BaseURL:    server.URL,
		BinDir:     "/staging",
	}

	_, err := inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatalf("expected the installation to fail on an asset the release does not have")
	}
	if !strings.Contains(err.Error(), "not-in-this-release.tar.gz") {
		t.Errorf("error = %v, want it to name what the selector chose", err)
	}
}

// gitea-release takes the same callback as github-release.
func TestGiteaInstaller_AssetSelectorChoosesTheAsset(t *testing.T) {
	server := selectorReleaseServer(t, "v2.0.0", []string{"tool-linux-amd64", "tool-linux-amd64-static"})

	tool := writeSelectorTool(t, "codeberg-tool", `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("gitea-release", {
				instanceUrl: "https://codeberg.org",
				repo: "owner/codeberg-tool",
				assetSelector: ({ assets }) => assets.find((a) => a.name.endsWith("-static")),
			}).bin("codeberg-tool"),
		);
	`, assetSelectorParam, map[string]any{
		"instanceUrl": server.URL,
		"repo":        "owner/codeberg-tool",
	})

	fsys := fs.NewMemFS()
	inst := &GiteaInstaller{
		runner:     exec.NewMockRunner(),
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, exec.NewMockRunner()),
		sysCtx:     &SystemContext{OS: "linux", Arch: "amd64"},
		httpClient: server.Client(),
		BinDir:     "/staging",
	}

	if _, err := inst.Install(context.Background(), tool); err != nil {
		t.Fatalf("Install returned error: %v", err)
	}
	fetched := server.fetched()
	if len(fetched) != 1 || fetched[0] != "tool-linux-amd64-static" {
		t.Errorf("fetched %v, want only the asset the selector chose", fetched)
	}
}

// For dmg and pkg the callback sits inside `source`, next to the repository it
// selects from.
func TestMacPackageFetcher_SourceAssetSelectorChoosesTheAsset(t *testing.T) {
	server := selectorReleaseServer(t, "v3.0.0", []string{"Tool-universal.dmg", "Tool-intel.dmg"})

	tool := writeSelectorTool(t, "macapp", `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("dmg", {
				source: {
					type: "github-release",
					repo: "owner/macapp",
					assetSelector: ({ assets }) => assets.find((a) => a.name.includes("universal")),
				},
			}).bin("macapp"),
		);
	`, sourceAssetSelectorParam, map[string]any{
		"source": map[string]any{"type": "github-release", "repo": "owner/macapp"},
	})

	src, err := parseMacPackageSource(tool.InstallParams)
	if err != nil {
		t.Fatalf("parsing the source: %v", err)
	}

	fsys := fs.NewMemFS()
	fetcher := macPackageFetcher{
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, exec.NewMockRunner()),
		runner:     exec.NewMockRunner(),
		httpClient: server.Client(),
		baseURL:    server.URL,
		sysCtx:     &SystemContext{OS: "darwin", Arch: "arm64"},
	}

	// The arm64 build is listed last on purpose: the built-in matcher, which finds no
	// macOS or arm64 marker in either name, would settle on the first package, so a
	// test passing here can only be the selector's doing.
	release := &githubRelease{
		TagName: "v3.0.0",
		Assets: []githubAsset{
			{ID: 1, Name: "Tool-intel.dmg", BrowserDownloadURL: server.URL + "/assets/Tool-intel.dmg"},
			{ID: 2, Name: "Tool-universal.dmg", BrowserDownloadURL: server.URL + "/assets/Tool-universal.dmg"},
		},
	}

	matched, err := fetcher.selectAsset(context.Background(), tool, release, src, ".dmg")
	if err != nil {
		t.Fatalf("selectAsset returned error: %v", err)
	}
	if matched.Name != "Tool-universal.dmg" {
		t.Errorf("selected asset = %q, want %q", matched.Name, "Tool-universal.dmg")
	}
}

// Without a selector the built-in matcher still decides, so the callback is an
// addition rather than a replacement.
func TestMacPackageFetcher_FallsBackToTheBuiltInMatcher(t *testing.T) {
	fetcher := macPackageFetcher{sysCtx: &SystemContext{OS: "darwin", Arch: "arm64"}}
	release := &githubRelease{
		TagName: "v3.0.0",
		Assets: []githubAsset{
			{Name: "Tool-darwin-x86_64.dmg"},
			{Name: "Tool-darwin-arm64.dmg"},
		},
	}

	matched, err := fetcher.selectAsset(context.Background(), &config.ToolConfig{Name: "macapp"}, release, macPackageSource{repo: "owner/macapp"}, ".dmg")
	if err != nil {
		t.Fatalf("selectAsset returned error: %v", err)
	}
	if matched.Name != "Tool-darwin-arm64.dmg" {
		t.Errorf("selected asset = %q, want the arm64 build", matched.Name)
	}
}
