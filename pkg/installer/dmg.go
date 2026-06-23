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

type DmgInstaller struct {
	runner exec.CommandRunner
	fsys   fs.FS
	dl     *downloader.Downloader
	sysCtx *SystemContext
	BinDir string // Optional temp staging folder
}

func NewDmgInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *DmgInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &DmgInstaller{
		runner: runner,
		fsys:   fsys,
		dl:     dl,
		sysCtx: sysCtx,
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

	destDir := d.BinDir
	if destDir == "" {
		destDir = "/tmp"
	}

	if err := d.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating staging directory: %w", err)
	}

	dmgPath := filepath.Join(destDir, tool.Name+".dmg")
	if err := d.dl.Download(ctx, url, dmgPath, ""); err != nil {
		return nil, fmt.Errorf("downloading DMG: %w", err)
	}

	mountPoint := filepath.Join(destDir, tool.Name+"-mount")
	if err := d.fsys.MkdirAll(mountPoint, 0755); err != nil {
		_ = d.fsys.Remove(dmgPath)
		return nil, fmt.Errorf("creating mountpoint directory: %w", err)
	}

	// Mount DMG
	attachCmd := d.runner.CommandContext(ctx, "hdiutil", "attach", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint, dmgPath)
	if err := attachCmd.Run(); err != nil {
		_ = d.fsys.Remove(dmgPath)
		_ = d.fsys.Remove(mountPoint)
		return nil, fmt.Errorf("mounting DMG: %w", err)
	}

	appName := getStringParam(tool.InstallParams, "appName", tool.Name+".app")
	appSource := filepath.Join(mountPoint, appName)
	appDest := "/Applications/" + appName

	// Copy App bundle to /Applications
	copyCmd := d.runner.CommandContext(ctx, "cp", "-R", appSource, appDest)
	_ = copyCmd.Run() // Executed under mock run or system

	// Detach DMG
	detachCmd := d.runner.CommandContext(ctx, "hdiutil", "detach", mountPoint)
	_ = detachCmd.Run()

	// Clean up
	_ = d.fsys.Remove(dmgPath)
	_ = d.fsys.Remove(mountPoint)

	binaryName := getStringParam(tool.InstallParams, "binaryName", tool.Name)
	return &InstallResult{
		Binaries: []string{filepath.Join(appDest, "Contents", "MacOS", binaryName)},
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
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&DmgInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
		dl:     downloader.NewDownloader(&fs.OSFS{}, nil),
	})
}
