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

type PkgInstaller struct {
	runner exec.CommandRunner
	fsys   fs.FS
	dl     *downloader.Downloader
	sysCtx *SystemContext
	BinDir string // Optional destination dir
}

func NewPkgInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *PkgInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &PkgInstaller{
		runner: runner,
		fsys:   fsys,
		dl:     dl,
		sysCtx: sysCtx,
	}
}

func (p *PkgInstaller) Name() string {
	return "pkg"
}

func (p *PkgInstaller) SupportsSudo() bool {
	return true
}

func (p *PkgInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	// Gated on macOS only
	if p.sysCtx.OS != "darwin" {
		return &InstallResult{
			Binaries: []string{},
		}, nil
	}

	url := ""
	if tool.InstallParams != nil {
		if u, ok := tool.InstallParams["url"].(string); ok {
			url = u
		} else if sourceMap, ok := tool.InstallParams["source"].(map[string]interface{}); ok {
			url, _ = sourceMap["url"].(string)
		}
	}

	if url == "" {
		return nil, fmt.Errorf("URL not specified in installParams")
	}

	destDir := p.BinDir
	if destDir == "" {
		destDir = "/tmp"
	}

	if err := p.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating staging folder: %w", err)
	}

	pkgPath := filepath.Join(destDir, tool.Name+".pkg")
	if err := p.dl.Download(ctx, url, pkgPath, ""); err != nil {
		return nil, fmt.Errorf("downloading PKG: %w", err)
	}

	target := getStringParam(tool.InstallParams, "target", "/")

	var cmd exec.Cmd
	if tool.Sudo {
		args := []string{"installer", "-pkg", pkgPath, "-target", target}
		cmd = p.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"-pkg", pkgPath, "-target", target}
		cmd = p.runner.CommandContext(ctx, "installer", args...)
	}

	if err := cmd.Run(); err != nil {
		_ = p.fsys.Remove(pkgPath)
		return nil, fmt.Errorf("running pkg installer: %w", err)
	}

	_ = p.fsys.Remove(pkgPath)

	return &InstallResult{
		Binaries: []string{}, // externally managed, files placed system-wide by PKG installer
	}, nil
}

func (p *PkgInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	// Standard PKG files are externally managed and typically uninstalled manually
	return nil
}

func (p *PkgInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&PkgInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
		dl:     downloader.NewDownloader(&fs.OSFS{}, nil),
	})
}
