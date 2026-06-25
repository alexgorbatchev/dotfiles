package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type CurlScriptInstaller struct {
	runner exec.CommandRunner
	fsys   fs.FS
	dl     *downloader.Downloader
	sysCtx *SystemContext
	BinDir string // Target folder for binaries
}

func NewCurlScriptInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CurlScriptInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &CurlScriptInstaller{
		runner: runner,
		fsys:   fsys,
		dl:     dl,
		sysCtx: sysCtx,
	}
}

func (c *CurlScriptInstaller) Name() string {
	return "curl-script"
}

func (c *CurlScriptInstaller) SupportsSudo() bool {
	return false
}

func (c *CurlScriptInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	url := getStringParam(tool.InstallParams, "url", "")
	shell := getStringParam(tool.InstallParams, "shell", "sh")
	if url == "" {
		return nil, fmt.Errorf("URL or shell not specified in installParams")
	}

	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	scriptPath := filepath.Join(destDir, tool.Name+"-install.sh")
	if err := c.dl.Download(ctx, url, scriptPath, ""); err != nil {
		return nil, fmt.Errorf("downloading script: %w", err)
	}

	// Make script executable
	chmodCmd := c.runner.CommandContext(ctx, "chmod", "+x", scriptPath)
	_ = chmodCmd.Run()

	// Execute script
	var runCmd exec.Cmd
	if shell == "bash" {
		runCmd = c.runner.CommandContext(ctx, "bash", scriptPath)
	} else {
		runCmd = c.runner.CommandContext(ctx, "sh", scriptPath)
	}

	if err := runCmd.Run(); err != nil {
		return nil, fmt.Errorf("running install script: %w", err)
	}

	// Clean up script
	_ = c.fsys.Remove(scriptPath)

	// Since the script runs and places binaries in destDir (or simulated paths),
	// we assume the binary is now present. In mock tests, we will prepopulate it.
	return &InstallResult{
		Binaries: []string{tool.Name},
	}, nil
}

func (c *CurlScriptInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := c.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return c.fsys.Remove(destPath)
	}
	return nil
}

func (c *CurlScriptInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&CurlScriptInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
		dl:     downloader.NewDownloader(&fs.OSFS{}, nil),
	})
}
