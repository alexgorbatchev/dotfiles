package installer

import (
	"context"
	"encoding/json"
	"fmt"
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
	Versions brewInfoVersions `json:"versions"`
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

func (b *BrewInstaller) SetFS(fsys fs.FS) {
	b.fsys = fsys
}

func (b *BrewInstaller) SetLogger(log *logger.Logger) {
	b.log = log
}

func (b *BrewInstaller) SupportsSudo() bool {
	return false
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
	customArgs := getStringSliceParam(tool.InstallParams, "args")
	force := getBoolParam(tool.InstallParams, "force", false)

	var writer *logger.LineWriter
	if b.log != nil {
		writer = logger.NewLineWriter(b.log.GetSubLogger("", tool.Name), "|")
	}

	// Trust targets if any
	for _, trust := range trusts {
		if b.log != nil {
			b.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ brew trust %s", trust)))
		}
		cmd := b.runner.CommandContext(ctx, "brew", "trust", trust)
		if writer != nil {
			cmd.SetStdout(writer)
			cmd.SetStderr(writer)
		}
		if err := cmd.Run(); err != nil {
			if writer != nil {
				writer.Flush()
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
			b.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ brew tap %s", tap)))
		}
		cmd := b.runner.CommandContext(ctx, "brew", "tap", tap)
		if writer != nil {
			cmd.SetStdout(writer)
			cmd.SetStderr(writer)
		}
		if err := cmd.Run(); err != nil {
			if writer != nil {
				writer.Flush()
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
		b.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ brew %s", strings.Join(args, " "))))
	}
	cmd := b.runner.CommandContext(ctx, "brew", args...)
	if writer != nil {
		cmd.SetStdout(writer)
		cmd.SetStderr(writer)
	}
	if err := cmd.Run(); err != nil {
		if writer != nil {
			writer.Flush()
		}
		return nil, fmt.Errorf("brew install %s: %w", formula, err)
	}
	if writer != nil {
		writer.Flush()
	}

	// Link formula if configured
	if linkVal, ok := tool.InstallParams["link"]; ok && linkVal != nil {
		linkArgs := []string{"link"}
		if m, ok := linkVal.(map[string]interface{}); ok {
			if getBoolParam(m, "overwrite", false) {
				linkArgs = append(linkArgs, "--overwrite")
			}
			if getBoolParam(m, "force", false) {
				linkArgs = append(linkArgs, "--force")
			}
		}
		linkArgs = append(linkArgs, formula)
		if b.log != nil {
			b.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ brew %s", strings.Join(linkArgs, " "))))
		}
		linkCmd := b.runner.CommandContext(ctx, "brew", linkArgs...)
		if writer != nil {
			linkCmd.SetStdout(writer)
			linkCmd.SetStderr(writer)
		}
		if err := linkCmd.Run(); err != nil {
			if writer != nil {
				writer.Flush()
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
				b.log.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ brew services %s %s", action, formula)))
			}
			svcCmd := b.runner.CommandContext(ctx, "brew", "services", action, formula)
			if writer != nil {
				svcCmd.SetStdout(writer)
				svcCmd.SetStderr(writer)
			}
			if err := svcCmd.Run(); err != nil {
				if writer != nil {
					writer.Flush()
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
		v, err := b.getBrewVersion(ctx, formula)
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
		return filepath.Join("/usr/local/bin", binName)
	})

	return &InstallResult{
		Binaries: resolvedBinaries,
		Version:  version,
	}, nil
}

func (b *BrewInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	formula := getStringParam(tool.InstallParams, "formula", tool.Name)
	cmd := b.runner.CommandContext(ctx, "brew", "uninstall", formula)
	return cmd.Run()
}

func (b *BrewInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	formula := getStringParam(tool.InstallParams, "formula", tool.Name)
	latest, err := b.getBrewVersion(ctx, formula)
	if err != nil {
		return nil, err
	}
	return &UpdateCheckResult{
		HasUpdate:     false, // simplified fallback
		LatestVersion: latest,
	}, nil
}

func (b *BrewInstaller) getBrewPrefix(ctx context.Context, formula string) (string, error) {
	cmd := b.runner.CommandContext(ctx, "brew", "--prefix", formula)
	out, err := cmd.Output()
	if err == nil {
		return strings.TrimSpace(string(out)), nil
	}
	// Fallback
	cmdPrefix := b.runner.CommandContext(ctx, "brew", "--prefix")
	prefixOut, errPrefix := cmdPrefix.Output()
	if errPrefix == nil {
		return strings.TrimSpace(string(prefixOut)) + "/opt/" + formula, nil
	}
	return "/usr/local/opt/" + formula, nil
}

func (b *BrewInstaller) getBrewVersion(ctx context.Context, formula string) (string, error) {
	cmd := b.runner.CommandContext(ctx, "brew", "info", "--json", formula)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}

	var list []brewInfo
	if err := json.Unmarshal(out, &list); err != nil {
		return "", err
	}

	if len(list) > 0 && list[0].Versions.Stable != "" {
		return list[0].Versions.Stable, nil
	}

	return "", fmt.Errorf("no version found")
}

func init() {
	_ = Register(&BrewInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
