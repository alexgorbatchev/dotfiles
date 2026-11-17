package installer

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type DmgInstaller struct {
	log        *logger.Logger
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	BinDir     string // Optional temp staging folder
	BaseURL    string // GitHub API root; empty selects api.github.com
	// GitHub holds the project configuration's github section, which applies
	// whenever the source is a GitHub release.
	GitHub GitHubSettings
}

// SetGitHubSettings applies the project configuration's github section.
func (d *DmgInstaller) SetGitHubSettings(settings GitHubSettings) {
	d.GitHub = settings
	if settings.Host != "" {
		d.BaseURL = settings.Host
	}
}

func NewDmgInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *DmgInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	if dl == nil {
		dl = downloader.NewDownloader(fsys, nil)
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

// Clone returns an isolated copy of d for a single tool install, sharing project-wide
// settings, HTTP client, and runner.
func (d *DmgInstaller) Clone() Installer {
	clone := *d
	if d.dl != nil {
		clone.dl = d.dl.Clone()
	}
	if d.extractor != nil {
		clone.extractor = d.extractor.Clone()
	}
	return &clone
}

// SetSystemContext applies the target the run was invoked for.
func (d *DmgInstaller) SetSystemContext(sysCtx *SystemContext) {
	d.sysCtx = sysCtx
}

func (d *DmgInstaller) SetFS(fsys fs.FS) {
	d.fsys = fsys
	if d.dl != nil {
		d.dl.SetFS(fsys)
	}
	if d.extractor != nil {
		d.extractor.SetFS(fsys)
	}
}

func (d *DmgInstaller) SetLogger(log *logger.Logger) {
	d.log = log
	if d.dl != nil && log != nil {
		d.dl.SetQuiet(log.Level() == logger.LogLevelQuiet)
		d.dl.SetLogger(log)
	}
}

func (d *DmgInstaller) SetDownloadSettings(settings downloader.Settings) {
	d.dl.Apply(settings)
}

func (d *DmgInstaller) SetHTTPClient(client *http.Client) {
	d.httpClient = client
	d.dl.SetHTTPClient(client)
}

func (d *DmgInstaller) SupportsSudo() bool {
	return false
}

func (d *DmgInstaller) fetcher(toolName string) macPackageFetcher {
	return macPackageFetcher{
		fsys:       d.fsys,
		dl:         d.dl,
		extractor:  d.extractor,
		runner:     d.runner,
		httpClient: d.httpClient,
		baseURL:    d.BaseURL,
		github:     d.GitHub,
		sysCtx:     d.sysCtx,
		log:        toolLogger(d.log, toolName),
	}
}

func (d *DmgInstaller) Install(ctx context.Context, tool *config.ToolConfig) (result *InstallResult, err error) {
	if err := ValidateSudo(d, tool); err != nil {
		return nil, err
	}
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: tool.BinaryNames(),
		}, nil
	}
	// Silent skip on non-macOS platforms
	if d.sysCtx.OS != "darwin" {
		return &InstallResult{
			Binaries: []string{},
		}, nil
	}

	// A configured name is checked before anything is downloaded. Only a bundle directly
	// inside /Applications can be uninstalled again, so no other is installed either; a
	// name read from the volume is a single path element and always is one.
	appName := getStringParam(tool.InstallParams, "appName", "")
	if appName != "" && !isApplicationsBundle(applicationsPath(appName)) {
		return nil, fmt.Errorf("appName %q does not name a .app directly inside %s", appName, applicationsDir)
	}

	src, err := parseMacPackageSource(tool.InstallParams)
	if err != nil {
		return nil, err
	}

	destDir := d.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}
	if err := d.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating staging directory: %w", err)
	}

	payload, err := d.fetcher(tool.Name).fetch(ctx, tool, src, destDir, ".dmg")
	if err != nil {
		return nil, err
	}
	defer payload.cleanup(d.fsys)

	mountPoint := filepath.Join(destDir, tool.Name+"-mount")
	detach, err := archive.MountDmg(ctx, d.runner, d.fsys, payload.packagePath, mountPoint)
	if err != nil {
		return nil, fmt.Errorf("mounting DMG: %w", err)
	}
	// An image left attached fails the install, even one whose bundle was copied.
	defer func() {
		if detachErr := detach(); detachErr != nil {
			result, err = nil, errors.Join(err, detachErr)
		}
	}()

	if appName == "" {
		if appName, err = volumeAppBundle(d.fsys, mountPoint); err != nil {
			return nil, err
		}
	}

	appSource := filepath.Join(mountPoint, appName)
	appDest := applicationsPath(appName)

	// Reject a bundle without usable ownership evidence before replacing an installed app.
	if _, err := readAppBundleIdentity(ctx, d.fsys, d.runner, appSource); err != nil {
		return nil, fmt.Errorf("identifying source bundle %s: %w", appSource, err)
	}

	if err := installAppBundle(d.fsys, toolLogger(d.log, tool.Name), appSource, appDest); err != nil {
		return nil, fmt.Errorf("copying App bundle to %s: %w", appDest, err)
	}

	identity, err := readAppBundleIdentity(ctx, d.fsys, d.runner, appDest)
	if err != nil {
		return nil, fmt.Errorf("identifying installed bundle %s: %w", appDest, err)
	}

	// The bundle's executable is the tool's binary only when the tool declares one: an
	// application installed without a .bin() puts no command on PATH. It is still what
	// versionArgs runs against.
	binNames := tool.BinaryNames()
	defaultBinaryName := tool.Name
	if len(binNames) > 0 {
		defaultBinaryName = binNames[0]
	}
	binaryName := getStringParam(tool.InstallParams, "binaryName", defaultBinaryName)
	binaryPath := getStringParam(tool.InstallParams, "binaryPath", "")
	var finalBinPath string
	if binaryPath != "" {
		finalBinPath = filepath.Join(appDest, binaryPath)
	} else {
		finalBinPath = filepath.Join(appDest, "Contents", "MacOS", binaryName)
	}
	var binaries []string
	if len(binNames) > 0 {
		binaries = []string{finalBinPath}
	}

	return &InstallResult{
		Binaries:               binaries,
		Version:                macPackageVersion(ctx, d.runner, tool, finalBinPath, payload.releaseTag),
		AppBundlePath:          appDest,
		AppBundleIdentifier:    identity.identifier,
		AppBundleInfoPlistHash: identity.hash,
	}, nil
}

