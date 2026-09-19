package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type brewInfoVersions struct {
	Stable string `json:"stable"`
}

type brewInfo struct {
	Name     string           `json:"name"`
	Outdated bool             `json:"outdated"`
	Versions brewInfoVersions `json:"versions"`
}

type brewInfoV2 struct {
	Formulae []struct {
		Name     string `json:"name"`
		Outdated bool   `json:"outdated"`
		Versions struct {
			Stable string `json:"stable"`
		} `json:"versions"`
		Installed []struct {
			Version string `json:"version"`
		} `json:"installed"`
	} `json:"formulae"`
	Casks []struct {
		Token     string `json:"token"`
		Version   string `json:"version"`
		Installed string `json:"installed"`
		Outdated  bool   `json:"outdated"`
	} `json:"casks"`
}

type BrewInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
}

func NewBrewInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *BrewInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &BrewInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (b *BrewInstaller) Name() string {
	return "brew"
}

// SetSystemContext applies the target the run was invoked for.
func (b *BrewInstaller) SetSystemContext(sysCtx *SystemContext) {
	b.sysCtx = sysCtx
}

func (b *BrewInstaller) SetFS(fsys fs.FS) {
	b.fsys = fsys
}

func (b *BrewInstaller) SetLogger(log *logger.Logger) {
	b.log = log
}

func (b *BrewInstaller) SupportsSudo() bool {
	return false
}

func (b *BrewInstaller) getBrewExecutable() string {
	candidates := []string{
		"/opt/homebrew/bin/brew",
		"/usr/local/bin/brew",
		"/home/linuxbrew/.linuxbrew/bin/brew",
	}
	for _, c := range candidates {
		if exists, _ := b.fsys.Exists(c); exists {
			return c
		}
	}
	return "brew"
}

func (b *BrewInstaller) brewCommand(ctx context.Context, args ...string) exec.Cmd {
	brewExe := b.getBrewExecutable()
	if b.fsys.IsAbs(brewExe) {
		if abs, err := b.fsys.Abs(brewExe); err == nil {
			brewExe = abs
		}
	}
	cmd := b.runner.CommandContext(ctx, brewExe, args...)
	if filepath.IsAbs(brewExe) {
		brewDir := filepath.Dir(brewExe)
		pathEnv := ""
		for _, env := range os.Environ() {
			if strings.HasPrefix(env, "PATH=") {
				pathEnv = env[5:]
				break
			}
		}
		if !strings.Contains(pathEnv, brewDir) {
			newPath := brewDir
			if pathEnv != "" {
				newPath = brewDir + string(os.PathListSeparator) + pathEnv
			}
			cmd.SetEnv(append(os.Environ(), "PATH="+newPath))
		}
	}
	return cmd
}

