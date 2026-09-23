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

// checksInstalledPackage marks the update check as one about the installed package
// (installedPackageChecker).
func (*PacmanInstaller) checksInstalledPackage() {}

func (p *PacmanInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	localPackageName := packageName
	if idx := strings.LastIndex(packageName, "/"); idx >= 0 {
		localPackageName = packageName[idx+1:]
	}
	args := []string{"-Qu", localPackageName}
	query := runQuery(p.runner.CommandContext(ctx, "pacman", args...), "pacman", args...)
	code, exited := query.exitCode()
	switch {
	case exited && code == 0:
		// A package listed by `pacman -Qu` is out of date by pacman's own reckoning,
		// and its `pkgver-pkgrel` strings are not semver.
		for _, line := range strings.Split(query.stdout, "\n") {
			matches := pacmanUpgradeLine.FindStringSubmatch(strings.TrimSpace(line))
			if matches != nil && strings.EqualFold(matches[1], localPackageName) {
				return &UpdateCheckResult{
					Outdated:      new(true),
					LocalVersion:  matches[2],
					LatestVersion: matches[3],
				}, nil
			}
		}
		return nil, query.fail(fmt.Errorf("listed no upgrade for %s", localPackageName))
	case exited && code == 1 && strings.TrimSpace(query.stdout) == "" && strings.TrimSpace(query.stderr) == "":
		// `pacman -Qu` exits 1 both for a package with no upgrade and for a failed
		// query, but only the first prints nothing: a package that is not installed
		// ("error: package 'x' was not found") or a sync database that was never
		// downloaded says so on stderr.
		return &UpdateCheckResult{Outdated: new(false)}, nil
	default:
		return nil, query.fail(query.err)
	}
}

// pacmanUpgradeLine is one package in the `pacman -Qu` listing:
// `name installed-version -> available-version`.
var pacmanUpgradeLine = regexp.MustCompile(`^(\S+)\s+(\S+)\s+->\s+(\S+)`)

func init() {
	_ = Register(&PacmanInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
