package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"slices"
	"time"

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

func (r githubRelease) tag() string {
	return r.TagName
}

// clone returns a copy of r that shares no assets with it.
func (r githubRelease) clone() githubRelease {
	r.Assets = slices.Clone(r.Assets)
	return r
}

type GitHubInstaller struct {
	log          *logger.Logger
	runner       exec.CommandRunner
	fsys         fs.FS
	dl           *downloader.Downloader
	extractor    *archive.Extractor
	sysCtx       *SystemContext
	httpClient   *http.Client
	releases     releaseCache[githubRelease]
	CacheDir     string        // Cache directory for release metadata
	CacheTTL     time.Duration // Time-to-live for cached release metadata
	CacheEnabled bool          // Whether cached release metadata is reused
	BinDir       string        // Destination directory for binaries
	BaseURL      string        // GitHub API root; empty selects api.github.com
	// GitHub holds the project configuration's github section.
	GitHub GitHubSettings
}

// SetGitHubSettings applies the project configuration's github section.
func (g *GitHubInstaller) SetGitHubSettings(settings GitHubSettings) {
	g.GitHub = settings
	g.CacheEnabled = settings.CacheEnabled
	if settings.Host != "" {
		g.BaseURL = settings.Host
	}
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
		// Release metadata is cached unless a configuration turns it off, which is
		// what github.cache.enabled defaults to.
		CacheEnabled: true,
		runner:       runner,
		fsys:         fsys,
		dl:           dl,
		extractor:    extractor,
		sysCtx:       sysCtx,
		httpClient:   http.DefaultClient,
	}
}

// releaseClient resolves releases from the configured API host with the configured
// User-Agent.
func (g *GitHubInstaller) releaseClient() githubReleaseClient {
	return githubReleaseClient{httpClient: g.httpClient, runner: g.runner, baseURL: g.BaseURL, userAgent: g.GitHub.UserAgent}
}

// releaseStore is where the release cache keeps entries for the current settings.
func (g *GitHubInstaller) releaseStore() releaseCacheStore {
	return releaseCacheStore{fsys: g.fsys, dir: g.CacheDir, ttl: g.CacheTTL}
}

func (g *GitHubInstaller) getCachedRelease(ctx context.Context, key string) (*githubRelease, bool) {
	if config.IsOverwriteEnabled(ctx) || !g.CacheEnabled {
		return nil, false
	}
	return g.releases.get(g.releaseStore(), key)
}

func (g *GitHubInstaller) setCachedRelease(key string, rel *githubRelease) {
	if !g.CacheEnabled {
		return
	}
	g.releases.set(g.releaseStore(), key, rel)
}

func (g *GitHubInstaller) Name() string {
	return "github-release"
}

// SetSystemContext applies the target the run was invoked for.
func (g *GitHubInstaller) SetSystemContext(sysCtx *SystemContext) {
	g.sysCtx = sysCtx
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
		g.dl.SetLogger(log)
	}
}

func (g *GitHubInstaller) SetDownloadSettings(settings downloader.Settings) {
	g.dl.Apply(settings)
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
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	if g.sysCtx == nil {
		g.sysCtx = NewDefaultSystemContext()
	}
	repo := getStringParam(tool.InstallParams, "repo", "")
	if err := validateReleaseRepo(repo); err != nil {
		return nil, err
	}

	version := tool.RequestedVersion()
	if version == "" {
		version = "latest"
	}

	toolLog := toolLogger(g.log, tool.Name)
	if toolLog != nil {
		toolLog.Info(logger.Message(fmt.Sprintf("Fetching release info for %s (%s)...", repo, version)))
	}

	prerelease := getBoolParam(tool.InstallParams, "prerelease", false)
	ghCli := getBoolParam(tool.InstallParams, "ghCli", false)
	releaseClient := g.releaseClient()
	token := githubToken(tool.InstallParams, g.GitHub.Token)
	var release *githubRelease
	useGhCli := ghCli

	if version != "latest" {
		if cached, ok := g.getCachedRelease(ctx, releaseClient.cacheKey(repo, version, prerelease, token)); ok {
			release = cached
		}
	}
	if release == nil {
		rel, viaGhCli, err := releaseClient.fetch(ctx, githubReleaseRequest{
			repo:       repo,
			version:    version,
			prerelease: prerelease,
			ghCli:      ghCli,
			token:      token,
		})
		if err != nil {
			return nil, err
		}
		release = rel
		useGhCli = viaGhCli
		// A gh-resolved release without assets is not worth caching: the CLI may have
		// answered for a repository the token cannot fully see.
		if !viaGhCli || len(release.Assets) > 0 {
			g.setCachedRelease(releaseClient.cacheKey(repo, release.TagName, prerelease, token), release)
			if version != "latest" {
				g.setCachedRelease(releaseClient.cacheKey(repo, version, prerelease, token), release)
			}
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
	if useGhCli {
		if err := releaseClient.downloadAssetViaGhCli(ctx, repo, release.TagName, matched.Name, destDir); err != nil {
			return nil, fmt.Errorf("downloading release asset via gh CLI: %w", err)
		}
	} else {
		// The asset download authenticates from the same sources as the API request
		// that resolved it, so a private release resolved with a token can also be
		// fetched with it.
		opts := downloader.DownloadOptions{}
		if authorization := githubAuthorization(githubToken(tool.InstallParams, g.GitHub.Token)); authorization != "" {
			opts.Headers = map[string]string{
				"Authorization": authorization,
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
	if err := validateReleaseRepo(repo); err != nil {
		return nil, err
	}
	ghCli := getBoolParam(tool.InstallParams, "ghCli", false)
	prerelease := getBoolParam(tool.InstallParams, "prerelease", false)
	releaseClient := g.releaseClient()
	token := githubToken(tool.InstallParams, g.GitHub.Token)
	latestKey := releaseClient.cacheKey(repo, "latest", prerelease, token)

	var release *githubRelease
	var isCached bool

	if cached, ok := g.getCachedRelease(ctx, latestKey); ok {
		release = cached
		isCached = true
	}

	if release == nil {
		rel, _, err := releaseClient.fetch(ctx, githubReleaseRequest{
			repo:       repo,
			version:    "latest",
			prerelease: prerelease,
			ghCli:      ghCli,
			token:      token,
		})
		if err != nil {
			return nil, err
		}
		release = rel
		if len(release.Assets) > 0 {
			g.setCachedRelease(latestKey, release)
			g.setCachedRelease(releaseClient.cacheKey(repo, release.TagName, prerelease, token), release)
		}
	}
	return &UpdateCheckResult{
		LatestVersion: release.TagName,
		Cached:        isCached,
	}, nil
}

func (g *GitHubInstaller) matchAsset(assets []githubAsset, assetPattern string) *githubAsset {
	sysCtx := g.sysCtx
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return matchReleaseAsset(assets, githubAssetName, sysCtx.systemInfo(), assetPattern)
}

func init() {
	_ = Register(&GitHubInstaller{
		CacheEnabled: true,
		runner:       exec.NewOSRunner(),
		fsys:         &fs.OSFS{},
		dl:           downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor:    archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
		sysCtx:       NewDefaultSystemContext(),
		httpClient:   http.DefaultClient,
	})
}
