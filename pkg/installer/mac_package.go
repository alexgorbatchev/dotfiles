package installer

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// macPackageSource is the `source` parameter shared by the dmg and pkg
// installers: either a direct URL or a GitHub release to pick an asset from.
type macPackageSource struct {
	url          string
	repo         string
	version      string
	assetPattern string
	ghCli        bool
	prerelease   bool
}

// parseMacPackageSource reads `source` ({ type: 'url', url } or
// { type: 'github-release', repo, version?, assetPattern?, assetSelector?,
// ghCli?, prerelease? }). A bare top-level `url` is accepted as well, which is
// how configurations written before `source` existed spell the direct form.
//
// `assetSelector` is not read here: it is a function, so it never crosses the JSON
// boundary into these parameters. The fetcher calls it back in the VM instead.
func parseMacPackageSource(params map[string]interface{}) (macPackageSource, error) {
	var src macPackageSource
	if sourceMap, ok := params["source"].(map[string]interface{}); ok {
		if getStringParam(sourceMap, "type", "") == "github-release" {
			src.repo = getStringParam(sourceMap, "repo", "")
			src.version = getStringParam(sourceMap, "version", "")
			src.assetPattern = getStringParam(sourceMap, "assetPattern", "")
			src.ghCli = getBoolParam(sourceMap, "ghCli", false)
			src.prerelease = getBoolParam(sourceMap, "prerelease", false)
		} else {
			src.url = getStringParam(sourceMap, "url", "")
		}
	} else if u, ok := params["url"].(string); ok {
		src.url = u
	}

	if src.url == "" && src.repo == "" {
		return src, fmt.Errorf("URL or GitHub release source not specified in installParams")
	}
	if src.repo != "" && len(strings.Split(src.repo, "/")) != 2 {
		return src, fmt.Errorf("invalid repository format %q. Expected 'owner/repo'", src.repo)
	}
	return src, nil
}

// macPackagePayload is a downloaded installer package ready for hdiutil or the
// macOS installer command.
type macPackagePayload struct {
	// packagePath is the .dmg or .pkg to install, possibly inside extractDir.
	packagePath  string
	downloadPath string
	// extractDir is set when the download was an archive wrapping the package.
	extractDir string
	// releaseTag is the GitHub release tag the package came from, if any.
	releaseTag string
}

// cleanup removes everything fetch left in the staging directory.
func (p macPackagePayload) cleanup(fsys fs.FS) {
	if p.extractDir != "" {
		_ = removeAll(fsys, p.extractDir)
	}
	if p.downloadPath != "" {
		_ = removeAll(fsys, p.downloadPath)
	}
}

// macPackageFetcher downloads the package a macPackageSource names into a
// staging directory, resolving GitHub releases through the shared release
// client and unpacking archives that wrap the package.
type macPackageFetcher struct {
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	runner     exec.CommandRunner
	httpClient *http.Client
	baseURL    string
	// github is the project configuration's github section, applied to the release
	// the source names.
	github GitHubSettings
	sysCtx *SystemContext
	log    *logger.Logger // scoped to the tool; nil disables progress lines
}

func (f macPackageFetcher) info(msg string) {
	if f.log != nil {
		f.log.Info(logger.Message(msg))
	}
}

func (f macPackageFetcher) releaseClient() githubReleaseClient {
	return githubReleaseClient{httpClient: f.httpClient, runner: f.runner, baseURL: f.baseURL, userAgent: f.github.UserAgent}
}

