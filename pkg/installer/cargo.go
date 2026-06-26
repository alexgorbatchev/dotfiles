package installer

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type CargoInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
	BinDir string // Optional destination directory
}

func NewCargoInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *CargoInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &CargoInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (c *CargoInstaller) Name() string {
	return "cargo"
}

func (c *CargoInstaller) SupportsSudo() bool {
	return false
}

func (c *CargoInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	version := ""
	if tool.Version != nil {
		version = *tool.Version
	}

	args := []string{"install"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}

	if version != "" && version != "latest" {
		args = append(args, "--version", version)
	}

	args = append(args, crateName)

	cmd := c.runner.CommandContext(ctx, "cargo", args...)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("cargo install %s: %w", crateName, err)
	}

	promotedBinaries, err := PromoteBinaries(c.fsys, c.BinDir, tool.Name, tool.Binaries)
	if err != nil {
		return nil, err
	}

	return &InstallResult{
		Binaries: promotedBinaries,
	}, nil
}

func (c *CargoInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	args := []string{"uninstall"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}
	args = append(args, crateName)

	cmd := c.runner.CommandContext(ctx, "cargo", args...)
	return cmd.Run()
}

func (c *CargoInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	// For cargo we can simulate a basic update check or parse crates.io,
	// but a clean default behaves beautifully
	return &UpdateCheckResult{
		HasUpdate:     false,
		LatestVersion: "latest",
	}, nil
}

func init() {
	_ = Register(&CargoInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
