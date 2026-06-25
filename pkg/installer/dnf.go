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

type DnfInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
}

func NewDnfInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *DnfInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &DnfInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (d *DnfInstaller) Name() string {
	return "dnf"
}

func (d *DnfInstaller) SupportsSudo() bool {
	return true
}

func (d *DnfInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	refresh := getBoolParam(tool.InstallParams, "refresh", false)
	version := ""
	if tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s-%s", packageName, version)
	}

	// Step 1: Optional dnf makecache
	if refresh {
		var args []string
		if tool.Sudo {
			args = []string{"dnf", "makecache"}
			cmd := d.runner.CommandContext(ctx, "sudo", args...)
			if err := cmd.Run(); err != nil {
				return nil, fmt.Errorf("sudo dnf makecache failed: %w", err)
			}
		} else {
			args = []string{"makecache"}
			cmd := d.runner.CommandContext(ctx, "dnf", args...)
			if err := cmd.Run(); err != nil {
				return nil, fmt.Errorf("dnf makecache failed: %w", err)
			}
		}
	}

	// Step 2: dnf install
	var installCmd exec.Cmd
	if tool.Sudo {
		args := []string{"dnf", "install", "-y", packageSpec}
		installCmd = d.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"install", "-y", packageSpec}
		installCmd = d.runner.CommandContext(ctx, "dnf", args...)
	}

	if err := installCmd.Run(); err != nil {
		return nil, fmt.Errorf("dnf install %s failed: %w", packageName, err)
	}

	// Step 3: Fetch version via rpm -q
	var detectedVersion string
	queryCmd := d.runner.CommandContext(ctx, "rpm", "-q", "--qf", "%{VERSION}-%{RELEASE}", packageName)
	out, err := queryCmd.Output()
	if err == nil {
		detectedVersion = strings.TrimSpace(string(out))
	}

	return &InstallResult{
		Binaries: []string{}, // externally managed
		ShellEnv: map[string]string{
			"DNF_INSTALLED_VERSION": detectedVersion,
		},
	}, nil
}

func (d *DnfInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	var cmd exec.Cmd
	if tool.Sudo {
		cmd = d.runner.CommandContext(ctx, "sudo", "dnf", "remove", "-y", packageName)
	} else {
		cmd = d.runner.CommandContext(ctx, "dnf", "remove", "-y", packageName)
	}
	return cmd.Run()
}

func (d *DnfInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&DnfInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
