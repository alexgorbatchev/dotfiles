package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
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
	version := tool.RequestedVersion()

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
	args := []string{"policy", packageName}
	cmd := a.runner.CommandContext(ctx, "apt-cache", args...)
	// apt translates the field labels (Installiert: under a German locale), and they are
	// read below by their English names. LC_ALL=C outranks LANG and every LC_* variable,
	// gettext ignores LANGUAGE under the C locale, and os/exec keeps the last of duplicate
	// entries, so this overrides whatever the user set.
	cmd.SetEnv(append(os.Environ(), "LC_ALL=C"))
	query := runQuery(cmd, "apt-cache", args...)
	if query.err != nil {
		return nil, query.fail(query.err)
	}

	// apt-cache policy exits 0 whether or not the package is installed, prints nothing
	// at all for a name apt has no record of, and for an unknown name that reads as a
	// regular expression (perl-bas., libstdc++) prints the packages the expression
	// matches instead. So only the Installed: line of the package's own section
	// separates an installed package from the rest. It reads (none) for a package that
	// was never installed and for one removed with its configuration files kept.
	if strings.TrimSpace(query.stdout) == "" {
		return nil, query.fail(fmt.Errorf("apt does not know package %s: apt-cache policy printed nothing on standard output", packageName))
	}
	sections := parseAptPolicy(query.stdout)
	if len(sections) == 0 {
		return nil, query.refuse(fmt.Errorf("apt-cache policy printed no package section for %s: %s", packageName, strings.TrimSpace(query.stdout)))
	}
	i := slices.IndexFunc(sections, func(s aptPolicySection) bool { return s.names(packageName) })
	if i < 0 {
		return nil, query.refuse(fmt.Errorf("apt does not know package %s: apt-cache policy listed %s instead", packageName, aptSectionNames(sections)))
	}
	installed, candidate := sections[i].installed, sections[i].candidate
	switch {
	case installed == "":
		// Output in a form this parser does not read. Quote stdout itself: fail would
		// quote stderr instead whenever apt also printed a warning there.
		return nil, query.refuse(fmt.Errorf("apt-cache policy printed no Installed: line for %s: %s", packageName, strings.TrimSpace(query.stdout)))
	case installed == aptNoVersion:
		return nil, query.refuse(fmt.Errorf("apt package %s is not installed: apt-cache policy reports Installed: (none)", packageName))
	case candidate == "":
		return nil, query.refuse(fmt.Errorf("apt-cache policy printed no Candidate: line for %s: %s", packageName, strings.TrimSpace(query.stdout)))
	case candidate == aptNoVersion:
		return nil, query.refuse(fmt.Errorf("apt package %s has no candidate version: apt-cache policy reports Installed: %s, Candidate: (none)", packageName, installed))
	}

	// Debian version strings (1:8.2.3995-1ubuntu2) are not semver, so apt-cache's own
	// installed-versus-candidate answer is the one that counts.
	return &UpdateCheckResult{
		Outdated:      new(installed != candidate),
		LocalVersion:  installed,
		LatestVersion: candidate,
	}, nil
}

// aptNoVersion is what apt-cache policy prints in place of a version that does not
// exist: an Installed: version for a package that is not installed, or a Candidate:
// for one with nothing to install.
const aptNoVersion = "(none)"

// aptPolicySection is one package's part of an apt-cache policy transcript: an
// unindented "<name>:" header followed by indented Installed:, Candidate: and
// Version table: lines. Each version is empty when its line is missing.
type aptPolicySection struct {
	name, installed, candidate string
}

// names reports whether the section is the one apt-cache policy prints for pkg. apt
// heads the section with the bare name when pkg carries the native architecture or
// a pseudo-architecture (bash:arm64 and bash:native both print "bash:"), and with the
// qualified name for a foreign one.
func (s aptPolicySection) names(pkg string) bool {
	if s.name == pkg {
		return true
	}
	bare, _, qualified := strings.Cut(pkg, ":")
	return qualified && s.name == bare
}

// aptSectionListLimit caps how many package names an error quotes from a transcript
// that lists other packages: a regular expression can match hundreds.
const aptSectionListLimit = 5

// aptSectionNames lists the packages of sections for an error message, at most
// aptSectionListLimit of them; sections is never empty.
func aptSectionNames(sections []aptPolicySection) string {
	names := make([]string, 0, min(len(sections), aptSectionListLimit))
	for _, s := range sections[:min(len(sections), aptSectionListLimit)] {
		names = append(names, s.name)
	}
	list := strings.Join(names, ", ")
	if more := len(sections) - len(names); more > 0 {
		list += fmt.Sprintf(" and %d more", more)
	}
	return list
}

// parseAptPolicy splits an apt-cache policy transcript, in the C locale, into its
// package sections. Only the first Installed: and Candidate: lines of a section
// count; the version table below them lists versions, not labels.
func parseAptPolicy(out string) []aptPolicySection {
	var sections []aptPolicySection
	for line := range strings.Lines(out) {
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, " ") {
			if name, ok := strings.CutSuffix(line, ":"); ok {
				sections = append(sections, aptPolicySection{name: name})
			}
			continue
		}
		if len(sections) == 0 {
			continue
		}
		s := &sections[len(sections)-1]
		field := strings.TrimSpace(line)
		if v, ok := strings.CutPrefix(field, "Installed:"); ok && s.installed == "" {
			s.installed = strings.TrimSpace(v)
		} else if v, ok := strings.CutPrefix(field, "Candidate:"); ok && s.candidate == "" {
			s.candidate = strings.TrimSpace(v)
		}
	}
	return sections
}

func init() {
	_ = Register(&AptInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
