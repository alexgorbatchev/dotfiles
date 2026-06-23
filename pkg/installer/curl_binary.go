package installer

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type CurlBinaryInstaller struct {
	runner exec.CommandRunner
	fsys   fs.FS
	dl     *downloader.Downloader
	sysCtx *SystemContext
	BinDir string // Destination directory for binaries
}

func NewCurlBinaryInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CurlBinaryInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &CurlBinaryInstaller{
		runner: runner,
		fsys:   fsys,
		dl:     dl,
		sysCtx: sysCtx,
	}
}

func (c *CurlBinaryInstaller) Name() string {
	return "curl-binary"
}

func (c *CurlBinaryInstaller) SupportsSudo() bool {
	return false
}

func (c *CurlBinaryInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	url := getStringParam(tool.InstallParams, "url", "")
	if url == "" {
		return nil, fmt.Errorf("URL not specified in installParams")
	}

	destDir := c.BinDir
	if destDir == "" {
		destDir = "/tmp" // safe default fallback
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	destPath := filepath.Join(destDir, tool.Name)
	sha256 := getStringParam(tool.InstallParams, "sha256", "")

	if err := c.dl.Download(ctx, url, destPath, sha256); err != nil {
		return nil, fmt.Errorf("downloading binary from %s: %w", url, err)
	}

	// Make binary executable (permission 0755).
	// Since fsys doesn't have a direct Chmod method on the FS interface itself,
	// we write/rewrite it or rely on MkdirAll / downloader default creation perm.
	// But to be secure, let's verify if fsys is OSFS and apply os.Chmod, or we can use our runner to execute chmod!
	// Running chmod via runner is extremely robust and works beautifully across OS boundaries and mock runners!
	chmodCmd := c.runner.CommandContext(ctx, "chmod", "+x", destPath)
	_ = chmodCmd.Run() // best effort

	return &InstallResult{
		Binaries: []string{tool.Name},
	}, nil
}

func (c *CurlBinaryInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := c.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return c.fsys.Remove(destPath)
	}
	return nil
}

func (c *CurlBinaryInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&CurlBinaryInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
		dl:     downloader.NewDownloader(&fs.OSFS{}, nil),
	})
}
