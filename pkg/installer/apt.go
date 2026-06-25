package installer

import (
	"context"
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type AptInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
}

func NewAptInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *AptInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &AptInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (a *AptInstaller) Name() string {
	return "apt"
}

func (a *AptInstaller) SupportsSudo() bool {
	return true
}

func (a *AptInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	update := getBoolParam(tool.InstallParams, "update", false)
	version := ""
	if tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s=%s", packageName, version)
	}

	// Step 1: Optional apt-get update
	if update {
		var args []string
		if tool.Sudo {
			args = []string{"apt-get", "update"}
			cmd := a.runner.CommandContext(ctx, "sudo", args...)
			if err := cmd.Run(); err != nil {
				return nil, fmt.Errorf("sudo apt-get update failed: %w", err)
			}
		} else {
			args = []string{"update"}
			cmd := a.runner.CommandContext(ctx, "apt-get", args...)
			if err := cmd.Run(); err != nil {
				return nil, fmt.Errorf("apt-get update failed: %w", err)
			}
		}
	}

	// Step 2: apt-get install
	var installCmd exec.Cmd
	if tool.Sudo {
		args := []string{"apt-get", "install", "-y", packageSpec}
		installCmd = a.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"install", "-y", packageSpec}
		installCmd = a.runner.CommandContext(ctx, "apt-get", args...)
	}

	if err := installCmd.Run(); err != nil {
		return nil, fmt.Errorf("apt-get install %s failed: %w", packageName, err)
	}

	// Step 3: Fetch version via dpkg-query
	var detectedVersion string
	queryCmd := a.runner.CommandContext(ctx, "dpkg-query", "-W", "-f=${Version}", packageName)
	out, err := queryCmd.Output()
	if err == nil {
		detectedVersion = strings.TrimSpace(string(out))
	}

	return &InstallResult{
		Binaries: []string{}, // externally managed
		ShellEnv: map[string]string{
			"APT_INSTALLED_VERSION": detectedVersion,
		},
	}, nil
}

func (a *AptInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	var cmd exec.Cmd
	if tool.Sudo {
		cmd = a.runner.CommandContext(ctx, "sudo", "apt-get", "remove", "-y", packageName)
	} else {
		cmd = a.runner.CommandContext(ctx, "apt-get", "remove", "-y", packageName)
	}
	return cmd.Run()
}

func (a *AptInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&AptInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
