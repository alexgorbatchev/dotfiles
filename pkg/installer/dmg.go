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
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
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

	if err := installAppBundle(d.fsys, toolLogger(d.log, tool.Name), appSource, appDest); err != nil {
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
		Binaries:      []string{finalBinPath},
		Version:       macPackageVersion(ctx, d.runner, tool, finalBinPath, payload.releaseTag),
		AppBundlePath: appDest,
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

// Uninstall removes the bundle Install placed in /Applications. That is the one the
// installation record names, since a bundle found on the volume need not be named
// after the tool or match the current appName; without a record it is the bundle
// appName names, and with neither it is not known and nothing is removed.
func (d *DmgInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed Installation) error {
	if d.sysCtx.OS != "darwin" {
		return nil
	}
	appDest, err := installedAppBundle(tool, installed)
	if err != nil {
		return err
	}
	// installAppBundle can leave either sibling behind (an interrupted copy, or a
	// replaced bundle it could not remove); an uninstall takes them with the app.
	rmCmd := d.runner.CommandContext(ctx, "rm", "-rf", appDest,
		bundleSibling(appDest, stagingBundlePrefix), bundleSibling(appDest, previousBundlePrefix))
	return rmCmd.Run()
}

// installedAppBundle returns the bundle Uninstall removes. The path is handed to
// rm -rf, so whatever its source, it must be a .app directly inside /Applications.
func installedAppBundle(tool *config.ToolConfig, installed Installation) (string, error) {
	bundle := installed.AppBundlePath
	if bundle == "" {
		appName := getStringParam(tool.InstallParams, "appName", "")
		if appName == "" {
			return "", fmt.Errorf("the app bundle installed for %s is not known: no installation of it is recorded and it sets no appName", tool.Name)
		}
		bundle = applicationsPath(appName)
	}
	if !isApplicationsBundle(bundle) {
		return "", fmt.Errorf("refusing to remove %q: it is not an app bundle directly inside %s", bundle, applicationsDir)
	}
	return bundle, nil
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
