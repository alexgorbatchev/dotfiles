package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type githubAsset struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type githubRelease struct {
	ID         int64         `json:"id"`
	TagName    string        `json:"tag_name"`
	Name       string        `json:"name"`
	Prerelease bool          `json:"prerelease"`
	Assets     []githubAsset `json:"assets"`
}

type GitHubInstaller struct {
	log        *logger.Logger
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	BinDir     string // Destination directory for binaries
	BaseURL    string // Override for testing
}

func NewGitHubInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *GitHubInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &GitHubInstaller{
		runner:     runner,
		fsys:       fsys,
		dl:         dl,
		extractor:  extractor,
		sysCtx:     sysCtx,
		httpClient: http.DefaultClient,
	}
}

func (g *GitHubInstaller) Name() string {
	return "github-release"
}

func (g *GitHubInstaller) SupportsSudo() bool {
	return false
}

func (g *GitHubInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	if g.sysCtx == nil {
		g.sysCtx = NewDefaultSystemContext()
	}
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

	baseURL := g.BaseURL
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}
	baseURL = strings.TrimSuffix(baseURL, "/")

	apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", baseURL, repo)
	if version != "latest" {
		apiURL = fmt.Sprintf("%s/repos/%s/releases/tags/%s", baseURL, repo, version)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating GitHub API request: %w", err)
	}

	token := getStringParam(tool.InstallParams, "token", "")
	if token == "" {
		token = os.Getenv("GITHUB_TOKEN")
	}
	if token != "" {
		req.Header.Set("Authorization", "token "+token)
	}

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing GitHub API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decoding GitHub release response: %w", err)
	}

	assetPattern := getStringParam(tool.InstallParams, "assetPattern", "")
	matched := g.matchAsset(release.Assets, assetPattern)
	if matched == nil {
		patternStr := ""
		if assetPattern != "" {
			patternStr = " and pattern " + assetPattern
		}
		return nil, fmt.Errorf("no compatible asset found for release %q matching %s/%s%s", release.TagName, g.sysCtx.OS, g.sysCtx.Arch, patternStr)
	}

	destDir := g.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := g.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating destination directory: %w", err)
	}

	opts := downloader.DownloadOptions{}
	if token != "" {
		opts.Headers = map[string]string{
			"Authorization": "token " + token,
		}
	}

	assetPath := filepath.Join(destDir, matched.Name)
	if err := g.dl.Download(ctx, matched.BrowserDownloadURL, assetPath, "", opts); err != nil {
		return nil, fmt.Errorf("downloading release asset %s: %w", matched.Name, err)
	}

	lower := strings.ToLower(matched.Name)
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") || strings.HasSuffix(lower, ".zip") {
		if err := g.extractor.Extract(ctx, assetPath, destDir); err != nil {
			_ = g.fsys.Remove(assetPath)
			return nil, fmt.Errorf("extracting asset archive: %w", err)
		}
		_ = g.fsys.Remove(assetPath)
	} else {
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

func (g *GitHubInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := g.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return g.fsys.Remove(destPath)
	}
	return nil
}

func (g *GitHubInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	repo := getStringParam(tool.InstallParams, "repo", "")
	if repo == "" {
		return &UpdateCheckResult{HasUpdate: false}, nil
	}
	baseURL := g.BaseURL
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}
	apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", baseURL, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API status %d", resp.StatusCode)
	}
	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &UpdateCheckResult{
		HasUpdate:     true,
		LatestVersion: release.TagName,
	}, nil
}

func (g *GitHubInstaller) matchAsset(assets []githubAsset, assetPattern string) *githubAsset {
	sysCtx := g.sysCtx
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}

	var re *regexp.Regexp
	if assetPattern != "" {
		var err error
		re, err = regexp.Compile(assetPattern)
		if err != nil {
			return nil
		}
	}

	var bestAsset *githubAsset
	bestScore := -1

	for _, asset := range assets {
		name := strings.ToLower(asset.Name)

		if re != nil {
			if !re.MatchString(asset.Name) {
				continue
			}
		}

		if !strings.Contains(name, sysCtx.OS) {
			continue
		}

		archMatch := false
		if strings.Contains(name, sysCtx.Arch) {
			archMatch = true
		} else if sysCtx.Arch == "amd64" && (strings.Contains(name, "x86_64") || strings.Contains(name, "x64")) {
			archMatch = true
		} else if sysCtx.Arch == "arm64" && (strings.Contains(name, "aarch64") || strings.Contains(name, "armv8")) {
			archMatch = true
		}
		if !archMatch {
			continue
		}

		score := 5

		isUndesiredSuffix := false
		undesiredExtensions := []string{
			".sha256", ".sha256sum", ".sha512", ".md5", ".sha1", ".sig", ".asc",
			".txt", ".md", ".html", ".pdf", ".yaml", ".yml", ".json", ".xml", ".csv",
		}
		for _, ext := range undesiredExtensions {
			if strings.HasSuffix(name, ext) {
				isUndesiredSuffix = true
				break
			}
		}

		packageExtensions := []string{".deb", ".rpm", ".apk", ".msi"}
		isPackage := false
		for _, ext := range packageExtensions {
			if strings.HasSuffix(name, ext) {
				isPackage = true
				break
			}
		}

		archiveExtensions := []string{".tar.gz", ".tgz", ".zip", ".tar.xz", ".txz", ".tar.bz2", ".tbz2"}
		isArchive := false
		for _, ext := range archiveExtensions {
			if strings.HasSuffix(name, ext) {
				isArchive = true
				break
			}
		}

		if isUndesiredSuffix {
			if assetPattern != "" {
				score = 1
			} else {
				continue
			}
		} else if isPackage {
			score = 2
		} else if isArchive {
			score = 10
		} else {
			score = 10
		}

		if score > bestScore {
			bestScore = score
			assetCopy := asset
			bestAsset = &assetCopy
		}
	}

	return bestAsset
}

func init() {
	_ = Register(&GitHubInstaller{
		runner:     exec.NewOSRunner(),
		fsys:       &fs.OSFS{},
		dl:         downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor:  archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
		sysCtx:     NewDefaultSystemContext(),
		httpClient: http.DefaultClient,
	})
}
