package installer

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
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
	Draft      bool         `json:"draft"`
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

// giteaReleaseTarget is what a tool's install parameters resolve to: the instance,
// the repository and the release selection.
type giteaReleaseTarget struct {
	instanceURL string
	repo        string
	version     string
	prerelease  bool
	token       string
}

// giteaTarget reads the release-selection parameters of a gitea-release tool. The
// `version` install parameter wins over `.version()`, which is the fallback
// (config.ToolConfig.RequestedVersion), and a missing version selects the latest
// release.
func giteaTarget(tool *config.ToolConfig) (giteaReleaseTarget, error) {
	instanceURL, err := giteaInstanceURL(tool.InstallParams)
	if err != nil {
		return giteaReleaseTarget{}, err
	}
	version := tool.RequestedVersion()
	if version == "" {
		version = "latest"
	}
	return giteaReleaseTarget{
		instanceURL: instanceURL,
		repo:        getStringParam(tool.InstallParams, "repo", ""),
		version:     version,
		prerelease:  getBoolParam(tool.InstallParams, "prerelease", false),
		token:       getStringParam(tool.InstallParams, "token", ""),
	}, nil
}

// cacheKey names the cache entry for a release of this target. "latest" means a
// different release once prereleases are allowed, so the two are kept apart.
func (t giteaReleaseTarget) cacheKey(version string) string {
	key := t.instanceURL + "/" + t.repo + "@" + version
	if version == "latest" && t.prerelease {
		key += "?prerelease"
	}
	return key
}

func (t giteaReleaseTarget) request(version string) giteaReleaseRequest {
	return giteaReleaseRequest{repo: t.repo, version: version, prerelease: t.prerelease, token: t.token}
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

// SetSystemContext applies the target the run was invoked for.
func (g *GiteaInstaller) SetSystemContext(sysCtx *SystemContext) {
	g.sysCtx = sysCtx
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

func (g *GiteaInstaller) SetDownloadSettings(settings downloader.Settings) {
	g.dl.Apply(settings)
}

func (g *GiteaInstaller) SetHTTPClient(client *http.Client) {
	g.httpClient = client
	g.dl.SetHTTPClient(client)
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
	target, err := giteaTarget(tool)
	if err != nil {
		return nil, err
	}
	if target.repo == "" {
		return nil, fmt.Errorf("repository 'repo' is required in installParams")
	}
	if parts := strings.Split(target.repo, "/"); len(parts) != 2 {
		return nil, fmt.Errorf("invalid repository format %q. Expected 'owner/repo'", target.repo)
	}

	toolLog := toolLogger(g.log, tool.Name)
	if toolLog != nil {
		toolLog.Info(logger.Message(fmt.Sprintf("Fetching release info for %s (%s) from %s...", target.repo, target.version, target.instanceURL)))
	}

	var release *giteaRelease
	if target.version != "latest" {
		if cached, ok := g.getCachedRelease(ctx, target.cacheKey(target.version)); ok {
			release = cached
		}
	}
	if release == nil {
		client := giteaReleaseClient{httpClient: g.httpClient, instanceURL: target.instanceURL}
		release, err = client.fetch(ctx, target.request(target.version))
		if err != nil {
			return nil, err
		}
		g.setCachedRelease(target.cacheKey(release.TagName), release)
		if target.version != "latest" {
			g.setCachedRelease(target.cacheKey(target.version), release)
		}
	}

	assetPattern := getStringParam(tool.InstallParams, "assetPattern", "")
	matched, err := g.selectAsset(ctx, tool, release, assetPattern)
	if err != nil {
		return nil, err
	}

	destDir, err := prepareDestDir(g.fsys, g.BinDir)
	if err != nil {
		return nil, err
	}

	assetPath := filepath.Join(destDir, matched.Name)
	if toolLog != nil {
		toolLog.Info(logger.Message(fmt.Sprintf("Downloading release asset %s...", matched.Name)))
	}
	if err := g.dl.Download(ctx, matched.BrowserDownloadURL, assetPath, ""); err != nil {
		return nil, fmt.Errorf("downloading release asset %s: %w", matched.Name, err)
	}

	placer := releaseAssetInstaller{fsys: g.fsys, extractor: g.extractor, log: toolLog}
	promotedBinaries, err := placer.install(ctx, assetPath, destDir, tool)
	if err != nil {
		return nil, err
	}

	versionResult := release.TagName
	if versionResult == "" && target.version != "latest" {
		versionResult = target.version
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
	target, err := giteaTarget(tool)
	if err != nil {
		return nil, err
	}
	if target.repo == "" {
		return &UpdateCheckResult{}, nil
	}

	latestKey := target.cacheKey("latest")
	if cached, ok := g.getCachedRelease(ctx, latestKey); ok {
		return &UpdateCheckResult{LatestVersion: cached.TagName, Cached: true}, nil
	}

	client := giteaReleaseClient{httpClient: g.httpClient, instanceURL: target.instanceURL}
	release, err := client.fetch(ctx, target.request("latest"))
	if err != nil {
		return nil, err
	}
	g.setCachedRelease(latestKey, release)
	g.setCachedRelease(target.cacheKey(release.TagName), release)

	return &UpdateCheckResult{
		LatestVersion: release.TagName,
	}, nil
}

func (g *GiteaInstaller) matchAsset(assets []giteaAsset, assetPattern string) *giteaAsset {
	sysCtx := g.sysCtx
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return matchReleaseAsset(assets, giteaAssetName, sysCtx.systemInfo(), assetPattern)
}

func matchAsset(assets []giteaAsset, sysInfo arch.SystemInfo, assetPattern string) *giteaAsset {
	return matchReleaseAsset(assets, giteaAssetName, sysInfo, assetPattern)
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
