package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
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

func (g *GitHubInstaller) SetFS(fsys fs.FS) {
	g.fsys = fsys
	if g.dl != nil {
		g.dl.SetFS(fsys)
	}
	if g.extractor != nil {
		g.extractor.SetFS(fsys)
	}
}

func (g *GitHubInstaller) SetLogger(log *logger.Logger) {
	g.log = log
}

func (g *GitHubInstaller) SupportsSudo() bool {
	return false
}

func (g *GitHubInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(g, tool); err != nil {
		return nil, err
	}
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

	ghCli := getBoolParam(tool.InstallParams, "ghCli", false)
	var release *githubRelease
	useGhCli := ghCli

	if !useGhCli {
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

		if resp.StatusCode == http.StatusForbidden {
			useGhCli = true
		} else if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
		} else {
			var rel githubRelease
			if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
				return nil, fmt.Errorf("decoding GitHub release response: %w", err)
			}
			release = &rel
		}
	}

	if useGhCli {
		rel, err := g.fetchReleaseViaGhCli(ctx, repo, version, baseURL)
		if err != nil {
			return nil, fmt.Errorf("fetching release via gh CLI: %w", err)
		}
		release = rel
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

	assetPath := filepath.Join(destDir, matched.Name)
	if useGhCli {
		if err := g.downloadAssetViaGhCli(ctx, repo, release.TagName, matched.Name, destDir); err != nil {
			return nil, fmt.Errorf("downloading release asset via gh CLI: %w", err)
		}
	} else {
		opts := downloader.DownloadOptions{}
		token := getStringParam(tool.InstallParams, "token", "")
		if token == "" {
			token = os.Getenv("GITHUB_TOKEN")
		}
		if token != "" {
			opts.Headers = map[string]string{
				"Authorization": "token " + token,
			}
		}
		if err := g.dl.Download(ctx, matched.BrowserDownloadURL, assetPath, "", opts); err != nil {
			return nil, fmt.Errorf("downloading release asset %s: %w", matched.Name, err)
		}
	}

	var promotedBinaries []string
	lower := strings.ToLower(matched.Name)
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") || strings.HasSuffix(lower, ".zip") {
		if err := g.extractor.Extract(ctx, assetPath, destDir); err != nil {
			_ = g.fsys.Remove(assetPath)
			return nil, fmt.Errorf("extracting asset archive: %w", err)
		}
		_ = g.fsys.Remove(assetPath)

		var err error
		promotedBinaries, err = PromoteBinaries(g.fsys, destDir, tool.Name, tool.Binaries)
		if err != nil {
			return nil, err
		}
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
		promotedBinaries = GetBinaryNames(tool.Name, tool.Binaries)
	}

	return &InstallResult{
		Binaries: promotedBinaries,
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
	ghCli := getBoolParam(tool.InstallParams, "ghCli", false)

	var release *githubRelease
	if ghCli {
		rel, err := g.fetchReleaseViaGhCli(ctx, repo, "latest", baseURL)
		if err != nil {
			return nil, err
		}
		release = rel
	} else {
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
		if resp.StatusCode == http.StatusForbidden {
			rel, err := g.fetchReleaseViaGhCli(ctx, repo, "latest", baseURL)
			if err != nil {
				return nil, err
			}
			release = rel
		} else if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub API status %d", resp.StatusCode)
		} else {
			var rel githubRelease
			if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
				return nil, err
			}
			release = &rel
		}
	}
	return &UpdateCheckResult{
		HasUpdate:     true,
		LatestVersion: release.TagName,
	}, nil
}

func (g *GitHubInstaller) fetchReleaseViaGhCli(ctx context.Context, repo, version, baseURL string) (*githubRelease, error) {
	endpoint := fmt.Sprintf("repos/%s/releases/latest", repo)
	if version != "" && version != "latest" {
		endpoint = fmt.Sprintf("repos/%s/releases/tags/%s", repo, version)
	}

	args := []string{"api"}
	if baseURL != "" && baseURL != "https://api.github.com" {
		if u, err := url.Parse(baseURL); err == nil && u.Host != "" {
			args = append(args, "--hostname", u.Host)
		}
	}
	args = append(args, endpoint)

	cmd := g.runner.CommandContext(ctx, "gh", args...)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("executing gh api %s: %w", endpoint, err)
	}

	var rel githubRelease
	if err := json.Unmarshal(out, &rel); err != nil {
		return nil, fmt.Errorf("parsing gh api response: %w", err)
	}
	return &rel, nil
}

func (g *GitHubInstaller) downloadAssetViaGhCli(ctx context.Context, repo, tag, pattern, destDir string) error {
	args := []string{
		"release", "download", tag,
		"--repo", repo,
		"--dir", destDir,
		"--pattern", pattern,
		"--clobber",
	}
	cmd := g.runner.CommandContext(ctx, "gh", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("executing gh release download: %w (output: %s)", err, string(out))
	}
	return nil
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
			explicitlyMatched := false
			if assetPattern != "" {
				normalizedPattern := strings.ReplaceAll(strings.ToLower(assetPattern), "\\", "")
				for _, ext := range undesiredExtensions {
					extNoDot := strings.TrimPrefix(ext, ".")
					if strings.HasSuffix(name, ext) && (strings.Contains(normalizedPattern, ext) || strings.Contains(normalizedPattern, extNoDot)) {
						explicitlyMatched = true
						break
					}
				}
			}
			if !explicitlyMatched {
				continue
			}
			score = 1
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
