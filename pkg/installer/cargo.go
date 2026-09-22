package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

const (
	cargoBinarySourceQuickinstall = "cargo-quickinstall"
	cargoBinarySourceGitHub       = "github-releases"

	cargoVersionSourceCargoToml = "cargo-toml"
	cargoVersionSourceCratesIO  = "crates-io"
	cargoVersionSourceGitHub    = "github-releases"

	cratesIOAPIURL          = "https://crates.io/api/v1/crates"
	githubRawBaseURL        = "https://raw.githubusercontent.com"
	githubDownloadBaseURL   = "https://github.com"
	quickinstallReleasesURL = "https://github.com/cargo-bins/cargo-quickinstall/releases/download"
	cargoUserAgent          = "dotfiles-installer (github.com/alexgorbatchev/dotfiles)"
)

type CargoInstaller struct {
	log          *logger.Logger
	runner       exec.CommandRunner
	fsys         fs.FS
	dl           *downloader.Downloader
	extractor    *archive.Extractor
	sysCtx       *SystemContext
	httpClient   *http.Client
	BinDir       string // Optional destination directory
	BaseURL      string // Override for testing quickinstall and GitHub release downloads
	CratesIOURL  string // Override for testing the crates.io API
	GitHubAPIURL string // GitHub API root; empty selects api.github.com
	GitHubRawURL string // Override for testing raw Cargo.toml fetches
	// GitHub holds the project configuration's github section, which applies when a
	// crate's version or binary comes from a GitHub release.
	GitHub GitHubSettings
}

// SetGitHubSettings applies the project configuration's github section. The host
// governs the release API only: the hosts a crate's archive is downloaded from are
// the cargo section's own githubRelease and githubRaw settings.
func (c *CargoInstaller) SetGitHubSettings(settings GitHubSettings) {
	c.GitHub = settings
	if settings.Host != "" {
		c.GitHubAPIURL = settings.Host
	}
}

// cargoVersion is a resolved crate version. tag is set when a GitHub release
// resolved it, so the download URL uses the tag the repository really has.
type cargoVersion struct {
	version string
	tag     string
}

// bare returns the version without a leading "v", which is what the
// `{version}` asset placeholder and quickinstall archive names expect.
func (v cargoVersion) bare() string {
	return strings.TrimPrefix(v.version, "v")
}

// releaseTag returns the GitHub release tag to download from: the tag that
// resolved the version when known, otherwise the conventional "v" prefix.
func (v cargoVersion) releaseTag() string {
	if v.tag != "" {
		return v.tag
	}
	if strings.HasPrefix(v.version, "v") {
		return v.version
	}
	return "v" + v.version
}

func NewCargoInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CargoInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	if dl == nil {
		dl = downloader.NewDownloader(fsys, nil)
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &CargoInstaller{
		runner:    runner,
		fsys:      fsys,
		dl:        dl,
		extractor: extractor,
		sysCtx:    sysCtx,
	}
}

func (c *CargoInstaller) Name() string {
	return "cargo"
}

// SetSystemContext applies the target the run was invoked for.
func (c *CargoInstaller) SetSystemContext(sysCtx *SystemContext) {
	c.sysCtx = sysCtx
}

func (c *CargoInstaller) SetFS(fsys fs.FS) {
	c.fsys = fsys
	if c.dl != nil {
		c.dl.SetFS(fsys)
	}
	if c.extractor != nil {
		c.extractor.SetFS(fsys)
	}
}

func (c *CargoInstaller) SetLogger(log *logger.Logger) {
	c.log = log
	if c.dl != nil && log != nil {
		c.dl.SetQuiet(log.Level() == logger.LogLevelQuiet)
	}
}

func (c *CargoInstaller) SetDownloadSettings(settings downloader.Settings) {
	c.dl.Apply(settings)
}

func (c *CargoInstaller) SetHTTPClient(client *http.Client) {
	c.httpClient = client
	c.dl.SetHTTPClient(client)
}

func (c *CargoInstaller) SupportsSudo() bool {
	return false
}

func (c *CargoInstaller) client() *http.Client {
	if c.httpClient == nil {
		return http.DefaultClient
	}
	return c.httpClient
}

func (c *CargoInstaller) cratesIOURL() string {
	if c.CratesIOURL != "" {
		return c.CratesIOURL
	}
	return cratesIOAPIURL
}

func (c *CargoInstaller) githubRawURL() string {
	if c.GitHubRawURL != "" {
		return strings.TrimSuffix(c.GitHubRawURL, "/")
	}
	return githubRawBaseURL
}

