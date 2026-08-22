package updater

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
)

const maxBinaryDecompressedSize int64 = 100 * 1024 * 1024 // 100MB limit against zip bomb risks

var (
	// ErrNoReleaseFound is returned when no matching GitHub release was found.
	ErrNoReleaseFound = errors.New("no matching release found")
	// ErrAssetNotFound is returned when no matching platform archive asset is found in the release.
	ErrAssetNotFound = errors.New("no matching release archive asset found for system platform")
	// ErrChecksumNotFound is returned when the asset's SHA-256 hash is missing from checksums.txt.
	ErrChecksumNotFound = errors.New("asset checksum not found in checksums.txt")
	// ErrChecksumMismatch is returned when downloaded archive hash does not match expected checksum.
	ErrChecksumMismatch = errors.New("checksum mismatch for downloaded release archive")
)

// Config configures the Updater instance.
type Config struct {
	BaseURL    string
	GitHubRepo string
	HTTPClient *http.Client
	FS         fs.FS
}

// Options configures a check or upgrade invocation.
type Options struct {
	CurrentVersion  string
	TargetVersion   string
	AllowPrerelease bool
	Force           bool
	DryRun          bool
	ExecPath        string
	OS              string
	Arch            string
}

// ReleaseAsset represents an asset attached to a GitHub release.
type ReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// GitHubRelease represents a release object returned by GitHub API.
type GitHubRelease struct {
	TagName     string         `json:"tag_name"`
	Prerelease  bool           `json:"prerelease"`
	PublishedAt time.Time      `json:"published_at"`
	Body        string         `json:"body"`
	Assets      []ReleaseAsset `json:"assets"`
}

// UpdateResult provides the summary status of an update evaluation or operation.
type UpdateResult struct {
	HasUpdate      bool
	CurrentVersion string
	LatestVersion  string
	ReleaseNotes   string
	Updated        bool
	ExecutablePath string
}

// Updater handles checking for and upgrading the running dotfiles binary.
type Updater struct {
	baseURL    string
	githubRepo string
	client     *http.Client
	fsys       fs.FS
	downloader *downloader.Downloader
}

// New creates a new Updater configured with defaults or overrides.
func New(cfg Config) *Updater {
	repo := cfg.GitHubRepo
	if repo == "" {
		repo = "alexgorbatchev/dotfiles"
	}

	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{
			Timeout: 30 * time.Second,
		}
	}

	fsys := cfg.FS
	if fsys == nil {
		fsys = fs.NewOSFS()
	}

	dl := downloader.NewDownloader(fsys, client)

	return &Updater{
		baseURL:    strings.TrimSuffix(cfg.BaseURL, "/"),
		githubRepo: repo,
		client:     client,
		fsys:       fsys,
		downloader: dl,
	}
}

// fetchReleases retrieves releases from GitHub, optionally querying target tag directly.
func (u *Updater) fetchReleases(ctx context.Context, targetVersion string) ([]GitHubRelease, error) {
	if targetVersion != "" {
		tag := version.CleanVersion(targetVersion)
		var tagURL string
		if u.baseURL != "" {
			tagURL = fmt.Sprintf("%s/repos/%s/releases/tags/%s", u.baseURL, u.githubRepo, tag)
		} else {
			tagURL = fmt.Sprintf("https://api.github.com/repos/%s/releases/tags/%s", u.githubRepo, tag)
		}

		req, err := http.NewRequestWithContext(ctx, "GET", tagURL, nil)
		if err == nil {
			req.Header.Set("Accept", "application/vnd.github.v3+json")
			req.Header.Set("User-Agent", "dotfiles-updater")

			resp, err := u.client.Do(req)
			if err == nil && resp.StatusCode == http.StatusOK {
				var rel GitHubRelease
				if jsonErr := json.NewDecoder(resp.Body).Decode(&rel); jsonErr == nil {
					resp.Body.Close()
					return []GitHubRelease{rel}, nil
				}
				resp.Body.Close()
			} else if resp != nil {
				resp.Body.Close()
			}
		}
	}

	var apiURL string
	if u.baseURL != "" {
		apiURL = fmt.Sprintf("%s/repos/%s/releases", u.baseURL, u.githubRepo)
	} else {
		apiURL = fmt.Sprintf("https://api.github.com/repos/%s/releases", u.githubRepo)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating releases request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "dotfiles-updater")

	resp, err := u.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching releases from GitHub: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github api request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var releases []GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("decoding releases response: %w", err)
	}

	return releases, nil
}