func (b *BrewInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(b, tool); err != nil {
		return nil, err
	}
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	formula := getStringParam(tool.InstallParams, "formula", tool.Name)
	isCask := getBoolParam(tool.InstallParams, "cask", false)
	trusts := getStringSliceParam(tool.InstallParams, "trust")
	taps := getStringSliceParam(tool.InstallParams, "tap")
	if len(trusts) == 0 && getBoolParam(tool.InstallParams, "trust", false) {
		trusts = taps
	}
	customArgs := getStringSliceParam(tool.InstallParams, "args")
	force := getBoolParam(tool.InstallParams, "force", false)

	var writer *logger.LineWriter
	if b.log != nil {
		writer = logger.NewLineWriter(b.log.WithTag(tool.Name), "|")
	}

	// Trust targets if any
	for _, trust := range trusts {
		if b.log != nil {
			b.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ brew trust %s", trust)))
		}
		cmd := b.brewCommand(ctx, "trust", trust)
		if writer != nil {
			cmd.SetStdout(writer)
			cmd.SetStderr(writer)
		}
		if err := cmd.Run(); err != nil {
			if writer != nil {
				writer.PrintError(err)
			}
			return nil, fmt.Errorf("brew trust %s: %w", trust, err)
		}
		if writer != nil {
			writer.Flush()
		}
	}

	// Tap custom repositories if any
	for _, tap := range taps {
		if b.log != nil {
			b.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ brew tap %s", tap)))
		}
		cmd := b.brewCommand(ctx, "tap", tap)
		if writer != nil {
			cmd.SetStdout(writer)
			cmd.SetStderr(writer)
		}
		if err := cmd.Run(); err != nil {
			if writer != nil {
				writer.PrintError(err)
			}
			return nil, fmt.Errorf("brew tap %s: %w", tap, err)
		}
		if writer != nil {
			writer.Flush()
		}
	}

	// Install formula or cask
	args := []string{"install"}
	if isCask {
		args = append(args, "--cask")
	}
	if force {
		args = append(args, "--force")
	}
	if len(customArgs) > 0 {
		args = append(args, customArgs...)
	}
	args = append(args, formula)

	if b.log != nil {
		b.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ brew %s", strings.Join(args, " "))))
	}
	cmd := b.brewCommand(ctx, args...)
	if writer != nil {
		cmd.SetStdout(writer)
		cmd.SetStderr(writer)
	}
	if err := cmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("brew install %s: %w", formula, err)
	}
	if writer != nil {
		writer.Flush()
	}

	// Link formula if configured
	if linkArgs := brewLinkArgs(tool.InstallParams["link"]); linkArgs != nil {
		linkArgs = append(linkArgs, formula)
		if b.log != nil {
			b.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ brew %s", strings.Join(linkArgs, " "))))
		}
		linkCmd := b.brewCommand(ctx, linkArgs...)
		if writer != nil {
			linkCmd.SetStdout(writer)
			linkCmd.SetStderr(writer)
		}
		if err := linkCmd.Run(); err != nil {
			if writer != nil {
				writer.PrintError(err)
			}
			return nil, fmt.Errorf("brew link %s: %w", formula, err)
		}
		if writer != nil {
			writer.Flush()
		}
	}

	// Service management if configured
	if serviceVal, ok := tool.InstallParams["service"]; ok && serviceVal != nil {
		action := ""
		switch v := serviceVal.(type) {
		case bool:
			if v {
				action = "start"
			}
		case string:
			action = v
		}
		if action != "" {
			if b.log != nil {
				b.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ brew services %s %s", action, formula)))
			}
			svcCmd := b.brewCommand(ctx, "services", action, formula)
			if writer != nil {
				svcCmd.SetStdout(writer)
				svcCmd.SetStderr(writer)
			}
			if err := svcCmd.Run(); err != nil {
				if writer != nil {
					writer.PrintError(err)
				}
				return nil, fmt.Errorf("brew services %s %s: %w", action, formula, err)
			}
			if writer != nil {
				writer.Flush()
			}
		}
	}

	// Retrieve version
	var version string
	versionArgs := getStringSliceParam(tool.InstallParams, "versionArgs")
	versionRegex := getStringParam(tool.InstallParams, "versionRegex", "")

	if len(versionArgs) > 0 {
		prefix, _ := b.getBrewPrefix(ctx, formula)
		binPath := filepath.Join(prefix, "bin", tool.Name)
		v, err := detectVersionViaCli(ctx, b.runner, binPath, versionArgs, versionRegex)
		if err == nil && v != "" {
			version = v
		}
	}

	if version == "" {
		v, _, _, err := b.getBrewInfo(ctx, formula, isCask)
		if err == nil {
			version = v
		}
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	prefix, _ := b.getBrewPrefix(ctx, formula)
	resolvedBinaries := ResolveBinaryPaths(ctx, b.fsys, binNames, func(binName string) string {
		if prefix != "" {
			return filepath.Join(prefix, "bin", binName)
		}
		if exists, _ := b.fsys.Exists(filepath.Join("/opt/homebrew/bin", binName)); exists {
			return filepath.Join("/opt/homebrew/bin", binName)
		}
		return filepath.Join("/usr/local/bin", binName)
	})

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  version,
	}, nil
}