// fetch resolves src for tool into destDir and returns the package with
// extension ext (".dmg" or ".pkg"). On failure nothing is left in destDir.
func (f macPackageFetcher) fetch(ctx context.Context, tool *config.ToolConfig, src macPackageSource, destDir, ext string) (macPackagePayload, error) {
	var payload macPackagePayload
	downloadURL := src.url
	downloadName := tool.Name + ext
	viaGhCli := false

	if src.repo != "" {
		version := src.version
		if version == "" && tool.Version != nil {
			version = *tool.Version
		}
		if version == "" {
			version = "latest"
		}
		f.info(fmt.Sprintf("Fetching release info for %s (%s)...", src.repo, version))

		release, ghUsed, err := f.releaseClient().fetch(ctx, githubReleaseRequest{
			repo:       src.repo,
			version:    version,
			prerelease: src.prerelease,
			ghCli:      src.ghCli,
			token:      githubToken(tool.InstallParams, f.github.Token),
		})
		if err != nil {
			return payload, err
		}

		matched, err := f.selectAsset(ctx, tool, release, src, ext)
		if err != nil {
			return payload, err
		}
		downloadURL = matched.BrowserDownloadURL
		downloadName = matched.Name
		payload.releaseTag = release.TagName
		viaGhCli = ghUsed
	} else if name := fileNameFromURL(downloadURL); name != "" {
		downloadName = name
	}

	payload.downloadPath = filepath.Join(destDir, downloadName)
	f.info(fmt.Sprintf("Downloading %s...", downloadName))
	if viaGhCli {
		if err := f.releaseClient().downloadAssetViaGhCli(ctx, src.repo, payload.releaseTag, downloadName, destDir); err != nil {
			payload.cleanup(f.fsys)
			return payload, fmt.Errorf("downloading release asset via gh CLI: %w", err)
		}
	} else if err := f.dl.Download(ctx, downloadURL, payload.downloadPath, ""); err != nil {
		payload.cleanup(f.fsys)
		return payload, fmt.Errorf("downloading %s: %w", downloadName, err)
	}

	payload.packagePath = payload.downloadPath
	if !wrapsMacPackage(downloadName, ext) {
		return payload, nil
	}

	payload.extractDir = filepath.Join(destDir, tool.Name+"-extracted")
	if err := f.fsys.MkdirAll(payload.extractDir, 0755); err != nil {
		payload.cleanup(f.fsys)
		return payload, fmt.Errorf("creating extraction directory: %w", err)
	}
	f.info(fmt.Sprintf("Extracting %s...", downloadName))
	if err := f.extractor.Extract(ctx, payload.downloadPath, payload.extractDir); err != nil {
		payload.cleanup(f.fsys)
		return payload, fmt.Errorf("extracting archive: %w", err)
	}
	found, err := findFileWithExtension(f.fsys, payload.extractDir, ext)
	if err != nil {
		payload.cleanup(f.fsys)
		return payload, fmt.Errorf("searching extracted archive for a %s file: %w", ext, err)
	}
	if found == "" {
		payload.cleanup(f.fsys)
		return payload, fmt.Errorf("no %s file found in extracted archive", ext)
	}
	payload.packagePath = found
	return payload, nil
}

// checkUpdate reports the latest release tag of a GitHub-backed source. A
// direct URL carries no version information, so it never has an update.
func (f macPackageFetcher) checkUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	src, err := parseMacPackageSource(tool.InstallParams)
	if err != nil || src.repo == "" {
		return &UpdateCheckResult{HasUpdate: false}, nil
	}
	release, _, err := f.releaseClient().fetch(ctx, githubReleaseRequest{
		repo:       src.repo,
		version:    "latest",
		prerelease: src.prerelease,
		ghCli:      src.ghCli,
		token:      githubToken(tool.InstallParams, f.github.Token),
	})
	if err != nil {
		return nil, err
	}
	return &UpdateCheckResult{
		HasUpdate:     true,
		LatestVersion: release.TagName,
	}, nil
}

// fileNameFromURL returns the last path segment of rawURL when it looks like a
// file name, or "" so the caller falls back to a generated name.
func fileNameFromURL(rawURL string) string {
	lastSlash := strings.LastIndex(rawURL, "/")
	if lastSlash < 0 {
		return ""
	}
	name := rawURL[lastSlash+1:]
	if name == "" || strings.Contains(name, ":") || !strings.Contains(name, ".") {
		return ""
	}
	return name
}

