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
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)
	refresh := getBoolParam(tool.InstallParams, "refresh", false)
	version := tool.RequestedVersion()

	packageSpec := packageName
	if version != "" && version != "latest" {
		packageSpec = fmt.Sprintf("%s-%s", packageName, version)
	}

	var writer *logger.LineWriter
	if d.log != nil {
		writer = logger.NewLineWriter(d.log.WithTag(tool.Name), "|")
	}

	// Step 1: Optional dnf makecache
	if refresh {
		var args []string
		var cmd exec.Cmd
		if tool.Sudo {
			args = []string{"dnf", "makecache"}
			if d.log != nil {
				d.log.WithTag(tool.Name).Info(logger.Message("$ sudo dnf makecache"))
			}
			cmd = d.runner.CommandContext(ctx, "sudo", args...)
		} else {
			args = []string{"makecache"}
			if d.log != nil {
				d.log.WithTag(tool.Name).Info(logger.Message("$ dnf makecache"))
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
			d.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ sudo dnf install -y %s", packageSpec)))
		}
		installCmd = d.runner.CommandContext(ctx, "sudo", args...)
	} else {
		args := []string{"install", "-y", packageSpec}
		if d.log != nil {
			d.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ dnf install -y %s", packageSpec)))
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
	queryCmd := d.runner.CommandContext(ctx, "rpm", "-q", "--qf", rpmVersionFormat, packageName)
	out, err := queryCmd.Output()
	if err == nil {
		detectedVersion = rpmFirstVersion(string(out))
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

// checksInstalledPackage marks the update check as one about the installed package
// (installedPackageChecker).
func (*DnfInstaller) checksInstalledPackage() {}

func (d *DnfInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	packageName := getStringParam(tool.InstallParams, "package", tool.Name)

	// `dnf check-update` exits 0 for a package that is not installed just as for one
	// that is current, so the installation is confirmed first; rpm exits 1 when it is
	// missing.
	rpmArgs := []string{"-q", "--qf", rpmVersionFormat, packageName}
	installed := runQuery(d.runner.CommandContext(ctx, "rpm", rpmArgs...), "rpm", rpmArgs...)
	if installed.err != nil {
		return nil, installed.fail(installed.err)
	}
	localVersion := rpmFirstVersion(installed.stdout)

	// dnf 4 and dnf 5 both give check-update a status of its own: 100 when upgrades
	// are listed, 0 when there are none, anything else when the query failed. rpm
	// version strings (1.2.3-4.fc39) are not semver, so dnf's verdict is the one that
	// counts. A repository that cannot be reached is skipped with only a warning when
	// it sets skip_if_unavailable, and the exit status then describes the rest, so
	// every repository is made to fail the query instead: nothing about the package is
	// known when its repository was not read.
	args := []string{"check-update", dnfFailUnavailableRepos, packageName}
	query := runQuery(d.runner.CommandContext(ctx, "dnf", args...), "dnf", args...)
	code, exited := query.exitCode()
	switch {
	case exited && code == 0:
		return &UpdateCheckResult{Outdated: new(false), LocalVersion: localVersion}, nil
	case exited && code == dnfUpgradesAvailable:
		latestVersion := dnfListedVersion(query.stdout, packageName)
		if latestVersion == "" {
			return nil, query.fail(fmt.Errorf("listed no upgrade for %s", packageName))
		}
		return &UpdateCheckResult{Outdated: new(true), LocalVersion: localVersion, LatestVersion: latestVersion}, nil
	default:
		return nil, query.fail(query.err)
	}
}

// rpmVersionFormat is the rpm query format for an installed package's version. rpm
// applies it once per installed instance (multilib packages, kernels), so each ends
// with a newline to keep the versions apart.
const rpmVersionFormat = "%{VERSION}-%{RELEASE}\n"

// rpmFirstVersion returns the first version an rpmVersionFormat query printed.
func rpmFirstVersion(out string) string {
	for _, line := range strings.Split(out, "\n") {
		if v := strings.TrimSpace(line); v != "" {
			return v
		}
	}
	return ""
}

// dnfFailUnavailableRepos overrides every repository's skip_if_unavailable, on dnf 4
// and dnf 5 alike; the unqualified option does not override a repository's own value.
const dnfFailUnavailableRepos = "--setopt=*.skip_if_unavailable=False"

// dnfUpgradesAvailable is the exit status `dnf check-update` gives when it lists
// upgrades.
const dnfUpgradesAvailable = 100

// dnfListedVersion returns the version `dnf check-update` lists for packageName, or ""
// when the listing does not name it. Each package is a `name.arch version repository`
// line; the lines around them (metadata expiry, obsoleted packages) are not.
func dnfListedVersion(listing, packageName string) string {
	for _, line := range strings.Split(listing, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		name := fields[0]
		if idx := strings.LastIndex(name, "."); idx != -1 {
			name = name[:idx]
		}
		if strings.EqualFold(name, packageName) {
			return fields[1]
		}
	}
	return ""
}

func init() {
	_ = Register(&DnfInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
