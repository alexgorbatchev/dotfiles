package installer

import (
	"context"
	"fmt"
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

func (d *DmgInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
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

	mountPoint := filepath.Join(destDir, tool.Name+"-mount")
	mounted := false
	defer func() {
		if mounted {
			detachCmd := d.runner.CommandContext(ctx, "hdiutil", "detach", mountPoint)
			_ = detachCmd.Run()
		}
		_ = d.fsys.RemoveAll(mountPoint)
		payload.cleanup(d.fsys)
	}()

	if err := d.fsys.MkdirAll(mountPoint, 0755); err != nil {
		return nil, fmt.Errorf("creating mountpoint directory: %w", err)
	}

	// Mount DMG
	attachCmd := d.runner.CommandContext(ctx, "hdiutil", "attach", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint, payload.packagePath)
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
	if err := copyDir(d.fsys, appSource, appDest); err != nil {
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
		Version:  macPackageVersion(ctx, d.runner, tool, finalBinPath, payload.releaseTag, src.version),
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
	return d.fetcher(tool.Name).checkUpdate(ctx, tool)
}

func findFileWithExtension(fsys fs.FS, dir string, ext string) (string, error) {
	entries, err := fsys.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		fullPath := filepath.Join(dir, entry)
		if strings.HasSuffix(strings.ToLower(entry), ext) {
			return fullPath, nil
		}
		_, subErr := fsys.ReadDir(fullPath)
		if subErr == nil {
			found, _ := findFileWithExtension(fsys, fullPath, ext)
			if found != "" {
				return found, nil
			}
		}
	}
	return "", nil
}

func copyDir(fsys fs.FS, src, dest string) error {
	info, err := fsys.Lstat(src)
	if err != nil {
		return err
	}

	if info.IsDir() {
		if err := fsys.MkdirAll(dest, info.Mode()); err != nil {
			return err
		}
		entries, err := fsys.ReadDir(src)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			err = copyDir(fsys, filepath.Join(src, entry), filepath.Join(dest, entry))
			if err != nil {
				return err
			}
		}
		return nil
	}

	return fsys.CopyFile(src, dest)
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
