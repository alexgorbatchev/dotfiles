package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type giteaAsset struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type giteaRelease struct {
	ID         int64        `json:"id"`
	TagName    string       `json:"tag_name"`
	Name       string       `json:"name"`
	Prerelease bool         `json:"prerelease"`
	Assets     []giteaAsset `json:"assets"`
}

type GiteaInstaller struct {
	log        *logger.Logger
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	BinDir     string // Destination folder
}

func NewGiteaInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *GiteaInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &GiteaInstaller{
		runner:     runner,
		fsys:       fsys,
		dl:         dl,
		extractor:  extractor,
		sysCtx:     sysCtx,
		httpClient: http.DefaultClient,
	}
}

func (g *GiteaInstaller) Name() string {
	return "gitea-release"
}

func (g *GiteaInstaller) SupportsSudo() bool {
	return false
}

func (g *GiteaInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if g.sysCtx == nil {
		g.sysCtx = NewDefaultSystemContext()
	}
	instanceURL := getStringParam(tool.InstallParams, "instanceUrl", "https://codeberg.org")
	repo := getStringParam(tool.InstallParams, "repo", "")
	if repo == "" {
		return nil, fmt.Errorf("repository 'repo' is required in installParams")
	}

	parts := strings.Split(repo, "/")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid repository format %q. Expected 'owner/repo'", repo)
	}

	version := "latest"
	if tool.Version != nil {
		version = *tool.Version
	}

	// Fetch release info from Gitea API
	normalizedURL := strings.TrimSuffix(instanceURL, "/")
	apiURL := fmt.Sprintf("%s/api/v1/repos/%s/releases/latest", normalizedURL, repo)
	if version != "latest" {
		apiURL = fmt.Sprintf("%s/api/v1/repos/%s/releases/tags/%s", normalizedURL, repo, version)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating Gitea API request: %w", err)
	}

	// Add auth token if specified
	token := getStringParam(tool.InstallParams, "token", "")
	if token != "" {
		req.Header.Set("Authorization", "token "+token)
	}

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing Gitea API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gitea API returned status %d", resp.StatusCode)
	}

	var release giteaRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decoding Gitea release response: %w", err)
	}

	// Match appropriate asset
	matched := matchAsset(release.Assets, g.sysCtx.OS, g.sysCtx.Arch)
	if matched == nil {
		return nil, fmt.Errorf("no matching release asset found for OS %s and Arch %s", g.sysCtx.OS, g.sysCtx.Arch)
	}

	destDir := g.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := g.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating destination directory: %w", err)
	}

	// Download the asset
	assetPath := filepath.Join(destDir, matched.Name)
	if err := g.dl.Download(ctx, matched.BrowserDownloadURL, assetPath, ""); err != nil {
		return nil, fmt.Errorf("downloading release asset %s: %w", matched.Name, err)
	}

	// If it is an archive, extract it
	lower := strings.ToLower(matched.Name)
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") || strings.HasSuffix(lower, ".zip") {
		if err := g.extractor.Extract(ctx, assetPath, destDir); err != nil {
			_ = g.fsys.Remove(assetPath)
			return nil, fmt.Errorf("extracting asset archive: %w", err)
		}
		_ = g.fsys.Remove(assetPath)
	} else {
		// Standalone binary: make it executable and rename it to tool.Name
		finalBinPath := filepath.Join(destDir, tool.Name)
		if assetPath != finalBinPath {
			data, err := g.fsys.ReadFile(assetPath)
			if err == nil {
				if errWrite := g.fsys.WriteFile(finalBinPath, data, 0755); errWrite == nil {
					_ = g.fsys.Remove(assetPath)
				}
			}
		}
		chmodCmd := g.runner.CommandContext(ctx, "chmod", "+x", finalBinPath)
		_ = chmodCmd.Run()
	}

	return &InstallResult{
		Binaries: []string{tool.Name},
	}, nil
}

func (g *GiteaInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := g.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return g.fsys.Remove(destPath)
	}
	return nil
}

func (g *GiteaInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func matchAsset(assets []giteaAsset, osName, archName string) *giteaAsset {
	for _, asset := range assets {
		name := strings.ToLower(asset.Name)
		if strings.Contains(name, osName) && (strings.Contains(name, archName) || (archName == "amd64" && strings.Contains(name, "x86_64")) || (archName == "arm64" && strings.Contains(name, "aarch64"))) {
			return &asset
		}
	}
	if len(assets) > 0 {
		return &assets[0]
	}
	return nil
}

func init() {
	_ = Register(&GiteaInstaller{
		runner:     exec.NewOSRunner(),
		fsys:       &fs.OSFS{},
		dl:         downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor:  archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
		sysCtx:     NewDefaultSystemContext(),
		httpClient: http.DefaultClient,
	})
}
