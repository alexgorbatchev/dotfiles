package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type DmgInstaller struct {
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	BinDir     string // Optional temp staging folder
	BaseURL    string // Override for testing
}

func NewDmgInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *DmgInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &DmgInstaller{
		runner:     runner,
		fsys:       fsys,
		dl:         dl,
		extractor:  extractor,
		sysCtx:     sysCtx,
		httpClient: http.DefaultClient,
	}
}

func (d *DmgInstaller) Name() string {
	return "dmg"
}

func (d *DmgInstaller) SupportsSudo() bool {
	return false
}

func (d *DmgInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	// Silent skip on non-macOS platforms
	if d.sysCtx.OS != "darwin" {
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

	destDir := d.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := d.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating staging directory: %w", err)
	}

	var downloadName string

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

		baseURL := d.BaseURL
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

		token := getStringParam(tool.InstallParams, "token", "")
		if token == "" {
			token = os.Getenv("GITHUB_TOKEN")
		}
		if token != "" {
			req.Header.Set("Authorization", "token "+token)
		}

		resp, err := d.httpClient.Do(req)
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

		matched := d.matchAsset(release.Assets, assetPattern, assetSelector)
		if matched == nil {
			return nil, fmt.Errorf("no matching release asset found for OS %s and Arch %s", d.sysCtx.OS, d.sysCtx.Arch)
		}

		downloadURL = matched.BrowserDownloadURL
		downloadName = matched.Name
	} else {
		downloadName = tool.Name + ".dmg"
		if lastSlash := strings.LastIndex(downloadURL, "/"); lastSlash >= 0 {
			nameFromURL := downloadURL[lastSlash+1:]
			if nameFromURL != "" && !strings.Contains(nameFromURL, ":") && strings.Contains(nameFromURL, ".") {
				downloadName = nameFromURL
			}
		}
	}

	downloadPath := filepath.Join(destDir, downloadName)

	var (
		extractDir string
		mountPoint string
		mounted    bool
	)

	defer func() {
		if mounted {
			detachCmd := d.runner.CommandContext(ctx, "hdiutil", "detach", mountPoint)
			_ = detachCmd.Run()
		}
		if extractDir != "" {
			_ = removeAll(d.fsys, extractDir)
		}
		if mountPoint != "" {
			_ = removeAll(d.fsys, mountPoint)
		}
		if downloadPath != "" {
			_ = removeAll(d.fsys, downloadPath)
		}
	}()

	if err := d.dl.Download(ctx, downloadURL, downloadPath, ""); err != nil {
		return nil, fmt.Errorf("downloading DMG/Archive: %w", err)
	}

	resolvedDmgPath := downloadPath
	lowerName := strings.ToLower(downloadName)
	isArchive := strings.HasSuffix(lowerName, ".zip") || strings.HasSuffix(lowerName, ".tar.gz") || strings.HasSuffix(lowerName, ".tgz")

	if isArchive {
		extractDir = filepath.Join(destDir, tool.Name+"-extracted")
		if err := d.fsys.MkdirAll(extractDir, 0755); err != nil {
			return nil, fmt.Errorf("creating extraction directory: %w", err)
		}

		if err := d.extractor.Extract(ctx, downloadPath, extractDir); err != nil {
			return nil, fmt.Errorf("extracting archive: %w", err)
		}

		foundDmg, err := findFileWithExtension(d.fsys, extractDir, ".dmg")
		if err != nil || foundDmg == "" {
			return nil, fmt.Errorf("no .dmg file found in extracted archive: %w", err)
		}
		resolvedDmgPath = foundDmg
	}

	mountPoint = filepath.Join(destDir, tool.Name+"-mount")
	if err := d.fsys.MkdirAll(mountPoint, 0755); err != nil {
		return nil, fmt.Errorf("creating mountpoint directory: %w", err)
	}

	// Mount DMG
	attachCmd := d.runner.CommandContext(ctx, "hdiutil", "attach", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint, resolvedDmgPath)
	if err := attachCmd.Run(); err != nil {
		return nil, fmt.Errorf("mounting DMG: %w", err)
	}
	mounted = true

	appName := getStringParam(tool.InstallParams, "appName", "")
	if appName == "" {
		entries, err := d.fsys.ReadDir(mountPoint)
		if err == nil {
			for _, entry := range entries {
				if strings.HasSuffix(entry, ".app") {
					appName = entry
					break
				}
			}
		}
	}
	if appName == "" {
		appName = tool.Name + ".app"
	}

	appSource := filepath.Join(mountPoint, appName)
	appDest := "/Applications/" + appName

	// Copy App bundle to /Applications
	copyCmd := d.runner.CommandContext(ctx, "cp", "-R", appSource, appDest)
	if err := copyCmd.Run(); err != nil {
		return nil, fmt.Errorf("copying App bundle to %s: %w", appDest, err)
	}

	binaryName := getStringParam(tool.InstallParams, "binaryName", tool.Name)
	binaryPath := getStringParam(tool.InstallParams, "binaryPath", "")
	var finalBinPath string
	if binaryPath != "" {
		finalBinPath = filepath.Join(appDest, binaryPath)
	} else {
		finalBinPath = filepath.Join(appDest, "Contents", "MacOS", binaryName)
	}

	return &InstallResult{
		Binaries: []string{finalBinPath},
	}, nil
}

