package installer

import (
	"context"
	"encoding/json"
	"errors"
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
	"golang.org/x/mod/semver"
)

const (
	cargoBinarySourceQuickinstall = "cargo-quickinstall"
	cargoBinarySourceGitHub       = "github-releases"

	cargoVersionSourceCargoToml = "cargo-toml"
	cargoVersionSourceCratesIO  = "crates-io"
	cargoVersionSourceGitHub    = "github-releases"

	cratesIOAPIURL          = "https://crates.io/api/v1/crates"
	cratesIONoVersion       = "0.0.0"
	githubRawBaseURL        = "https://raw.githubusercontent.com"
	githubDownloadBaseURL   = "https://github.com"
	quickinstallReleasesURL = "https://github.com/cargo-bins/cargo-quickinstall/releases/download"
	cargoUserAgent          = "dotfiles-installer (github.com/alexgorbatchev/dotfiles)"
)

// errNoCrateVersion marks crates.io answering that a crate has no version the tool
// can install. The answer is definitive, so Install reports it instead of compiling.
var errNoCrateVersion = errors.New("no crate version to install")

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
// resolved it, so the download URL uses the tag the repository really has; a
// version without one is tried under each spelling of its tag (releaseTagCandidates).
// published is set when crates.io resolved it, so it is known to be a version cargo
// install can fetch; a Cargo.toml or a release tag can name a version never published.
type cargoVersion struct {
	version   string
	tag       string
	published bool
}

// bare returns the version without a leading "v", which is what the
// `{version}` asset placeholder and quickinstall archive names expect.
func (v cargoVersion) bare() string {
	return strings.TrimPrefix(v.version, "v")
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

	// Prereleases are excluded unless the tool asks for them, as github-release does and
	// as cargo's own version requirements do. cargo-toml has no choice to make: it reads
	// the one version the Cargo.toml declares.
	prerelease := getBoolParam(tool.InstallParams, "prerelease", false)

	switch source {
	case cargoVersionSourceCratesIO:
		version, err := c.fetchCratesIOVersion(ctx, crateName, prerelease)
		if err != nil {
			return cargoVersion{}, fmt.Errorf("resolving %s version from crates.io: %w", crateName, err)
		}
		return cargoVersion{version: version, published: true}, nil
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
		tag, err := c.fetchGitHubReleaseTag(ctx, tool, githubRepo, prerelease)
		if err != nil {
			return cargoVersion{}, fmt.Errorf("resolving %s version from GitHub releases: %w", crateName, err)
		}
		return cargoVersion{version: strings.TrimPrefix(tag, "v"), tag: tag}, nil
	default:
		return cargoVersion{}, fmt.Errorf("unknown versionSource %q (expected %s, %s or %s)", source, cargoVersionSourceCargoToml, cargoVersionSourceCratesIO, cargoVersionSourceGitHub)
	}
}