// cargoTargetTriple maps the system context onto the platform and architecture
// segments of a Rust target triple, which both quickinstall and GitHub release
// asset names are built from.
func cargoTargetTriple(sysCtx *SystemContext) (platform string, arch string, err error) {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	switch sysCtx.OS {
	case "darwin":
		platform = "apple-darwin"
	case "linux":
		platform = "unknown-linux-gnu"
	case "windows":
		platform = "pc-windows-msvc"
	default:
		return "", "", fmt.Errorf("unsupported OS for prebuilt cargo binaries: %s", sysCtx.OS)
	}
	switch sysCtx.Arch {
	case "amd64":
		arch = "x86_64"
	case "arm64":
		arch = "aarch64"
	default:
		return "", "", fmt.Errorf("unsupported arch for prebuilt cargo binaries: %s", sysCtx.Arch)
	}
	return platform, arch, nil
}

// defaultCargoVersionSource picks where a version comes from when the tool does
// not say. A Cargo.toml URL is only ever given to be read, a GitHub release
// download can only succeed with a tag the repository really has, and
// quickinstall builds what crates.io publishes.
func defaultCargoVersionSource(binarySource, cargoTomlURL string) string {
	switch {
	case cargoTomlURL != "":
		return cargoVersionSourceCargoToml
	case binarySource == cargoBinarySourceGitHub:
		return cargoVersionSourceGitHub
	default:
		return cargoVersionSourceCratesIO
	}
}

// resolveVersion determines the crate version to install from the configured
// versionSource (cargo-toml, crates-io or github-releases).
func (c *CargoInstaller) resolveVersion(ctx context.Context, tool *config.ToolConfig, crateName, binarySource string) (cargoVersion, error) {
	githubRepo := getStringParam(tool.InstallParams, "githubRepo", "")
	cargoTomlURL := getStringParam(tool.InstallParams, "cargoTomlUrl", "")
	source := getStringParam(tool.InstallParams, "versionSource", "")
	if source == "" {
		source = defaultCargoVersionSource(binarySource, cargoTomlURL)
	}

	if toolLog := toolLogger(c.log, tool.Name); toolLog != nil {
		toolLog.Info(logger.Message(fmt.Sprintf("Resolving %s version from %s...", crateName, source)))
	}

	switch source {
	case cargoVersionSourceCratesIO:
		version, err := c.fetchCratesIOVersion(ctx, crateName)
		if err != nil {
			return cargoVersion{}, fmt.Errorf("resolving %s version from crates.io: %w", crateName, err)
		}
		return cargoVersion{version: version}, nil
	case cargoVersionSourceCargoToml:
		if cargoTomlURL == "" {
			if githubRepo == "" {
				return cargoVersion{}, fmt.Errorf("versionSource %q requires githubRepo or cargoTomlUrl", source)
			}
			cargoTomlURL = fmt.Sprintf("%s/%s/main/Cargo.toml", c.githubRawURL(), githubRepo)
		}
		version, err := c.fetchCargoTomlVersion(ctx, cargoTomlURL)
		if err != nil {
			return cargoVersion{}, fmt.Errorf("resolving %s version from %s: %w", crateName, cargoTomlURL, err)
		}
		return cargoVersion{version: version}, nil
	case cargoVersionSourceGitHub:
		if githubRepo == "" {
			return cargoVersion{}, fmt.Errorf("githubRepo is required when versionSource is %q", source)
		}
		tag, err := c.fetchGitHubReleaseTag(ctx, tool, githubRepo)
		if err != nil {
			return cargoVersion{}, fmt.Errorf("resolving %s version from GitHub releases: %w", crateName, err)
		}
		return cargoVersion{version: strings.TrimPrefix(tag, "v"), tag: tag}, nil
	default:
		return cargoVersion{}, fmt.Errorf("unknown versionSource %q (expected %s, %s or %s)", source, cargoVersionSourceCargoToml, cargoVersionSourceCratesIO, cargoVersionSourceGitHub)
	}
}

