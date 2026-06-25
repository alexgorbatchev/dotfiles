package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type CurlTarInstaller struct {
	runner    exec.CommandRunner
	fsys      fs.FS
	dl        *downloader.Downloader
	extractor *archive.Extractor
	sysCtx    *SystemContext
	BinDir    string // Destination directory for binaries
}

func NewCurlTarInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CurlTarInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &CurlTarInstaller{
		runner:    runner,
		fsys:      fsys,
		dl:        dl,
		extractor: extractor,
		sysCtx:    sysCtx,
	}
}

func (c *CurlTarInstaller) Name() string {
	return "curl-tar"
}

func (c *CurlTarInstaller) SupportsSudo() bool {
	return false
}

func (c *CurlTarInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	url := getStringParam(tool.InstallParams, "url", "")
	if url == "" {
		return nil, fmt.Errorf("URL not specified in installParams")
	}

	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	archivePath := filepath.Join(destDir, tool.Name+".tar.gz")
	sha256 := getStringParam(tool.InstallParams, "sha256", "")

	if err := c.dl.Download(ctx, url, archivePath, sha256); err != nil {
		return nil, fmt.Errorf("downloading archive: %w", err)
	}

	// Extract downloaded archive
	if err := c.extractor.Extract(ctx, archivePath, destDir); err != nil {
		_ = c.fsys.Remove(archivePath)
		return nil, fmt.Errorf("extracting archive: %w", err)
	}

	// Remove downloaded archive
	_ = c.fsys.Remove(archivePath)

	return &InstallResult{
		Binaries: []string{tool.Name},
	}, nil
}

func (c *CurlTarInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := c.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return c.fsys.Remove(destPath)
	}
	return nil
}

func (c *CurlTarInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&CurlTarInstaller{
		runner:    exec.NewOSRunner(),
		fsys:      &fs.OSFS{},
		dl:        downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor: archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
	})
}
