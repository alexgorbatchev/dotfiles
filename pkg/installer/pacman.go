package installer

import (
	"context"
	"fmt"
	"path/filepath"
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

// SetSystemContext applies the target the run was invoked for.
func (p *PacmanInstaller) SetSystemContext(sysCtx *SystemContext) {
	p.sysCtx = sysCtx
}

func (p *PacmanInstaller) SetFS(fsys fs.FS) {
	p.fsys = fsys
}

func (p *PacmanInstaller) SetLogger(log *logger.Logger) {
	p.log = log
}

func (p *PacmanInstaller) SupportsSudo() bool {
	return true
}

func (p *PacmanInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(p, tool); err != nil {
		return nil, err
	}
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	localPackageName := packageName
	if idx := strings.LastIndex(packageName, "/"); idx >= 0 {
		localPackageName = packageName[idx+1:]
	}

	sysupgrade := getBoolParam(tool.InstallParams, "sysupgrade", false)
	version := tool.RequestedVersion()

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s=%s", packageName, version)
	}

	syncArgs := "-S"
	if sysupgrade {
		syncArgs = "-Syu"
	}

	var writer *logger.LineWriter
	if p.log != nil {
		writer = logger.NewLineWriter(p.log.WithTag(tool.Name), "|")
	}

	var cmd exec.Cmd
	if tool.Sudo {
		args := []string{"pacman", syncArgs, "--needed", "--noconfirm", packageSpec}
		if p.log != nil {
			p.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ sudo %s", strings.Join(args, " "))))
		}
		cmd = p.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{syncArgs, "--needed", "--noconfirm", packageSpec}
		if p.log != nil {
			p.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ pacman %s", strings.Join(args, " "))))
		}
		cmd = p.runner.CommandContext(ctx, "pacman", args...)
	}
	if writer != nil {
		cmd.SetStdout(writer)
		cmd.SetStderr(writer)
	}

	if err := cmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("pacman install %s failed: %w", packageName, err)
	}
	if writer != nil {
		writer.Flush()
	}

	// Fetch version via pacman -Q
	var detectedVersion string
	queryCmd := p.runner.CommandContext(ctx, "pacman", "-Q", localPackageName)
	out, err := queryCmd.Output()
	if err == nil {
		output := strings.TrimSpace(string(out))
		prefix := localPackageName + " "
		if strings.HasPrefix(output, prefix) {
			detectedVersion = strings.TrimSpace(output[len(prefix):])
		}
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	resolvedBinaries := ResolveBinaryPaths(ctx, p.fsys, binNames, func(binName string) string {
		return filepath.Join("/usr/bin", binName)
	})

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  detectedVersion,
		ShellEnv: map[string]string{
			"PACMAN_INSTALLED_VERSION": detectedVersion,
		},
	}, nil
}

func (p *PacmanInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	localPackageName := packageName
	if idx := strings.LastIndex(packageName, "/"); idx >= 0 {
		localPackageName = packageName[idx+1:]
	}
	var cmd exec.Cmd
	if tool.Sudo {
		cmd = p.runner.CommandContext(ctx, "sudo", "pacman", "-R", "--noconfirm", localPackageName)
	} else {
		cmd = p.runner.CommandContext(ctx, "pacman", "-R", "--noconfirm", localPackageName)
	}
	return cmd.Run()
}

func (p *PacmanInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	localPackageName := packageName
	if idx := strings.LastIndex(packageName, "/"); idx >= 0 {
		localPackageName = packageName[idx+1:]
	}
	cmd := p.runner.CommandContext(ctx, "pacman", "-Qu", localPackageName)
	out, err := cmd.Output()
	if err != nil {
		// `pacman -Qu` exits non-zero both when the package is up to date and when the
		// query itself fails, so a failure says nothing either way.
		return &UpdateCheckResult{}, nil
	}

	// A package listed by `pacman -Qu` is out of date by pacman's own reckoning, and
	// its `pkgver-pkgrel` strings are not semver.
	lines := strings.Split(string(out), "\n")
	re := regexp.MustCompile(`^(\S+)\s+(\S+)\s+->\s+(\S+)`)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		matches := re.FindStringSubmatch(trimmed)
		if len(matches) >= 4 {
			if strings.EqualFold(matches[1], localPackageName) {
				return &UpdateCheckResult{
					Outdated:      new(true),
					LocalVersion:  matches[2],
					LatestVersion: matches[3],
				}, nil
			}
		}
	}

	return &UpdateCheckResult{Outdated: new(false)}, nil
}

func init() {
	_ = Register(&PacmanInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