// macPackageVersion decides the version an installed dmg/pkg reports: the
// output of versionArgs run against binaryPath when configured, otherwise the
// release tag, otherwise the version the configuration pinned.
func macPackageVersion(ctx context.Context, runner exec.CommandRunner, tool *config.ToolConfig, binaryPath, releaseTag, sourceVersion string) string {
	versionArgs := getStringSliceParam(tool.InstallParams, "versionArgs")
	if len(versionArgs) > 0 && binaryPath != "" {
		versionRegex := getStringParam(tool.InstallParams, "versionRegex", "")
		if v, err := detectVersionViaCli(ctx, runner, binaryPath, versionArgs, versionRegex); err == nil && v != "" {
			return v
		}
	}
	if releaseTag != "" {
		return releaseTag
	}
	if sourceVersion != "" && sourceVersion != "latest" {
		return sourceVersion
	}
	if tool.Version != nil && *tool.Version != "latest" {
		return *tool.Version
	}
	return ""
}

// wrapsMacPackage reports whether name is an archive that may contain the
// package rather than the package itself. pkg/archive knows how to open a .dmg
// and a .pkg too, so the package extension is checked first: a download that
// already is the package is handed to the platform installer as-is.
func wrapsMacPackage(name, ext string) bool {
	return !strings.HasSuffix(strings.ToLower(name), ext) && archive.IsSupported(name)
}

// isMacPackageAsset reports whether name is the installer package itself or an
// archive that can wrap one.
func isMacPackageAsset(name, ext string) bool {
	return strings.HasSuffix(strings.ToLower(name), ext) || wrapsMacPackage(name, ext)
}

// matchMacOSAsset picks the release asset for a macOS-only installer whose
// package has extension ext. assetPattern narrows the candidates; among them a
// macOS build for cpuArch that is a package or an archive wins, then any macOS
// build, then any package.
func matchMacOSAsset(assets []githubAsset, pattern, cpuArch, ext string) *githubAsset {
	candidates := assets
	if pattern != "" {
		candidates = nil
		for _, asset := range assets {
			if matchPattern(asset.Name, pattern) {
				candidates = append(candidates, asset)
			}
		}
	}

	isMacOS := func(name string) bool {
		return strings.Contains(name, "darwin") || strings.Contains(name, "macos") || strings.Contains(name, "osx")
	}
	isArch := func(name string) bool {
		if strings.Contains(name, cpuArch) {
			return true
		}
		switch cpuArch {
		case "amd64":
			return strings.Contains(name, "x86_64") || strings.Contains(name, "x64") || strings.Contains(name, "intel")
		case "arm64":
			return strings.Contains(name, "aarch64") || strings.Contains(name, "m1") || strings.Contains(name, "m2") || strings.Contains(name, "m3")
		}
		return false
	}
	// firstPackage returns the first asset in list that is the package itself,
	// else the first archive that may wrap one, else the first asset.
	firstPackage := func(list []githubAsset) *githubAsset {
		for i := range list {
			if strings.HasSuffix(strings.ToLower(list[i].Name), ext) {
				return &list[i]
			}
		}
		for i := range list {
			if wrapsMacPackage(list[i].Name, ext) {
				return &list[i]
			}
		}
		if len(list) > 0 {
			return &list[0]
		}
		return nil
	}

	var archMatches, osMatches []githubAsset
	for _, asset := range candidates {
		name := strings.ToLower(asset.Name)
		if isMacOS(name) || strings.Contains(name, "apple") {
			if isArch(name) {
				archMatches = append(archMatches, asset)
			}
		}
		if isMacOS(name) {
			osMatches = append(osMatches, asset)
		}
	}

	if len(archMatches) > 0 {
		return firstPackage(archMatches)
	}
	if len(osMatches) > 0 {
		return firstPackage(osMatches)
	}
	return firstPackage(candidates)
}
