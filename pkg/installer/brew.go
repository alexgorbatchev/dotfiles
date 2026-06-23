package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type brewInfoVersions struct {
	Stable string `json:"stable"`
}

type brewInfo struct {
	Name     string           `json:"name"`
	Versions brewInfoVersions `json:"versions"`
}

type BrewInstaller struct {
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

func (b *BrewInstaller) SupportsSudo() bool {
	return false
}

func (b *BrewInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	formula := getStringParam(tool.InstallParams, "formula", tool.Name)
	isCask := getBoolParam(tool.InstallParams, "cask", false)
	taps := getStringSliceParam(tool.InstallParams, "tap")
	force := getBoolParam(tool.InstallParams, "force", false)

	// Tap custom repositories if any
	for _, tap := range taps {
		cmd := b.runner.CommandContext(ctx, "brew", "tap", tap)
		if err := cmd.Run(); err != nil {
			return nil, fmt.Errorf("brew tap %s: %w", tap, err)
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
	args = append(args, formula)

	cmd := b.runner.CommandContext(ctx, "brew", args...)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("brew install %s: %w", formula, err)
	}

	// Retrieve version
	var version string
	versionArgs := getStringSliceParam(tool.InstallParams, "versionArgs")
	versionRegex := getStringParam(tool.InstallParams, "versionRegex", "")

	if len(versionArgs) > 0 && versionRegex != "" {
		// Run cli version detection (mocked or real)
		// For simplicity, we can fetch prefix and run the binary or simulate it.
		// Since we want to support tests easily, let's fall back to prefix bin
		prefix, _ := b.getBrewPrefix(ctx, formula)
		binPath := prefix + "/bin/" + tool.Name
		versionCmd := b.runner.CommandContext(ctx, binPath, versionArgs...)
		out, err := versionCmd.Output()
		if err == nil {
			version = strings.TrimSpace(string(out)) // Or parse with regex
		}
	}

	if version == "" {
		v, err := b.getBrewVersion(ctx, formula)
		if err == nil {
			version = v
		}
	}

	return &InstallResult{
		Binaries: []string{}, // externally managed
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
