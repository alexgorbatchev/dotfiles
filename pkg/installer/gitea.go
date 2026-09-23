package installer

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"slices"
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

func (r giteaRelease) tag() string {
	return r.TagName
}

// clone returns a copy of r that shares no assets with it.
func (r giteaRelease) clone() giteaRelease {
	r.Assets = slices.Clone(r.Assets)
	return r
}

type GiteaInstaller struct {
	log        *logger.Logger
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	releases   releaseCache[giteaRelease]
	CacheDir   string        // Cache directory for release metadata
	CacheTTL   time.Duration // Time-to-live for cached release metadata
	BinDir     string        // Destination folder
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

// cacheKey names the cache entry for a release of this target, so an entry is only
// reused for the same instance, token and prerelease setting.
func (t giteaReleaseTarget) cacheKey(version string) string {
	return releaseCacheKey(t.instanceURL, t.repo, version, t.prerelease, t.token)
}

func (t giteaReleaseTarget) request(version string) giteaReleaseRequest {
	return giteaReleaseRequest{repo: t.repo, version: version, prerelease: t.prerelease, token: t.token}
}

func (g *GiteaInstaller) getCachedRelease(ctx context.Context, key string) (*giteaRelease, bool) {
	if config.IsOverwriteEnabled(ctx) {
		return nil, false
	}
	return g.releases.get(g.releaseStore(), key)
}

func (g *GiteaInstaller) setCachedRelease(key string, rel *giteaRelease) {
	g.releases.set(g.releaseStore(), key, rel)
}

// releaseStore is where the release cache keeps entries for the current settings.
func (g *GiteaInstaller) releaseStore() releaseCacheStore {
	return releaseCacheStore{fsys: g.fsys, dir: g.CacheDir, ttl: g.CacheTTL}
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
		g.dl.SetLogger(log)
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
	if err := validateReleaseRepo(target.repo); err != nil {
		return nil, err
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
	if err := validateReleaseRepo(target.repo); err != nil {
		return nil, err
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
