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

type PkgInstaller struct {
	log        *logger.Logger
	runner     exec.CommandRunner
	fsys       fs.FS
	dl         *downloader.Downloader
	extractor  *archive.Extractor
	sysCtx     *SystemContext
	httpClient *http.Client
	BinDir     string // Optional destination dir
	BaseURL    string // GitHub API root; empty selects api.github.com
	// GitHub holds the project configuration's github section, which applies
	// whenever the source is a GitHub release.
	GitHub GitHubSettings
}

// SetGitHubSettings applies the project configuration's github section.
func (p *PkgInstaller) SetGitHubSettings(settings GitHubSettings) {
	p.GitHub = settings
	if settings.Host != "" {
		p.BaseURL = settings.Host
	}
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

// SetSystemContext applies the target the run was invoked for.
func (p *PkgInstaller) SetSystemContext(sysCtx *SystemContext) {
	p.sysCtx = sysCtx
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

func (p *PkgInstaller) SetDownloadSettings(settings downloader.Settings) {
	p.dl.Apply(settings)
}

func (p *PkgInstaller) SetHTTPClient(client *http.Client) {
	p.httpClient = client
	p.dl.SetHTTPClient(client)
}

func (p *PkgInstaller) SupportsSudo() bool {
	return true
}

func (p *PkgInstaller) fetcher(toolName string) macPackageFetcher {
	return macPackageFetcher{
		fsys:       p.fsys,
		dl:         p.dl,
		extractor:  p.extractor,
		runner:     p.runner,
		httpClient: p.httpClient,
		baseURL:    p.BaseURL,
		github:     p.GitHub,
		sysCtx:     p.sysCtx,
		log:        toolLogger(p.log, toolName),
	}
}

func (p *PkgInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(p, tool); err != nil {
		return nil, err
	}
	if config.IsDryRunEnabled(ctx) {
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

	src, err := parseMacPackageSource(tool.InstallParams)
	if err != nil {
		return nil, err
	}

	destDir := p.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}
	if err := p.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating staging folder: %w", err)
	}

	payload, err := p.fetcher(tool.Name).fetch(ctx, tool, src, destDir, ".pkg")
	if err != nil {
		return nil, err
	}
	defer payload.cleanup(p.fsys)

	target := getStringParam(tool.InstallParams, "target", "/")

	installerBinary := "installer"
	if customInstaller := os.Getenv("DOTFILES_TEST_PKG_INSTALLER_PATH"); customInstaller != "" {
		installerBinary = customInstaller
	}

	toolLog := toolLogger(p.log, tool.Name)
	var writer *logger.LineWriter
	if toolLog != nil {
		writer = logger.NewLineWriter(toolLog, "|")
	}

	var cmd exec.Cmd
	if tool.Sudo {
		args := []string{installerBinary, "-pkg", payload.packagePath, "-target", target}
		if toolLog != nil {
			toolLog.Info(logger.Message(fmt.Sprintf("$ sudo %s %s", installerBinary, strings.Join(args[1:], " "))))
		}
		cmd = p.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"-pkg", payload.packagePath, "-target", target}
		if toolLog != nil {
			toolLog.Info(logger.Message(fmt.Sprintf("$ %s %s", installerBinary, strings.Join(args, " "))))
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

	resolvedBinaries, err := p.resolveBinaries(ctx, tool)
	if err != nil {
		return nil, err
	}

	mainBinary := ""
	if len(resolvedBinaries) > 0 {
		mainBinary = resolvedBinaries[0]
	}

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  macPackageVersion(ctx, p.runner, tool, mainBinary, payload.releaseTag, src.version),
	}, nil
}

// resolveBinaries locates the binaries the package installed. `binaryPath`
// names the primary binary explicitly and must exist once the installer has
// run; every other declared binary is looked up on PATH with /usr/local/bin as
// the fallback, which is where macOS packages conventionally link commands.
func (p *PkgInstaller) resolveBinaries(ctx context.Context, tool *config.ToolConfig) ([]string, error) {
	binNames := GetBinaryNames(tool.Name, tool.Binaries)

	var resolved []string
	if binaryPath := getStringParam(tool.InstallParams, "binaryPath", ""); binaryPath != "" {
		if !p.fsys.IsAbs(binaryPath) {
			if abs, err := p.fsys.Abs(binaryPath); err == nil {
				binaryPath = abs
			}
		}
		exists, err := p.fsys.Exists(binaryPath)
		if err != nil || !exists {
			return nil, fmt.Errorf("configured pkg binaryPath does not exist after installation: %s", binaryPath)
		}
		resolved = append(resolved, binaryPath)
		binNames = binNames[1:]
	}

	resolved = append(resolved, ResolveBinaryPaths(ctx, p.fsys, binNames, func(binName string) string {
		return filepath.Join("/usr/local/bin", binName)
	})...)
	return resolved, nil
}

func (p *PkgInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (p *PkgInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return p.fetcher(tool.Name).checkUpdate(ctx, tool)
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
