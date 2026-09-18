package installer

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
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
	Draft      bool          `json:"draft"`
	Assets     []githubAsset `json:"assets"`
}

type GitHubInstaller struct {
	log          *logger.Logger
	runner       exec.CommandRunner
	fsys         fs.FS
	dl           *downloader.Downloader
	extractor    *archive.Extractor
	sysCtx       *SystemContext
	httpClient   *http.Client
	cacheMu      sync.Mutex
	releaseCache map[string]*githubRelease
	CacheDir     string        // Cache directory for release metadata
	CacheTTL     time.Duration // Time-to-live for cached release metadata
	BinDir       string        // Destination directory for binaries
	BaseURL      string        // Override for testing
}

func NewGitHubInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *GitHubInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	if dl == nil {
		dl = downloader.NewDownloader(fsys, nil)
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

func (g *GitHubInstaller) getCachedRelease(ctx context.Context, repo, version string) (*githubRelease, bool) {
	if config.IsOverwriteEnabled(ctx) {
		return nil, false
	}

	cacheKey := repo + "@" + version

	g.cacheMu.Lock()
	if g.releaseCache != nil {
		if rel, ok := g.releaseCache[cacheKey]; ok {
			g.cacheMu.Unlock()
			relCopy := *rel
			return &relCopy, true
		}
	}
	g.cacheMu.Unlock()

	if g.fsys != nil && g.CacheDir != "" {
		h := md5.Sum([]byte(cacheKey))
		cacheFile := filepath.Join(g.CacheDir, fmt.Sprintf("%x.json", h))
		if exists, err := g.fsys.Exists(cacheFile); err == nil && exists {
			if info, err := g.fsys.Stat(cacheFile); err == nil {
				ttl := g.CacheTTL
				if ttl <= 0 {
					ttl = time.Hour
				}
				if time.Since(info.ModTime()) < ttl {
					if data, err := g.fsys.ReadFile(cacheFile); err == nil {
						var rel githubRelease
						if err := json.Unmarshal(data, &rel); err == nil && rel.TagName != "" {
							g.cacheMu.Lock()
							if g.releaseCache == nil {
								g.releaseCache = make(map[string]*githubRelease)
							}
							g.releaseCache[cacheKey] = &rel
							g.cacheMu.Unlock()
							relCopy := rel
							return &relCopy, true
						}
					}
				}
			}
		}
	}

	return nil, false
}

func (g *GitHubInstaller) setCachedRelease(repo, version string, rel *githubRelease) {
	if rel == nil {
		return
	}
	cacheKey := repo + "@" + version
	g.cacheMu.Lock()
	if g.releaseCache == nil {
		g.releaseCache = make(map[string]*githubRelease)
	}
	g.releaseCache[cacheKey] = rel
	g.cacheMu.Unlock()

	if g.fsys != nil && g.CacheDir != "" {
		h := md5.Sum([]byte(cacheKey))
		cacheFile := filepath.Join(g.CacheDir, fmt.Sprintf("%x.json", h))
		_ = g.fsys.MkdirAll(g.CacheDir, 0755)
		if data, err := json.Marshal(rel); err == nil {
			_ = g.fsys.WriteFile(cacheFile, data, 0644)
		}
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
	if g.dl != nil && log != nil {
		g.dl.SetQuiet(log.Level() == logger.LogLevelQuiet)
	}
}

func (g *GitHubInstaller) SetDownloadCache(cacheDir string, ttl time.Duration, enabled bool) {
	ApplyDownloadCacheSettings(g.dl, cacheDir, ttl, enabled)
}

func (g *GitHubInstaller) SetHTTPClient(client *http.Client) {
	g.httpClient = client
	g.dl.SetHTTPClient(client)
}

func (g *GitHubInstaller) SupportsSudo() bool {
	return false
}

// releaseListPageSize bounds the releases listing consulted when a tool opts into
// prereleases. The listing is ordered newest first, so a small page still finds the
// newest published release even when a few drafts sit at the top of it.
const releaseListPageSize = 10

// releaseEndpoint returns the GitHub API path that resolves a tool's release, and
// whether that path responds with a listing rather than a single release.
//
// The releases/latest endpoint deliberately excludes prereleases, and answers 404 for
// a repository that has published nothing else, so opting into prereleases has to
// change which endpoint is consulted rather than filter what it returns.
func releaseEndpoint(repo, version string, prerelease bool) (string, bool) {
	if version != "" && version != "latest" {
		return fmt.Sprintf("repos/%s/releases/tags/%s", repo, version), false
	}
	if prerelease {
		return fmt.Sprintf("repos/%s/releases?per_page=%d", repo, releaseListPageSize), true
	}
	return fmt.Sprintf("repos/%s/releases/latest", repo), false
}

// decodeRelease reads a release response, which is a listing when the prerelease
// endpoint was used. Drafts are skipped: GitHub returns them to callers with push
// access and they carry no downloadable assets.
func decodeRelease(r io.Reader, isListing bool) (*githubRelease, error) {
	if !isListing {
		var rel githubRelease
		if err := json.NewDecoder(r).Decode(&rel); err != nil {
			return nil, fmt.Errorf("decoding GitHub release response: %w", err)
		}
		return &rel, nil
	}

	var releases []githubRelease
	if err := json.NewDecoder(r).Decode(&releases); err != nil {
		return nil, fmt.Errorf("decoding GitHub releases response: %w", err)
	}
	for i := range releases {
		if !releases[i].Draft {
			return &releases[i], nil
		}
	}
	return nil, fmt.Errorf("no published release found")
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

	version := getStringParam(tool.InstallParams, "version", "")
	if version == "" && tool.Version != nil {
		version = *tool.Version
	}
	if version == "" {
		version = "latest"
	}

	toolLog := toolLogger(g.log, tool.Name)
	if toolLog != nil {
		toolLog.Info(logger.Message(fmt.Sprintf("Fetching release info for %s (%s)...", repo, version)))
	}

	baseURL := g.BaseURL
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}
	baseURL = strings.TrimSuffix(baseURL, "/")

	prerelease := getBoolParam(tool.InstallParams, "prerelease", false)
	endpoint, isListing := releaseEndpoint(repo, version, prerelease)
	apiURL := fmt.Sprintf("%s/%s", baseURL, endpoint)

	ghCli := getBoolParam(tool.InstallParams, "ghCli", false)
	var release *githubRelease
	useGhCli := ghCli

	if version != "latest" {
		if cached, ok := g.getCachedRelease(ctx, repo, version); ok {
			release = cached
		}
	}
	if release == nil {
		if !useGhCli {
			req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
			if err != nil {
				return nil, fmt.Errorf("creating GitHub API request: %w", err)
			}
			req.Header.Set("User-Agent", "dotfiles-installer/1.0")

			token := getStringParam(tool.InstallParams, "token", "")
			if token == "" {
				token = os.Getenv("GITHUB_TOKEN")
				if token == "" {
					token = os.Getenv("GH_TOKEN")
				}
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
				rel, err := decodeRelease(resp.Body, isListing)
				if err != nil {
					return nil, err
				}
				release = rel
				g.setCachedRelease(repo, release.TagName, release)
				if version != "latest" {
					g.setCachedRelease(repo, version, release)
				}
			}
		}

		if useGhCli {
			rel, err := g.fetchReleaseViaGhCli(ctx, repo, version, baseURL, prerelease)
			if err != nil {
				return nil, fmt.Errorf("fetching release via gh CLI: %w", err)
			}
			release = rel
			if len(release.Assets) > 0 {
				g.setCachedRelease(repo, release.TagName, release)
				if version != "latest" {
					g.setCachedRelease(repo, version, release)
				}
			}
		}
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
	if toolLog != nil {
		toolLog.Info(logger.Message(fmt.Sprintf("Downloading release asset %s...", matched.Name)))
	}
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

	placer := releaseAssetInstaller{fsys: g.fsys, extractor: g.extractor, log: toolLog}
	promotedBinaries, err := placer.install(ctx, assetPath, destDir, tool)
	if err != nil {
		return nil, err
	}

	var versionResult string
	if release != nil && release.TagName != "" {
		versionResult = release.TagName
	} else if version != "" && version != "latest" {
		versionResult = version
	}

	return &InstallResult{
		Binaries: promotedBinaries,
		Version:  versionResult,
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
	prerelease := getBoolParam(tool.InstallParams, "prerelease", false)
	endpoint, isListing := releaseEndpoint(repo, "latest", prerelease)

	var release *githubRelease
	var isCached bool

	if cached, ok := g.getCachedRelease(ctx, repo, "latest"); ok {
		release = cached
		isCached = true
	}

	if release == nil {
		if ghCli {
			rel, err := g.fetchReleaseViaGhCli(ctx, repo, "latest", baseURL, prerelease)
			if err != nil {
				return nil, err
			}
			release = rel
		} else {
			apiURL := fmt.Sprintf("%s/%s", baseURL, endpoint)
			req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
			if err != nil {
				return nil, err
			}
			req.Header.Set("User-Agent", "dotfiles-installer/1.0")
			token := getStringParam(tool.InstallParams, "token", "")
			if token == "" {
				token = os.Getenv("GITHUB_TOKEN")
				if token == "" {
					token = os.Getenv("GH_TOKEN")
				}
			}
			if token != "" {
				req.Header.Set("Authorization", "token "+token)
			}
			resp, err := g.httpClient.Do(req)
			if err != nil {
				return nil, err
			}
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusForbidden {
				rel, err := g.fetchReleaseViaGhCli(ctx, repo, "latest", baseURL, prerelease)
				if err != nil {
					return nil, err
				}
				release = rel
			} else if resp.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("GitHub API status %d", resp.StatusCode)
			} else {
				rel, err := decodeRelease(resp.Body, isListing)
				if err != nil {
					return nil, err
				}
				release = rel
			}
		}
		if len(release.Assets) > 0 {
			g.setCachedRelease(repo, "latest", release)
			g.setCachedRelease(repo, release.TagName, release)
		}
	}
	return &UpdateCheckResult{
		HasUpdate:     true,
		LatestVersion: release.TagName,
		Cached:        isCached,
	}, nil
}

func (g *GitHubInstaller) fetchReleaseViaGhCli(ctx context.Context, repo, version, baseURL string, prerelease bool) (*githubRelease, error) {
	endpoint, isListing := releaseEndpoint(repo, version, prerelease)

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

	rel, err := decodeRelease(bytes.NewReader(out), isListing)
	if err != nil {
		return nil, fmt.Errorf("parsing gh api response: %w", err)
	}
	return rel, nil
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

	// Filter assets by assetPattern if provided
	var candidates []githubAsset
	if assetPattern != "" {
		for _, asset := range assets {
			if MatchAssetPattern(asset.Name, assetPattern) {
				candidates = append(candidates, asset)
			}
		}
	} else {
		candidates = assets
	}

	if len(candidates) == 0 {
		return nil
	}

	sysInfo := arch.SystemInfo{
		OS:   sysCtx.OS,
		Arch: sysCtx.Arch,
		Libc: arch.DetectLibc(arch.FileExists),
	}

	archRegex := arch.GetArchitectureRegex(sysInfo)

	// Find strict matches for both OS and CPU architecture
	var strictMatches []githubAsset
	for _, c := range candidates {
		if arch.MatchesArchitecture(c.Name, archRegex) {
			strictMatches = append(strictMatches, c)
		}
	}

	if len(strictMatches) > 0 {
		strictNames := make([]string, len(strictMatches))
		for i, sm := range strictMatches {
			strictNames[i] = sm.Name
		}
		bestName := arch.SelectBestMatch(strictNames, sysInfo)
		if bestName != "" {
			for _, asset := range strictMatches {
				if asset.Name == bestName {
					assetCopy := asset
					return &assetCopy
				}
			}
		}
		assetCopy := strictMatches[0]
		return &assetCopy
	}

	// Fallback if assetPattern was explicitly specified but no strict platform match was found
	if assetPattern != "" && len(candidates) > 0 {
		assetCopy := candidates[0]
		return &assetCopy
	}

	return nil
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