// findTargetRelease locates the appropriate release given targetVersion or highest semver.
func findTargetRelease(releases []GitHubRelease, opts Options) (*GitHubRelease, error) {
	if len(releases) == 0 {
		return nil, ErrNoReleaseFound
	}

	if opts.TargetVersion != "" {
		cleanTarget := version.CleanVersion(opts.TargetVersion)
		for _, rel := range releases {
			if version.CleanVersion(rel.TagName) == cleanTarget {
				return &rel, nil
			}
		}
		return nil, fmt.Errorf("%w: version %s", ErrNoReleaseFound, opts.TargetVersion)
	}

	var best *GitHubRelease
	var bestClean string

	for i := range releases {
		rel := &releases[i]
		if rel.Prerelease && !opts.AllowPrerelease {
			continue
		}

		cleanTag := version.CleanVersion(rel.TagName)
		if best == nil {
			best = rel
			bestClean = cleanTag
			continue
		}

		if version.CheckVersionStatus(bestClean, cleanTag) == version.StatusNewerAvailable {
			best = rel
			bestClean = cleanTag
		}
	}

	if best == nil {
		return nil, ErrNoReleaseFound
	}

	return best, nil
}

// CheckForUpdate queries GitHub for available releases and compares with current version.
func (u *Updater) CheckForUpdate(ctx context.Context, opts Options) (*UpdateResult, error) {
	releases, err := u.fetchReleases(ctx, opts.TargetVersion)
	if err != nil {
		return nil, err
	}

	rel, err := findTargetRelease(releases, opts)
	if err != nil {
		return nil, err
	}

	cleanLatest := version.ParseVersion(rel.TagName)
	cleanCurrent := version.ParseVersion(opts.CurrentVersion)

	status := version.CheckVersionStatus(cleanCurrent, cleanLatest)
	hasUpdate := status == version.StatusNewerAvailable || (opts.TargetVersion != "" && cleanCurrent != cleanLatest)

	return &UpdateResult{
		HasUpdate:      hasUpdate,
		CurrentVersion: cleanCurrent,
		LatestVersion:  cleanLatest,
		ReleaseNotes:   rel.Body,
		Updated:        false,
	}, nil
}