// applicationsDir is where DmgInstaller installs app bundles.
const applicationsDir = "/Applications"

// applicationsPath is where the bundle named appName is installed.
func applicationsPath(appName string) string {
	return applicationsDir + "/" + appName
}

// isApplicationsBundle reports whether bundle is a .app directly inside
// /Applications, the only kind of path Install places a bundle at and Uninstall
// removes. It is a macOS path, so it is judged with path rather than the host's
// filepath.
func isApplicationsBundle(bundle string) bool {
	return path.Clean(bundle) == bundle && path.Dir(bundle) == applicationsDir && strings.HasSuffix(bundle, ".app")
}

// volumeAppBundle names the first .app at the root of the volume mounted at
// mountPoint, the bundle a tool that sets no appName installs. A volume without one
// fails the install, as it did in v1: a bundle named after the tool would be a guess
// the copy cannot satisfy and the installation record must not keep.
func volumeAppBundle(fsys fs.FS, mountPoint string) (string, error) {
	entries, err := fsys.ReadDir(mountPoint)
	if err != nil {
		return "", fmt.Errorf("listing the mounted volume %s: %w", mountPoint, err)
	}
	for _, entry := range entries {
		if strings.HasSuffix(entry, ".app") {
			return entry, nil
		}
	}
	return "", fmt.Errorf("no .app bundle found in %s; set appName to the bundle to install", mountPoint)
}

func (d *DmgInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return d.fetcher(tool.Name).checkUpdate(ctx, tool)
}

// findFileWithExtension returns the first entry under dir, depth first in name order,
// whose name ends in ext and which is a regular file or a real directory (a .app, or a
// bundle-format .pkg). It never returns or descends through a symlink: an extracted .dmg
// volume keeps its links, such as the drag-to-install link to /Applications, and
// following one would search outside the extraction or loop, while returning one would
// have installer -pkg or hdiutil attach open whatever file it names.
func findFileWithExtension(fsys fs.FS, dir string, ext string) (string, error) {
	entries, err := fsys.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		fullPath := filepath.Join(dir, entry)
		info, err := fsys.Lstat(fullPath)
		if err != nil {
			return "", err
		}
		if !info.Mode().IsRegular() && !info.IsDir() {
			continue
		}
		if strings.HasSuffix(strings.ToLower(entry), ext) {
			return fullPath, nil
		}
		if !info.IsDir() {
			continue
		}
		found, err := findFileWithExtension(fsys, fullPath, ext)
		if err != nil || found != "" {
			return found, err
		}
	}
	return "", nil
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
