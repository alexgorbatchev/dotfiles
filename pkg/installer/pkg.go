package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type PkgInstaller struct {
	log        *logger.Logger
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	BinDir     string // Optional destination dir
	BaseURL    string // Override for testing
}

func NewPkgInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *PkgInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	if dl == nil {
		dl = downloader.NewDownloader(fsys, nil)
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &PkgInstaller{
		runner:     runner,
		fsys:       fsys,
		dl:         dl,
		extractor:  extractor,
		sysCtx:     sysCtx,
		httpClient: http.DefaultClient,
	}
}

func (p *PkgInstaller) Name() string {
	return "pkg"
}

func (p *PkgInstaller) SetFS(fsys fs.FS) {
	p.fsys = fsys
	if p.dl != nil {
		p.dl.SetFS(fsys)
	}
	if p.extractor != nil {
		p.extractor.SetFS(fsys)
	}
}

func (p *PkgInstaller) SetLogger(log *logger.Logger) {
	p.log = log
	if p.dl != nil && log != nil {
		p.dl.SetQuiet(log.Level() == logger.LogLevelQuiet)
	}
}

func (p *PkgInstaller) SetDownloadCache(cacheDir string, ttl time.Duration, enabled bool) {
	ApplyDownloadCacheSettings(p.dl, cacheDir, ttl, enabled)
}

func (p *PkgInstaller) SetHTTPClient(client *http.Client) {
	p.httpClient = client
	p.dl.SetHTTPClient(client)
}

func (p *PkgInstaller) SupportsSudo() bool {
	return true
}

func (p *PkgInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(p, tool); err != nil {
		return nil, err
	}
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	// Gated on macOS only (unless testing override is enabled)
	if p.sysCtx.OS != "darwin" && os.Getenv("DOTFILES_TEST_PKG_ALLOW_NON_MACOS") != "1" {
		return &InstallResult{
			Binaries: []string{},
		}, nil
	}

	var downloadURL string
	var repo string
	var version string
	var assetPattern string
	var assetSelector string

	if tool.InstallParams != nil {
		if sourceMap, ok := tool.InstallParams["source"].(map[string]interface{}); ok {
			sourceType := getStringParam(sourceMap, "type", "")
			if sourceType == "url" {
				downloadURL = getStringParam(sourceMap, "url", "")
			} else if sourceType == "github-release" {
				repo = getStringParam(sourceMap, "repo", "")
				version = getStringParam(sourceMap, "version", "")
				assetPattern = getStringParam(sourceMap, "assetPattern", "")
				assetSelector = getStringParam(sourceMap, "assetSelector", "")
			} else {
				downloadURL = getStringParam(sourceMap, "url", "")
			}
		} else if u, ok := tool.InstallParams["url"].(string); ok {
			downloadURL = u
		}
	}

	if downloadURL == "" && repo == "" {
		return nil, fmt.Errorf("URL or GitHub release source not specified in installParams")
	}

	destDir := p.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := p.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating staging folder: %w", err)
	}

	var downloadName string
	var detectedVersion string

	if repo != "" {
		parts := strings.Split(repo, "/")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid repository format %q. Expected 'owner/repo'", repo)
		}

		if version == "" && tool.Version != nil {
			version = *tool.Version
		}
		if version == "" {
			version = "latest"
		}

		baseURL := p.BaseURL
		if baseURL == "" {
			baseURL = "https://api.github.com"
		}
		baseURL = strings.TrimSuffix(baseURL, "/")

		apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", baseURL, repo)
		if version != "latest" {
			apiURL = fmt.Sprintf("%s/repos/%s/releases/tags/%s", baseURL, repo, version)
		}

		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("creating GitHub API request: %w", err)
		}
		req.Header.Set("User-Agent", "dotfiles-installer/1.0")

		token := getStringParam(tool.InstallParams, "token", "")
		if token == "" {
			token = os.Getenv("GITHUB_TOKEN")
		}
		if token != "" {
			req.Header.Set("Authorization", "token "+token)
		}

		resp, err := p.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("executing GitHub API request: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
		}

		var release githubRelease
		if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
			return nil, fmt.Errorf("decoding GitHub release response: %w", err)
		}
		if release.TagName != "" {
			detectedVersion = release.TagName
		}

		matched := p.matchAsset(release.Assets, assetPattern, assetSelector)
		if matched == nil {
			return nil, fmt.Errorf("no matching release asset found for OS %s and Arch %s", p.sysCtx.OS, p.sysCtx.Arch)
		}

		downloadURL = matched.BrowserDownloadURL
		downloadName = matched.Name
	} else {
		downloadName = tool.Name + ".pkg"
		if lastSlash := strings.LastIndex(downloadURL, "/"); lastSlash >= 0 {
			nameFromURL := downloadURL[lastSlash+1:]
			if nameFromURL != "" && !strings.Contains(nameFromURL, ":") && strings.Contains(nameFromURL, ".") {
				downloadName = nameFromURL
			}
		}
	}

	pkgPath := filepath.Join(destDir, downloadName)

	var extractDir string
	defer func() {
		if extractDir != "" {
			_ = removeAll(p.fsys, extractDir)
		}
		if pkgPath != "" {
			_ = removeAll(p.fsys, pkgPath)
		}
	}()

	if err := p.dl.Download(ctx, downloadURL, pkgPath, ""); err != nil {
		return nil, fmt.Errorf("downloading PKG/Archive: %w", err)
	}

	resolvedPkgPath := pkgPath
	lowerName := strings.ToLower(downloadName)
	isArchive := strings.HasSuffix(lowerName, ".zip") || strings.HasSuffix(lowerName, ".tar.gz") || strings.HasSuffix(lowerName, ".tgz")

	if isArchive {
		extractDir = filepath.Join(destDir, tool.Name+"-extracted")
		if err := p.fsys.MkdirAll(extractDir, 0755); err != nil {
			return nil, fmt.Errorf("creating extraction directory: %w", err)
		}

		if err := p.extractor.Extract(ctx, pkgPath, extractDir); err != nil {
			return nil, fmt.Errorf("extracting archive: %w", err)
		}

		foundPkg, err := findFileWithExtension(p.fsys, extractDir, ".pkg")
		if err != nil || foundPkg == "" {
			return nil, fmt.Errorf("no .pkg file found in extracted archive: %w", err)
		}
		resolvedPkgPath = foundPkg
	}

	target := getStringParam(tool.InstallParams, "target", "/")

	installerBinary := "installer"
	if customInstaller := os.Getenv("DOTFILES_TEST_PKG_INSTALLER_PATH"); customInstaller != "" {
		installerBinary = customInstaller
	}

	var writer *logger.LineWriter
	if p.log != nil {
		writer = logger.NewLineWriter(p.log.GetSubLogger("", tool.Name), "|")
	}

	var cmd exec.Cmd
	if tool.Sudo {
		args := []string{installerBinary, "-pkg", resolvedPkgPath, "-target", target}
		if p.log != nil {
			p.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ sudo %s %s", installerBinary, strings.Join(args[1:], " "))))
		}
		cmd = p.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"-pkg", resolvedPkgPath, "-target", target}
		if p.log != nil {
			p.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ %s %s", installerBinary, strings.Join(args, " "))))
		}
		cmd = p.runner.CommandContext(ctx, installerBinary, args...)
	}
	if writer != nil {
		cmd.SetStdout(writer)
		cmd.SetStderr(writer)
	}

	if err := cmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("running pkg installer: %w", err)
	}
	if writer != nil {
		writer.Flush()
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	resolvedBinaries := ResolveBinaryPaths(ctx, p.fsys, binNames, func(binName string) string {
		if customBin := os.Getenv("DOTFILES_TEST_PKG_BINARY_PATH"); customBin != "" {
			return customBin
		}
		return filepath.Join("/usr/local/bin", binName)
	})

	var versionResult string
	if detectedVersion != "" {
		versionResult = detectedVersion
	} else if version != "" && version != "latest" {
		versionResult = version
	}

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  versionResult,
	}, nil
}