// Upgrade performs the self-update operation.
func (u *Updater) Upgrade(ctx context.Context, opts Options) (*UpdateResult, error) {
	execPath := opts.ExecPath
	if execPath == "" {
		var err error
		execPath, err = os.Executable()
		if err != nil {
			return nil, fmt.Errorf("resolving current executable path: %w", err)
		}
	}

	resolvedPath, err := filepath.EvalSymlinks(execPath)
	if err == nil {
		execPath = resolvedPath
	}

	releases, err := u.fetchReleases(ctx, opts.TargetVersion)
	if err != nil {
		return nil, err
	}

	rel, err := findTargetRelease(releases, opts)
	if err != nil {
		return nil, err
	}

	cleanLatest := version.ParseVersion(rel.TagName)
	cleanCurrent := version.ParseVersion(opts.CurrentVersion)

	status := version.CheckVersionStatus(cleanCurrent, cleanLatest)
	hasUpdate := status == version.StatusNewerAvailable || (opts.TargetVersion != "" && cleanCurrent != cleanLatest)

	result := &UpdateResult{
		HasUpdate:      hasUpdate,
		CurrentVersion: cleanCurrent,
		LatestVersion:  cleanLatest,
		ReleaseNotes:   rel.Body,
		ExecutablePath: execPath,
	}

	if !hasUpdate && !opts.Force {
		return result, nil
	}

	if opts.DryRun {
		result.Updated = false
		return result, nil
	}

	// 1. Locate platform tarball and checksums.txt in release assets
	goos := opts.OS
	if goos == "" {
		goos = runtime.GOOS
	}
	goarch := opts.Arch
	if goarch == "" {
		goarch = runtime.GOARCH
	}

	expectedTarName := fmt.Sprintf("dotfiles_%s_%s_%s.tar.gz", cleanLatest, goos, goarch)
	var archiveAsset *ReleaseAsset
	var checksumsAsset *ReleaseAsset

	for i := range rel.Assets {
		asset := &rel.Assets[i]
		if asset.Name == expectedTarName {
			archiveAsset = asset
		} else if asset.Name == "checksums.txt" {
			checksumsAsset = asset
		}
	}

	if archiveAsset == nil {
		return nil, fmt.Errorf("%w: %s", ErrAssetNotFound, expectedTarName)
	}

	// 2. Require checksums.txt and extract expected hash (mandatory security boundary)
	if checksumsAsset == nil {
		return nil, fmt.Errorf("%w: missing checksums.txt asset in release %s", ErrChecksumNotFound, rel.TagName)
	}

	checksumsData, err := u.downloadBytes(ctx, checksumsAsset.BrowserDownloadURL)
	if err != nil {
		return nil, fmt.Errorf("downloading checksums.txt: %w", err)
	}
	expectedHash, err := parseChecksum(string(checksumsData), expectedTarName)
	if err != nil {
		return nil, fmt.Errorf("parsing checksum for %s: %w", expectedTarName, err)
	}

	// 3. Download release archive to temp directory in target location
	targetDir := filepath.Dir(execPath)
	tmpDir, err := os.MkdirTemp(targetDir, ".dotfiles-upgrade-*")
	if err != nil {
		return nil, fmt.Errorf("creating temp directory in %s: %w", targetDir, err)
	}
	defer os.RemoveAll(tmpDir)

	tmpTarPath := filepath.Join(tmpDir, expectedTarName)
	if err := u.downloader.Download(ctx, archiveAsset.BrowserDownloadURL, tmpTarPath, expectedHash, downloader.DownloadOptions{
		Quiet: true,
	}); err != nil {
		return nil, fmt.Errorf("downloading release archive %s: %w", expectedTarName, err)
	}

	// 4. Extract target binary from tarball
	extractedBinPath, err := extractBinaryFromTarGz(tmpTarPath, tmpDir)
	if err != nil {
		return nil, fmt.Errorf("extracting binary from release archive: %w", err)
	}

	// 5. Replace binary atomically
	if err := replaceBinary(extractedBinPath, execPath); err != nil {
		return nil, fmt.Errorf("replacing executable at %s: %w", execPath, err)
	}

	result.Updated = true
	return result, nil
}

func (u *Updater) downloadBytes(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download request failed with status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func parseChecksum(checksumsText, targetFilename string) (string, error) {
	lines := strings.Split(checksumsText, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			hash := fields[0]
			filename := filepath.Base(fields[1])
			filename = strings.TrimPrefix(filename, "*")
			cleanTarget := strings.TrimPrefix(targetFilename, "*")
			if filename == cleanTarget || fields[1] == cleanTarget {
				return hash, nil
			}
		}
	}
	return "", fmt.Errorf("%w for %s", ErrChecksumNotFound, targetFilename)
}

func extractBinaryFromTarGz(tarPath, outDir string) (string, error) {
	f, err := os.Open(tarPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	expectedBinName := "dotfiles"
	if runtime.GOOS == "windows" {
		expectedBinName = "dotfiles.exe"
	}

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}

		baseName := filepath.Base(hdr.Name)
		if baseName == expectedBinName && hdr.Typeflag == tar.TypeReg {
			destPath := filepath.Join(outDir, expectedBinName)
			out, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				return "", err
			}
			if _, err := io.Copy(out, io.LimitReader(tr, maxBinaryDecompressedSize)); err != nil {
				out.Close()
				return "", err
			}
			_ = out.Close()
			return destPath, nil
		}
	}

	return "", fmt.Errorf("binary executable %q not found in archive", expectedBinName)
}

func replaceBinary(newBinPath, targetPath string) error {
	_ = os.Chmod(newBinPath, 0755)
	return replaceExecutable(newBinPath, targetPath)
}
