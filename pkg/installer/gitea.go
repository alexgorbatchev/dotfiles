package installer

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
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
	log          *logger.Logger
	runner       exec.CommandRunner
	fsys         fs.FS
	dl           *downloader.Downloader
	extractor    *archive.Extractor
	sysCtx       *SystemContext
	httpClient   *http.Client
	cacheMu      sync.Mutex
	releaseCache map[string]*giteaRelease
	CacheDir     string        // Cache directory for release metadata
	CacheTTL     time.Duration // Time-to-live for cached release metadata
	BinDir       string        // Destination folder
}

func NewGiteaInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *GiteaInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	if dl == nil {
		dl = downloader.NewDownloader(fsys, nil)
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

func (g *GiteaInstaller) getCachedRelease(ctx context.Context, key string) (*giteaRelease, bool) {
	if config.IsOverwriteEnabled(ctx) {
		return nil, false
	}

	g.cacheMu.Lock()
	if g.releaseCache != nil {
		if rel, ok := g.releaseCache[key]; ok {
			g.cacheMu.Unlock()
			relCopy := *rel
			return &relCopy, true
		}
	}
	g.cacheMu.Unlock()

	if g.fsys != nil && g.CacheDir != "" {
		h := md5.Sum([]byte(key))
		cacheFile := filepath.Join(g.CacheDir, fmt.Sprintf("%x.json", h))
		if exists, err := g.fsys.Exists(cacheFile); err == nil && exists {
			if info, err := g.fsys.Stat(cacheFile); err == nil {
				ttl := g.CacheTTL
				if ttl <= 0 {
					ttl = time.Hour
				}
				if time.Since(info.ModTime()) < ttl {
					if data, err := g.fsys.ReadFile(cacheFile); err == nil {
						var rel giteaRelease
						if err := json.Unmarshal(data, &rel); err == nil && rel.TagName != "" {
							g.cacheMu.Lock()
							if g.releaseCache == nil {
								g.releaseCache = make(map[string]*giteaRelease)
							}
							g.releaseCache[key] = &rel
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

func (g *GiteaInstaller) setCachedRelease(key string, rel *giteaRelease) {
	if rel == nil {
		return
	}
	g.cacheMu.Lock()
	if g.releaseCache == nil {
		g.releaseCache = make(map[string]*giteaRelease)
	}
	g.releaseCache[key] = rel
	g.cacheMu.Unlock()

	if g.fsys != nil && g.CacheDir != "" {
		h := md5.Sum([]byte(key))
		cacheFile := filepath.Join(g.CacheDir, fmt.Sprintf("%x.json", h))
		_ = g.fsys.MkdirAll(g.CacheDir, 0755)
		if data, err := json.Marshal(rel); err == nil {
			_ = g.fsys.WriteFile(cacheFile, data, 0644)
		}
	}
}

func (g *GiteaInstaller) Name() string {
	return "gitea-release"
}

func (g *GiteaInstaller) SetFS(fsys fs.FS) {
	g.fsys = fsys
	if g.dl != nil {
		g.dl.SetFS(fsys)
	}
	if g.extractor != nil {
		g.extractor.SetFS(fsys)
	}
}

func (g *GiteaInstaller) SetLogger(log *logger.Logger) {
	g.log = log
	if g.dl != nil && log != nil {
		g.dl.SetQuiet(log.Level() == logger.LogLevelQuiet)
	}
}

func (g *GiteaInstaller) SetDownloadCache(cacheDir string, ttl time.Duration, enabled bool) {
	if g.dl != nil {
		if cacheDir != "" {
			g.dl.CacheDir = cacheDir
		}
		if ttl > 0 {
			g.dl.CacheTTL = ttl
		}
		g.dl.CacheEnabled = enabled
	}
}

func (g *GiteaInstaller) SupportsSudo() bool {
	return false
}

func (g *GiteaInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(g, tool); err != nil {
		return nil, err
	}
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

	var release *giteaRelease
	cacheKey := normalizedURL + "/" + repo + "@" + version
	if version != "latest" {
		if cached, ok := g.getCachedRelease(ctx, cacheKey); ok {
			release = cached
		}
	}

	if release == nil {
		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("creating Gitea API request: %w", err)
		}
		req.Header.Set("User-Agent", "dotfiles-installer/1.0")

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

		var rel giteaRelease
		if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
			return nil, fmt.Errorf("decoding Gitea release response: %w", err)
		}
		release = &rel
		g.setCachedRelease(normalizedURL+"/"+repo+"@"+release.TagName, release)
		if version != "latest" {
			g.setCachedRelease(cacheKey, release)
		}
	}

	assetPattern := getStringParam(tool.InstallParams, "assetPattern", "")

	// Match appropriate asset
	matched := matchAsset(release.Assets, g.sysCtx.OS, g.sysCtx.Arch, assetPattern)
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

	var promotedBinaries []string
	// If it is an archive, extract it
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
		promotedBinaries = GetBinaryNames(tool.Name, tool.Binaries)
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

func (g *GiteaInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := g.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return g.fsys.Remove(destPath)
	}
	return nil
}

func (g *GiteaInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	instanceURL := getStringParam(tool.InstallParams, "instanceUrl", "https://codeberg.org")
	repo := getStringParam(tool.InstallParams, "repo", "")
	if repo == "" {
		return &UpdateCheckResult{HasUpdate: false}, nil
	}

	normalizedURL := strings.TrimSuffix(instanceURL, "/")
	apiURL := fmt.Sprintf("%s/api/v1/repos/%s/releases/latest", normalizedURL, repo)
	cacheKey := normalizedURL + "/" + repo + "@latest"

	var release *giteaRelease
	var isCached bool

	if cached, ok := g.getCachedRelease(ctx, cacheKey); ok {
		release = cached
		isCached = true
	}

	if release == nil {
		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("creating Gitea API request: %w", err)
		}
		req.Header.Set("User-Agent", "dotfiles-installer/1.0")

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

		var rel giteaRelease
		if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
			return nil, fmt.Errorf("decoding Gitea release response: %w", err)
		}
		release = &rel
		g.setCachedRelease(cacheKey, release)
		g.setCachedRelease(normalizedURL+"/"+repo+"@"+release.TagName, release)
	}

	return &UpdateCheckResult{
		HasUpdate:     true,
		LatestVersion: release.TagName,
		Cached:        isCached,
	}, nil
}

func matchAsset(assets []giteaAsset, osName, archName, assetPattern string) *giteaAsset {
	var candidates []giteaAsset
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
		OS:   osName,
		Arch: archName,
		Libc: arch.DetectLibc(arch.FileExists),
	}
	archRegex := arch.GetArchitectureRegex(sysInfo)

	var strictMatches []giteaAsset
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

	if assetPattern != "" && len(candidates) > 0 {
		assetCopy := candidates[0]
		return &assetCopy
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