func (p *PkgInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (p *PkgInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	var repo string
	if tool.InstallParams != nil {
		if sourceMap, ok := tool.InstallParams["source"].(map[string]interface{}); ok {
			repo = getStringParam(sourceMap, "repo", "")
		}
	}
	if repo == "" {
		return &UpdateCheckResult{HasUpdate: false}, nil
	}
	baseURL := p.BaseURL
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}
	apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", baseURL, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "dotfiles-installer/1.0")
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API status %d", resp.StatusCode)
	}
	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &UpdateCheckResult{
		HasUpdate:     true,
		LatestVersion: release.TagName,
	}, nil
}

func (p *PkgInstaller) matchAsset(assets []githubAsset, assetPattern, assetSelector string) *githubAsset {
	sysCtx := p.sysCtx
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}

	pattern := assetPattern
	if pattern == "" {
		pattern = assetSelector
	}

	var candidates []githubAsset
	if pattern != "" {
		for _, asset := range assets {
			if matchPattern(asset.Name, pattern) {
				candidates = append(candidates, asset)
			}
		}
	} else {
		candidates = assets
	}

	var bestCandidates []githubAsset
	for _, asset := range candidates {
		name := strings.ToLower(asset.Name)
		isOS := strings.Contains(name, "darwin") || strings.Contains(name, "macos") || strings.Contains(name, "osx") || strings.Contains(name, "apple")
		isArch := strings.Contains(name, sysCtx.Arch) ||
			(sysCtx.Arch == "amd64" && (strings.Contains(name, "x86_64") || strings.Contains(name, "x64") || strings.Contains(name, "intel"))) ||
			(sysCtx.Arch == "arm64" && (strings.Contains(name, "aarch64") || strings.Contains(name, "m1") || strings.Contains(name, "m2") || strings.Contains(name, "m3")))

		if isOS && isArch {
			bestCandidates = append(bestCandidates, asset)
		}
	}

	if len(bestCandidates) > 0 {
		for _, asset := range bestCandidates {
			name := strings.ToLower(asset.Name)
			if strings.HasSuffix(name, ".pkg") || strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
				return &asset
			}
		}
		return &bestCandidates[0]
	}

	var osCandidates []githubAsset
	for _, asset := range candidates {
		name := strings.ToLower(asset.Name)
		if strings.Contains(name, "darwin") || strings.Contains(name, "macos") || strings.Contains(name, "osx") {
			osCandidates = append(osCandidates, asset)
		}
	}
	if len(osCandidates) > 0 {
		for _, asset := range osCandidates {
			name := strings.ToLower(asset.Name)
			if strings.HasSuffix(name, ".pkg") || strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
				return &asset
			}
		}
		return &osCandidates[0]
	}

	for _, asset := range candidates {
		name := strings.ToLower(asset.Name)
		if strings.HasSuffix(name, ".pkg") || strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
			return &asset
		}
	}

	if len(candidates) > 0 {
		return &candidates[0]
	}

	return nil
}

func init() {
	runner := exec.NewOSRunner()
	fsys := &fs.OSFS{}
	_ = Register(&PkgInstaller{
		runner:     runner,
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, runner),
		sysCtx:     NewDefaultSystemContext(),
		httpClient: http.DefaultClient,
	})
}
