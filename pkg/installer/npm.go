package installer

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

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

// SetSystemContext applies the target the run was invoked for.
func (n *NpmInstaller) SetSystemContext(sysCtx *SystemContext) {
	n.sysCtx = sysCtx
}

func (n *NpmInstaller) SetFS(fsys fs.FS) {
	n.fsys = fsys
}

func (n *NpmInstaller) SetLogger(log *logger.Logger) {
	n.log = log
}

func (n *NpmInstaller) SupportsSudo() bool {
	return false
}

func (n *NpmInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(n, tool); err != nil {
		return nil, err
	}
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	pkgManager := getStringParam(tool.InstallParams, "packageManager", "npm")
	pkgName := getStringParam(tool.InstallParams, "package", tool.Name)
	force := getBoolParam(tool.InstallParams, "force", false)

	version := getStringParam(tool.InstallParams, "version", "")
	if version == "" && tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := pkgName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s@%s", pkgName, version)
	}

	var writer *logger.LineWriter
	if n.log != nil {
		writer = logger.NewLineWriter(n.log.GetSubLogger("", tool.Name), "|")
	}

	var cmd exec.Cmd
	if pkgManager == "bun" {
		args := []string{"install", "-g"}
		if force {
			args = append(args, "--force")
		}
		args = append(args, packageSpec)
		if n.log != nil {
			n.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ bun %s", strings.Join(args, " "))))
		}
		cmd = n.runner.CommandContext(ctx, "bun", args...)
	} else {
		args := []string{"install", "-g"}
		if force {
			args = append(args, "--force")
		}
		args = append(args, packageSpec)
		if n.log != nil {
			n.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ npm %s", strings.Join(args, " "))))
		}
		cmd = n.runner.CommandContext(ctx, "npm", args...)
	}
	if writer != nil {
		cmd.SetStdout(writer)
		cmd.SetStderr(writer)
	}

	if err := cmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("%s install failed: %w", pkgManager, err)
	}
	if writer != nil {
		writer.Flush()
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	var resolvedBinaries []string

	// Get npm/bun prefix
	var prefix string
	if pkgManager == "bun" {
		cmd := n.runner.CommandContext(ctx, "bun", "pm", "bin", "-g")
		out, err := cmd.Output()
		if err == nil {
			prefix = strings.TrimSpace(string(out))
		}
	} else {
		cmd := n.runner.CommandContext(ctx, "npm", "config", "get", "prefix")
		out, err := cmd.Output()
		if err == nil {
			prefix = strings.TrimSpace(string(out))
		}
	}

	resolvedBinaries = ResolveBinaryPaths(ctx, n.fsys, binNames, func(binName string) string {
		if prefix != "" {
			if pkgManager == "bun" {
				return filepath.Join(prefix, binName)
			}
			return filepath.Join(prefix, "bin", binName)
		}
		return filepath.Join("/usr/local/bin", binName)
	})

	return &InstallResult{
		Binaries: resolvedBinaries,
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
	pkgName := getStringParam(tool.InstallParams, "package", tool.Name)
	pkgManager := getStringParam(tool.InstallParams, "packageManager", "npm")

	var cmd exec.Cmd
	if pkgManager == "bun" {
		cmd = n.runner.CommandContext(ctx, "bun", "pm", "view", pkgName, "version")
	} else {
		cmd = n.runner.CommandContext(ctx, "npm", "view", pkgName, "version")
	}

	out, err := cmd.Output()
	if err != nil {
		return &UpdateCheckResult{}, nil
	}

	latestVersion := strings.TrimSpace(string(out))
	if latestVersion == "" {
		return &UpdateCheckResult{}, nil
	}

	return &UpdateCheckResult{
		LatestVersion: latestVersion,
	}, nil
}

func init() {
	_ = Register(&NpmInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
