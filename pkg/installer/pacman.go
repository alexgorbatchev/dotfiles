package installer

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type PacmanInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
}

func NewPacmanInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *PacmanInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &PacmanInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (p *PacmanInstaller) Name() string {
	return "pacman"
}

func (p *PacmanInstaller) SupportsSudo() bool {
	return true
}

func (p *PacmanInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	sysupgrade := getBoolParam(tool.InstallParams, "sysupgrade", false)
	version := ""
	if tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s=%s", packageName, version)
	}

	syncArgs := "-S"
	if sysupgrade {
		syncArgs = "-Syu"
	}

	var cmd exec.Cmd
	if tool.Sudo {
		args := []string{"pacman", syncArgs, "--needed", "--noconfirm", packageSpec}
		cmd = p.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{syncArgs, "--needed", "--noconfirm", packageSpec}
		cmd = p.runner.CommandContext(ctx, "pacman", args...)
	}

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pacman install %s failed: %w", packageName, err)
	}

	// Fetch version via pacman -Q
	var detectedVersion string
	queryCmd := p.runner.CommandContext(ctx, "pacman", "-Q", packageName)
	out, err := queryCmd.Output()
	if err == nil {
		output := strings.TrimSpace(string(out))
		prefix := packageName + " "
		if strings.HasPrefix(output, prefix) {
			detectedVersion = strings.TrimSpace(output[len(prefix):])
		}
	}

	return &InstallResult{
		Binaries: []string{}, // externally managed
		ShellEnv: map[string]string{
			"PACMAN_INSTALLED_VERSION": detectedVersion,
		},
	}, nil
}

func (p *PacmanInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	var cmd exec.Cmd
	if tool.Sudo {
		cmd = p.runner.CommandContext(ctx, "sudo", "pacman", "-R", "--noconfirm", packageName)
	} else {
		cmd = p.runner.CommandContext(ctx, "pacman", "-R", "--noconfirm", packageName)
	}
	return cmd.Run()
}

func (p *PacmanInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	cmd := p.runner.CommandContext(ctx, "pacman", "-Qu", packageName)
	out, err := cmd.Output()
	if err != nil {
		return &UpdateCheckResult{
			HasUpdate: false,
		}, nil
	}

	lines := strings.Split(string(out), "\n")
	re := regexp.MustCompile(`^(\S+)\s+(\S+)\s+->\s+(\S+)`)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		matches := re.FindStringSubmatch(trimmed)
		if len(matches) >= 4 {
			if strings.EqualFold(matches[1], packageName) {
				return &UpdateCheckResult{
					HasUpdate:     true,
					LocalVersion:  matches[2],
					LatestVersion: matches[3],
				}, nil
			}
		}
	}

	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&PacmanInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
