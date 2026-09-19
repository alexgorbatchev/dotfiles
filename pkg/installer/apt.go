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

// SetSystemContext applies the target the run was invoked for.
func (a *AptInstaller) SetSystemContext(sysCtx *SystemContext) {
	a.sysCtx = sysCtx
}

func (a *AptInstaller) SetFS(fsys fs.FS) {
	a.fsys = fsys
}

func (a *AptInstaller) SetLogger(log *logger.Logger) {
	a.log = log
}

func (a *AptInstaller) SupportsSudo() bool {
	return true
}

func (a *AptInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(a, tool); err != nil {
		return nil, err
	}
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	update := getBoolParam(tool.InstallParams, "update", false)
	version := getStringParam(tool.InstallParams, "version", "")
	if version == "" && tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s=%s", packageName, version)
	}

	var writer *logger.LineWriter
	if a.log != nil {
		writer = logger.NewLineWriter(a.log.WithTag(tool.Name), "|")
	}

	// Step 1: Optional apt-get update
	if update {
		var args []string
		var cmd exec.Cmd
		if tool.Sudo {
			args = []string{"apt-get", "update"}
			if a.log != nil {
				a.log.WithTag(tool.Name).Info(logger.Message("$ sudo apt-get update"))
			}
			cmd = a.runner.CommandContext(ctx, "sudo", args...)
		} else {
			args = []string{"update"}
			if a.log != nil {
				a.log.WithTag(tool.Name).Info(logger.Message("$ apt-get update"))
			}
			cmd = a.runner.CommandContext(ctx, "apt-get", args...)
		}
		if writer != nil {
			cmd.SetStdout(writer)
			cmd.SetStderr(writer)
		}
		if err := cmd.Run(); err != nil {
			if writer != nil {
				writer.PrintError(err)
			}
			return nil, fmt.Errorf("apt-get update failed: %w", err)
		}
		if writer != nil {
			writer.Flush()
		}
	}

	// Step 2: apt-get install
	if writer != nil {
		writer.Reset()
	}
	var installCmd exec.Cmd
	if tool.Sudo {
		args := []string{"apt-get", "install", "-y", packageSpec}
		if a.log != nil {
			a.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ sudo apt-get install -y %s", packageSpec)))
		}
		installCmd = a.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"install", "-y", packageSpec}
		if a.log != nil {
			a.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ apt-get install -y %s", packageSpec)))
		}
		installCmd = a.runner.CommandContext(ctx, "apt-get", args...)
	}
	if writer != nil {
		installCmd.SetStdout(writer)
		installCmd.SetStderr(writer)
	}

	if err := installCmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("apt-get install %s failed: %w", packageName, err)
	}
	if writer != nil {
		writer.Flush()
	}

	// Step 3: Fetch version via dpkg-query
	var detectedVersion string
	queryCmd := a.runner.CommandContext(ctx, "dpkg-query", "-W", "-f=${Version}", packageName)
	out, err := queryCmd.Output()
	if err == nil {
		detectedVersion = strings.TrimSpace(string(out))
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	resolvedBinaries := ResolveBinaryPaths(ctx, a.fsys, binNames, func(binName string) string {
		return filepath.Join("/usr/bin", binName)
	})

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  detectedVersion,
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
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	cmd := a.runner.CommandContext(ctx, "apt-cache", "policy", packageName)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("running apt-cache policy: %w", err)
	}

	var installed, candidate string
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "installed:") {
			installed = strings.TrimSpace(trimmed[10:])
		} else if strings.HasPrefix(lower, "candidate:") {
			candidate = strings.TrimSpace(trimmed[10:])
		}
	}

	// Debian version strings (1:8.2.3995-1ubuntu2) are not semver, so apt-cache's own
	// installed-versus-candidate answer is the one that counts.
	outdated := installed != "" && installed != "(none)" && candidate != "" && candidate != "(none)" && installed != candidate

	return &UpdateCheckResult{
		Outdated:      new(outdated),
		LocalVersion:  installed,
		LatestVersion: candidate,
	}, nil
}

func init() {
	_ = Register(&AptInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
