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

// SetSystemContext applies the target the run was invoked for.
func (d *DnfInstaller) SetSystemContext(sysCtx *SystemContext) {
	d.sysCtx = sysCtx
}

func (d *DnfInstaller) SetFS(fsys fs.FS) {
	d.fsys = fsys
}

func (d *DnfInstaller) SetLogger(log *logger.Logger) {
	d.log = log
}

func (d *DnfInstaller) SupportsSudo() bool {
	return true
}

func (d *DnfInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(d, tool); err != nil {
		return nil, err
	}
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	refresh := getBoolParam(tool.InstallParams, "refresh", false)
	version := getStringParam(tool.InstallParams, "version", "")
	if version == "" && tool.Version != nil {
		version = *tool.Version
	}

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s-%s", packageName, version)
	}

	var writer *logger.LineWriter
	if d.log != nil {
		writer = logger.NewLineWriter(d.log.GetSubLogger("", tool.Name), "|")
	}

	// Step 1: Optional dnf makecache
	if refresh {
		var args []string
		var cmd exec.Cmd
		if tool.Sudo {
			args = []string{"dnf", "makecache"}
			if d.log != nil {
				d.log.GetSubLogger("", tool.Name).Info(logger.Message("$ sudo dnf makecache"))
			}
			cmd = d.runner.CommandContext(ctx, "sudo", args...)
		} else {
			args = []string{"makecache"}
			if d.log != nil {
				d.log.GetSubLogger("", tool.Name).Info(logger.Message("$ dnf makecache"))
			}
			cmd = d.runner.CommandContext(ctx, "dnf", args...)
		}
		if writer != nil {
			cmd.SetStdout(writer)
			cmd.SetStderr(writer)
		}
		if err := cmd.Run(); err != nil {
			if writer != nil {
				writer.PrintError(err)
			}
			return nil, fmt.Errorf("dnf makecache failed: %w", err)
		}
		if writer != nil {
			writer.Flush()
		}
	}

	// Step 2: dnf install
	if writer != nil {
		writer.Reset()
	}
	var installCmd exec.Cmd
	if tool.Sudo {
		args := []string{"dnf", "install", "-y", packageSpec}
		if d.log != nil {
			d.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ sudo dnf install -y %s", packageSpec)))
		}
		installCmd = d.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"install", "-y", packageSpec}
		if d.log != nil {
			d.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ dnf install -y %s", packageSpec)))
		}
		installCmd = d.runner.CommandContext(ctx, "dnf", args...)
	}
	if writer != nil {
		installCmd.SetStdout(writer)
		installCmd.SetStderr(writer)
	}

	if err := installCmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("dnf install %s failed: %w", packageName, err)
	}
	if writer != nil {
		writer.Flush()
	}

	// Step 3: Fetch version via rpm -q
	var detectedVersion string
	queryCmd := d.runner.CommandContext(ctx, "rpm", "-q", "--qf", "%{VERSION}-%{RELEASE}", packageName)
	out, err := queryCmd.Output()
	if err == nil {
		detectedVersion = strings.TrimSpace(string(out))
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	resolvedBinaries := ResolveBinaryPaths(ctx, d.fsys, binNames, func(binName string) string {
		return filepath.Join("/usr/bin", binName)
	})

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  detectedVersion,
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
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	cmd := d.runner.CommandContext(ctx, "dnf", "list", "--upgradable", packageName)
	out, err := cmd.Output()
	if err != nil {
		return &UpdateCheckResult{}, nil
	}

	lines := strings.Split(string(out), "\n")
	isUpgradableSection := false
	outdated := false
	var latestVersion string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(trimmed), "upgradable packages") {
			isUpgradableSection = true
			continue
		}
		if isUpgradableSection && trimmed != "" {
			fields := strings.Fields(trimmed)
			if len(fields) >= 2 {
				// Strip arch (e.g. .x86_64) if package name was queried without it
				pkgPart := fields[0]
				if idx := strings.Index(pkgPart, "."); idx != -1 {
					pkgPart = pkgPart[:idx]
				}
				if strings.EqualFold(pkgPart, packageName) {
					outdated = true
					latestVersion = fields[1]
					break
				}
			}
		}
	}

	// `dnf list --upgradable` answers the question directly: the package is listed or
	// it is not, and rpm version strings (1.2.3-4.fc39) are not semver.
	return &UpdateCheckResult{
		Outdated:      new(outdated),
		LatestVersion: latestVersion,
	}, nil
}

func init() {
	_ = Register(&DnfInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