// brewLinkArgs translates the `link` parameter into the leading arguments of a
// `brew link` invocation, or nil when no link step should run. The parameter is
// `true | false | { force?, overwrite? }`: only true and the object form opt in,
// so an explicit false (or an omitted key) never links a keg-only formula the
// author chose to leave unlinked.
func brewLinkArgs(link interface{}) []string {
	switch v := link.(type) {
	case bool:
		if !v {
			return nil
		}
		return []string{"link"}
	case map[string]interface{}:
		args := []string{"link"}
		if getBoolParam(v, "overwrite", false) {
			args = append(args, "--overwrite")
		}
		if getBoolParam(v, "force", false) {
			args = append(args, "--force")
		}
		return args
	}
	return nil
}

func (b *BrewInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	formula := getStringParam(tool.InstallParams, "formula", tool.Name)
	cmd := b.brewCommand(ctx, "uninstall", formula)
	return cmd.Run()
}

func (b *BrewInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	formula := getStringParam(tool.InstallParams, "formula", tool.Name)
	isCask := getBoolParam(tool.InstallParams, "cask", false)
	latest, installed, outdated, err := b.getBrewInfo(ctx, formula, isCask)
	if err != nil {
		return &UpdateCheckResult{}, nil
	}
	// Homebrew answers this itself, and its formula versions carry revision suffixes
	// (1.2.3_1) that semver cannot order, so its verdict is the one that counts.
	return &UpdateCheckResult{
		Outdated:      new(outdated),
		LocalVersion:  installed,
		LatestVersion: latest,
	}, nil
}

func (b *BrewInstaller) getBrewPrefix(ctx context.Context, formula string) (string, error) {
	cmd := b.brewCommand(ctx, "--prefix", formula)
	out, err := cmd.Output()
	if err == nil {
		return strings.TrimSpace(string(out)), nil
	}
	// Fallback
	cmdPrefix := b.brewCommand(ctx, "--prefix")
	prefixOut, errPrefix := cmdPrefix.Output()
	if errPrefix == nil {
		return strings.TrimSpace(string(prefixOut)) + "/opt/" + formula, nil
	}
	return "/usr/local/opt/" + formula, nil
}

func (b *BrewInstaller) getBrewInfo(ctx context.Context, formula string, isCask bool) (latestVersion string, installedVersion string, outdated bool, err error) {
	args := []string{"info", "--json=v2"}
	if isCask {
		args = append(args, "--cask")
	}
	args = append(args, formula)

	cmd := b.brewCommand(ctx, args...)
	out, err := cmd.Output()
	if err != nil {
		if isCask {
			cmd = b.brewCommand(ctx, "info", "--json=v2", formula)
			out, err = cmd.Output()
		}
		if err != nil {
			return "", "", false, err
		}
	}

	var v2 brewInfoV2
	if err := json.Unmarshal(out, &v2); err == nil {
		if len(v2.Casks) > 0 {
			c := v2.Casks[0]
			return c.Version, c.Installed, c.Outdated, nil
		}
		if len(v2.Formulae) > 0 {
			f := v2.Formulae[0]
			instVer := ""
			if len(f.Installed) > 0 {
				instVer = f.Installed[0].Version
			}
			return f.Versions.Stable, instVer, f.Outdated, nil
		}
	}

	var list []brewInfo
	if err := json.Unmarshal(out, &list); err == nil && len(list) > 0 {
		return list[0].Versions.Stable, "", list[0].Outdated, nil
	}

	return "", "", false, fmt.Errorf("no version found for brew package %s", formula)
}

func init() {
	_ = Register(&BrewInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
