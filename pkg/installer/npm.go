package installer

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type NpmInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
}

func NewNpmInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *NpmInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &NpmInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (n *NpmInstaller) Name() string {
	return "npm"
}

func (n *NpmInstaller) SupportsSudo() bool {
	return false
}

func (n *NpmInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	pkgManager := getStringParam(tool.InstallParams, "packageManager", "npm")
	pkgName := getStringParam(tool.InstallParams, "package", tool.Name)
	force := getBoolParam(tool.InstallParams, "force", false)

	version := ""
	if tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := pkgName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s@%s", pkgName, version)
	}

	var cmd exec.Cmd
	if pkgManager == "bun" {
		args := []string{"install", "-g"}
		if force {
			args = append(args, "--force")
		}
		args = append(args, packageSpec)
		cmd = n.runner.CommandContext(ctx, "bun", args...)
	} else {
		args := []string{"install", "-g"}
		if force {
			args = append(args, "--force")
		}
		args = append(args, packageSpec)
		cmd = n.runner.CommandContext(ctx, "npm", args...)
	}

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%s install failed: %w", pkgManager, err)
	}

	return &InstallResult{
		Binaries: []string{}, // externally managed
	}, nil
}

func (n *NpmInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	pkgManager := getStringParam(tool.InstallParams, "packageManager", "npm")
	pkgName := getStringParam(tool.InstallParams, "package", tool.Name)

	var cmd exec.Cmd
	if pkgManager == "bun" {
		cmd = n.runner.CommandContext(ctx, "bun", "remove", "-g", pkgName)
	} else {
		cmd = n.runner.CommandContext(ctx, "npm", "uninstall", "-g", pkgName)
	}

	return cmd.Run()
}

func (n *NpmInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&NpmInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