// fetchCratesIOVersion returns the crate's max_version from the crates.io API.
func (c *CargoInstaller) fetchCratesIOVersion(ctx context.Context, crateName string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/%s", c.cratesIOURL(), crateName), nil)
	if err != nil {
		return "", fmt.Errorf("creating request to crates.io: %w", err)
	}
	req.Header.Set("User-Agent", cargoUserAgent)

	resp, err := c.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching from crates.io: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("crates.io returned status: %d", resp.StatusCode)
	}

	var apiResp struct {
		Crate struct {
			MaxVersion string `json:"max_version"`
		} `json:"crate"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return "", fmt.Errorf("decoding crates.io response: %w", err)
	}
	if apiResp.Crate.MaxVersion == "" {
		return "", fmt.Errorf("crates.io returned empty max_version")
	}
	return apiResp.Crate.MaxVersion, nil
}

// fetchCargoTomlVersion downloads a Cargo.toml and returns its [package] version.
func (c *CargoInstaller) fetchCargoTomlVersion(ctx context.Context, cargoTomlURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cargoTomlURL, nil)
	if err != nil {
		return "", fmt.Errorf("creating Cargo.toml request: %w", err)
	}
	req.Header.Set("User-Agent", cargoUserAgent)

	resp, err := c.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching Cargo.toml: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Cargo.toml request returned status: %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading Cargo.toml: %w", err)
	}
	return parseCargoTomlPackageVersion(body)
}

// parseCargoTomlPackageVersion extracts `version` from the [package] table of a
// Cargo.toml. Only a quoted string is accepted: a workspace-inherited version
// (`version.workspace = true`) is not a version and is reported as such.
func parseCargoTomlPackageVersion(data []byte) (string, error) {
	inPackage := false
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			header, _, _ := strings.Cut(line, "#")
			inPackage = strings.TrimSpace(header) == "[package]"
			continue
		}
		if !inPackage {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "version.workspace" || (key == "version" && strings.HasPrefix(value, "{")) {
			return "", fmt.Errorf("[package] version is inherited from the workspace; set cargoTomlUrl to the crate's own Cargo.toml or use another versionSource")
		}
		if key != "version" {
			continue
		}
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') {
			if end := strings.IndexByte(value[1:], value[0]); end >= 0 {
				return value[1 : 1+end], nil
			}
		}
		return "", fmt.Errorf("[package] version %q is not a string", value)
	}
	return "", fmt.Errorf("no [package] version found in Cargo.toml")
}

// fetchGitHubReleaseTag returns the tag of the repository's latest release.
func (c *CargoInstaller) fetchGitHubReleaseTag(ctx context.Context, tool *config.ToolConfig, githubRepo string) (string, error) {
	releaseClient := githubReleaseClient{httpClient: c.httpClient, runner: c.runner, baseURL: c.GitHubAPIURL, userAgent: c.GitHub.UserAgent}
	release, _, err := releaseClient.fetch(ctx, githubReleaseRequest{
		repo:    githubRepo,
		version: "latest",
		token:   githubToken(tool.InstallParams, c.GitHub.Token),
	})
	if err != nil {
		return "", err
	}
	if release.TagName == "" {
		return "", fmt.Errorf("latest release of %s has no tag", githubRepo)
	}
	return release.TagName, nil
}

// installArchive downloads a prebuilt archive into the tool directory, extracts
// it and promotes the declared binaries.
func (c *CargoInstaller) installArchive(ctx context.Context, tool *config.ToolConfig, url, archiveName, sha256 string) ([]string, error) {
	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	archivePath := filepath.Join(destDir, archiveName)
	if err := c.dl.Download(ctx, url, archivePath, sha256); err != nil {
		return nil, fmt.Errorf("downloading archive: %w", err)
	}

	if err := c.extractor.Extract(ctx, archivePath, destDir); err != nil {
		_ = c.fsys.Remove(archivePath)
		return nil, fmt.Errorf("extracting archive: %w", err)
	}
	_ = c.fsys.Remove(archivePath)

	promotedBinaries, err := PromoteBinaries(c.fsys, destDir, tool.Name, tool.Binaries)
	if err != nil {
		return nil, fmt.Errorf("promoting binaries: %w", err)
	}
	return promotedBinaries, nil
}

// tryQuickinstall downloads the cargo-quickinstall build of a concrete version.
func (c *CargoInstaller) tryQuickinstall(ctx context.Context, tool *config.ToolConfig, crateName string, version string) (*InstallResult, error) {
	platform, arch, err := cargoTargetTriple(c.sysCtx)
	if err != nil {
		return nil, err
	}

	baseURL := quickinstallReleasesURL
	if c.BaseURL != "" {
		baseURL = c.BaseURL
	}
	url := fmt.Sprintf("%s/%s-%s/%s-%s-%s-%s.tar.gz", baseURL, crateName, version, crateName, version, arch, platform)

	binaries, err := c.installArchive(ctx, tool, url, tool.Name+"-quickinstall.tar.gz", getStringParam(tool.InstallParams, "sha256", ""))
	if err != nil {
		return nil, fmt.Errorf("quickinstall: %w", err)
	}
	return &InstallResult{Binaries: binaries, Version: version}, nil
}

// tryGithubReleases downloads the asset assetPattern names from the release
// tagged for ver in githubRepo.
func (c *CargoInstaller) tryGithubReleases(ctx context.Context, tool *config.ToolConfig, crateName string, ver cargoVersion) (*InstallResult, error) {
	githubRepo := getStringParam(tool.InstallParams, "githubRepo", "")
	if githubRepo == "" {
		return nil, fmt.Errorf("githubRepo is required for github-releases binarySource")
	}

	platform, arch, err := cargoTargetTriple(c.sysCtx)
	if err != nil {
		return nil, err
	}

	assetPattern := getStringParam(tool.InstallParams, "assetPattern", "{crateName}-{version}-{platform}-{arch}.tar.gz")
	assetName := strings.NewReplacer(
		"{crateName}", crateName,
		"{version}", ver.bare(),
		"{platform}", platform,
		"{arch}", arch,
	).Replace(assetPattern)

	baseURL := githubDownloadBaseURL
	if c.BaseURL != "" {
		baseURL = c.BaseURL
	}
	url := fmt.Sprintf("%s/%s/releases/download/%s/%s", baseURL, githubRepo, ver.releaseTag(), assetName)

	binaries, err := c.installArchive(ctx, tool, url, tool.Name+"-gh-release.tar.gz", "")
	if err != nil {
		return nil, fmt.Errorf("github release: %w", err)
	}
	return &InstallResult{Binaries: binaries, Version: ver.bare()}, nil
}

// installPrebuilt resolves the version (unless pinned) and installs the
// prebuilt binary from the configured binary source.
func (c *CargoInstaller) installPrebuilt(ctx context.Context, tool *config.ToolConfig, crateName, binarySource, pinned string) (*InstallResult, error) {
	ver := cargoVersion{version: pinned}
	if pinned == "" {
		resolved, err := c.resolveVersion(ctx, tool, crateName, binarySource)
		if err != nil {
			return nil, err
		}
		ver = resolved
	}
	if binarySource == cargoBinarySourceGitHub {
		return c.tryGithubReleases(ctx, tool, crateName, ver)
	}
	return c.tryQuickinstall(ctx, tool, crateName, ver.bare())
}

func (c *CargoInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(c, tool); err != nil {
		return nil, err
	}
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	pinned := ""
	if tool.Version != nil && *tool.Version != "latest" {
		pinned = *tool.Version
	}

	binarySource := getStringParam(tool.InstallParams, "binarySource", cargoBinarySourceQuickinstall)
	prebuilt := binarySource == cargoBinarySourceQuickinstall || binarySource == cargoBinarySourceGitHub
	if prebuilt && c.dl != nil && c.extractor != nil {
		res, err := c.installPrebuilt(ctx, tool, crateName, binarySource, pinned)
		if err == nil {
			return res, nil
		}
		if c.log != nil {
			c.log.Warn(logger.Message(fmt.Sprintf("%s failed, falling back to local compilation", binarySource)), "error", err)
		}
	}

	args := []string{"install"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}
	if pinned != "" {
		args = append(args, "--version", pinned)
	}
	args = append(args, crateName)

	var writer *logger.LineWriter
	if c.log != nil {
		writer = logger.NewLineWriter(c.log.WithTag(tool.Name), "|")
		c.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ cargo %s", strings.Join(args, " "))))
	}
	cmd := c.runner.CommandContext(ctx, "cargo", args...)
	if writer != nil {
		cmd.SetStdout(writer)
		cmd.SetStderr(writer)
	}
	if err := cmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("cargo install %s: %w", crateName, err)
	}
	if writer != nil {
		writer.Flush()
	}

	promotedBinaries, err := PromoteBinaries(c.fsys, c.BinDir, tool.Name, tool.Binaries)
	if err != nil {
		return nil, err
	}

	return &InstallResult{
		Binaries: promotedBinaries,
		Version:  pinned,
	}, nil
}

func (c *CargoInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	args := []string{"uninstall"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}
	args = append(args, crateName)

	cmd := c.runner.CommandContext(ctx, "cargo", args...)
	return cmd.Run()
}

// CheckUpdate reports the version an install of "latest" would resolve, asking the
// same versionSource Install does (crates.io unless the tool says otherwise), so the
// check and the update it leads to cannot disagree about which version exists. The
// version the tool pins does not enter into it: the check is about what upstream
// offers, and the caller compares that with what is installed.
func (c *CargoInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	binarySource := getStringParam(tool.InstallParams, "binarySource", cargoBinarySourceQuickinstall)
	latest, err := c.resolveVersion(ctx, tool, crateName, binarySource)
	if err != nil {
		return nil, fmt.Errorf("checking %s for updates: %w", tool.Name, err)
	}
	return &UpdateCheckResult{LatestVersion: latest.bare()}, nil
}

func init() {
	_ = Register(&CargoInstaller{
		runner:    exec.NewOSRunner(),
		fsys:      &fs.OSFS{},
		dl:        downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor: archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
	})
}