func (d *DmgInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	if d.sysCtx.OS != "darwin" {
		return nil
	}
	appName := getStringParam(tool.InstallParams, "appName", tool.Name+".app")
	appDest := "/Applications/" + appName
	rmCmd := d.runner.CommandContext(ctx, "rm", "-rf", appDest)
	return rmCmd.Run()
}

func (d *DmgInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	var repo string
	if tool.InstallParams != nil {
		if sourceMap, ok := tool.InstallParams["source"].(map[string]interface{}); ok {
			repo = getStringParam(sourceMap, "repo", "")
		}
	}
	if repo == "" {
		return &UpdateCheckResult{HasUpdate: false}, nil
	}
	baseURL := d.BaseURL
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}
	apiURL := fmt.Sprintf("%s/repos/%s/releases/latest", baseURL, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := d.httpClient.Do(req)
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

func (d *DmgInstaller) matchAsset(assets []githubAsset, assetPattern, assetSelector string) *githubAsset {
	sysCtx := d.sysCtx
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
			if strings.HasSuffix(name, ".dmg") || strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
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
			if strings.HasSuffix(name, ".dmg") || strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
				return &asset
			}
		}
		return &osCandidates[0]
	}

	for _, asset := range candidates {
		name := strings.ToLower(asset.Name)
		if strings.HasSuffix(name, ".dmg") || strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".tgz") {
			return &asset
		}
	}

	if len(candidates) > 0 {
		return &candidates[0]
	}

	return nil
}

func findFileWithExtension(fsys fs.FS, dir string, ext string) (string, error) {
	entries, err := fsys.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		fullPath := filepath.Join(dir, entry)
		_, subErr := fsys.ReadDir(fullPath)
		if subErr == nil {
			found, _ := findFileWithExtension(fsys, fullPath, ext)
			if found != "" {
				return found, nil
			}
		} else {
			if strings.HasSuffix(strings.ToLower(entry), ext) {
				return fullPath, nil
			}
		}
	}
	return "", nil
}

func matchPattern(name, pattern string) bool {
	if pattern == "" {
		return true
	}
	if strings.HasPrefix(pattern, "/") {
		lastSlash := strings.LastIndex(pattern, "/")
		if lastSlash > 0 {
			regexStr := pattern[1:lastSlash]
			flags := pattern[lastSlash+1:]
			if strings.Contains(flags, "i") {
				regexStr = "(?i)" + regexStr
			}
			re, err := regexp.Compile(regexStr)
			if err == nil {
				return re.MatchString(name)
			}
		}
	}
	return strings.Contains(strings.ToLower(name), strings.ToLower(pattern))
}

func init() {
	runner := exec.NewOSRunner()
	fsys := &fs.OSFS{}
	_ = Register(&DmgInstaller{
		runner:     runner,
		fsys:       fsys,
		dl:         downloader.NewDownloader(fsys, nil),
		extractor:  archive.NewExtractor(fsys, runner),
		sysCtx:     NewDefaultSystemContext(),
		httpClient: http.DefaultClient,
	})
}