// fetchCratesIOVersion returns the newest version of the crate from the crates.io API:
// max_stable_version, the highest release that is not a prerelease, or max_version, the
// highest of all, when prerelease is set. A crate that has published only prereleases
// has no max_stable_version, and resolving it without prerelease is an error rather
// than a silent move onto a prerelease.
func (c *CargoInstaller) fetchCratesIOVersion(ctx context.Context, crateName string, prerelease bool) (string, error) {
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
			MaxVersion       string `json:"max_version"`
			MaxStableVersion string `json:"max_stable_version"`
		} `json:"crate"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return "", fmt.Errorf("decoding crates.io response: %w", err)
	}
	crate := apiResp.Crate
	// crates.io reports max_version "0.0.0" for a crate with no version it can parse. A
	// crate that really published 0.0.0 has it as its max_stable_version as well.
	if crate.MaxVersion == "" || (crate.MaxVersion == cratesIONoVersion && crate.MaxStableVersion == "") {
		return "", fmt.Errorf("%w: crates.io lists no installable version of %s", errNoCrateVersion, crateName)
	}
	if prerelease {
		return crate.MaxVersion, nil
	}
	if crate.MaxStableVersion != "" {
		return crate.MaxStableVersion, nil
	}
	return "", fmt.Errorf("%w: %s has published only prereleases (newest %s); set prerelease: true to install one", errNoCrateVersion, crateName, crate.MaxVersion)
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

// fetchGitHubReleaseTag returns the tag of the repository's latest release, which is a
// prerelease only when prerelease is set, with the same meaning github-release gives it.
func (c *CargoInstaller) fetchGitHubReleaseTag(ctx context.Context, tool *config.ToolConfig, githubRepo string, prerelease bool) (string, error) {
	releaseClient := githubReleaseClient{httpClient: c.httpClient, runner: c.runner, baseURL: c.GitHubAPIURL, userAgent: c.GitHub.UserAgent}
	release, _, err := releaseClient.fetch(ctx, githubReleaseRequest{
		repo:       githubRepo,
		version:    "latest",
		prerelease: prerelease,
		token:      githubToken(tool.InstallParams, c.GitHub.Token),
	})
	if err != nil {
		return "", err
	}
	if release.TagName == "" {
		return "", fmt.Errorf("latest release of %s has no tag", githubRepo)
	}
	return release.TagName, nil
}

// releaseTagCandidates are the tags a release of version can carry, in the order to
// try them. A version does not record whether its tag has a "v" (sharkdp/bat tags
// v0.24.0, BurntSushi/ripgrep tags 14.1.1). The "v" spelling comes first either way:
// it is the common convention, and a version written as "v1.2.3" names it outright.
func releaseTagCandidates(version string) []string {
	if bare, ok := strings.CutPrefix(version, "v"); ok {
		return []string{version, bare}
	}
	return []string{"v" + version, version}
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
// tagged for ver in githubRepo. A pinned version, from .version() or from the
// version an update check found, arrives without the tag it was released under, so
// each spelling of it is tried against the download URL itself. Release downloads
// are not rate limited the way the GitHub API is, so this needs no API request. Only
// a 404 moves on to the next spelling; any other failure is reported as it is.
func (c *CargoInstaller) tryGithubReleases(ctx context.Context, tool *config.ToolConfig, crateName string, ver cargoVersion) (*InstallResult, error) {
	githubRepo := getStringParam(tool.InstallParams, "githubRepo", "")
	if githubRepo == "" {
		return nil, fmt.Errorf("githubRepo is required for github-releases binarySource")
	}

	platform, arch, err := cargoTargetTriple(c.sysCtx)
	if err != nil {
		return nil, err
	}

	tags := []string{ver.tag}
	if ver.tag == "" {
		tags = releaseTagCandidates(ver.version)
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

	var notFound error
	for _, tag := range tags {
		url := fmt.Sprintf("%s/%s/releases/download/%s/%s", baseURL, githubRepo, tag, assetName)
		binaries, err := c.installArchive(ctx, tool, url, tool.Name+"-gh-release.tar.gz", "")
		if err == nil {
			return &InstallResult{Binaries: binaries, Version: ver.bare()}, nil
		}
		var statusErr *downloader.StatusError
		if !errors.As(err, &statusErr) || statusErr.StatusCode != http.StatusNotFound {
			return nil, fmt.Errorf("github release: %w", err)
		}
		notFound = err
	}
	return nil, fmt.Errorf("github release: %s not found in %s under tag %s: %w", assetName, githubRepo, strings.Join(tags, " or "), notFound)
}

// installPrebuilt resolves the version (unless pinned) and installs the prebuilt
// binary from the configured binary source. It returns the version it resolved even
// when the download fails, for the compile fallback to choose from; the version is
// empty only when resolution itself failed.
func (c *CargoInstaller) installPrebuilt(ctx context.Context, tool *config.ToolConfig, crateName, binarySource, pinned string) (*InstallResult, cargoVersion, error) {
	ver := cargoVersion{version: pinned}
	if pinned == "" {
		resolved, err := c.resolveVersion(ctx, tool, crateName, binarySource)
		if err != nil {
			return nil, cargoVersion{}, err
		}
		ver = resolved
	}
	var res *InstallResult
	var err error
	if binarySource == cargoBinarySourceGitHub {
		res, err = c.tryGithubReleases(ctx, tool, crateName, ver)
	} else {
		res, err = c.tryQuickinstall(ctx, tool, crateName, ver.bare())
	}
	return res, ver, err
}

// cargoFallbackVersion picks the version cargo install compiles when the prebuilt
// download of an unpinned crate failed with prebuiltErr, having resolved ver (empty
// when resolution itself failed). Empty lets cargo install compile its own newest
// stable release, which is what an unpinned install without prereleases asks for.
//
// A version crates.io resolved is compiled as it is, so the fallback installs what an
// update check reports. Any other resolved version is compiled only for a prerelease
// opt-in, which cargo's default would drop: a Cargo.toml or release tag can name a
// version that was never published, and --version would then fail where cargo's
// default compiles. A version cargo install cannot take (isCrateVersion) leaves an
// opt-in nothing to compile, which is an error. crates.io saying the crate has no
// version to install is final either way.
func cargoFallbackVersion(crateName string, ver cargoVersion, prerelease bool, prebuiltErr error) (string, error) {
	if errors.Is(prebuiltErr, errNoCrateVersion) {
		return "", prebuiltErr
	}
	resolved := ver.bare()
	if (ver.published || prerelease) && isCrateVersion(resolved) {
		return resolved, nil
	}
	if !prerelease {
		return "", nil
	}
	if resolved == "" {
		return "", fmt.Errorf("installing a prerelease of %s: %w", crateName, prebuiltErr)
	}
	return "", fmt.Errorf("installing a prerelease of %s: cargo install cannot compile %q, which is not a MAJOR.MINOR.PATCH crate version: %w", crateName, resolved, prebuiltErr)
}

// isCrateVersion reports whether version is exactly MAJOR.MINOR.PATCH with an optional
// prerelease, the only form cargo install --version accepts without an operator.
func isCrateVersion(version string) bool {
	v := "v" + version
	return semver.IsValid(v) && semver.Canonical(v) == v
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

	// version is what cargo install compiles; empty lets cargo pick its newest stable.
	version := pinned
	binarySource := getStringParam(tool.InstallParams, "binarySource", cargoBinarySourceQuickinstall)
	prebuilt := binarySource == cargoBinarySourceQuickinstall || binarySource == cargoBinarySourceGitHub
	if prebuilt && c.dl != nil && c.extractor != nil {
		res, resolved, err := c.installPrebuilt(ctx, tool, crateName, binarySource, pinned)
		if err == nil {
			return res, nil
		}
		if pinned == "" {
			fallback, fallbackErr := cargoFallbackVersion(crateName, resolved, getBoolParam(tool.InstallParams, "prerelease", false), err)
			if fallbackErr != nil {
				return nil, fallbackErr
			}
			version = fallback
		}
		if c.log != nil {
			c.log.Warn(logger.Message(fmt.Sprintf("%s failed, falling back to local compilation", binarySource)), "error", err)
		}
	}

	args := []string{"install"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}
	if version != "" {
		args = append(args, "--version", version)
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
		Version:  version,
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
