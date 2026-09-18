package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type ManualInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
	BinDir string // Destination directory for binaries
}

func NewManualInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *ManualInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &ManualInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (m *ManualInstaller) Name() string {
	return "manual"
}

func (m *ManualInstaller) SetFS(fsys fs.FS) {
	m.fsys = fsys
}

func (m *ManualInstaller) SetLogger(log *logger.Logger) {
	m.log = log
}

func (m *ManualInstaller) SupportsSudo() bool {
	return true
}

func (m *ManualInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(m, tool); err != nil {
		return nil, err
	}
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	binaryPath := getStringParam(tool.InstallParams, "binaryPath", "")
	projCfg := config.GetProjectConfig(ctx)
	if projCfg != nil && binaryPath != "" {
		resolved, err := config.ResolvePlaceholders(binaryPath, tool.Name, projCfg)
		if err == nil {
			binaryPath = resolved
		}
	}

	if binaryPath != "" {
		if !m.fsys.IsAbs(binaryPath) && tool.ConfigFilePath != "" {
			binaryPath = filepath.Join(filepath.Dir(tool.ConfigFilePath), binaryPath)
		}
		if abs, err := m.fsys.Abs(binaryPath); err == nil {
			binaryPath = abs
		}

		exists, err := m.fsys.Exists(binaryPath)
		if err != nil || !exists {
			return nil, fmt.Errorf("binary not found at %s", binaryPath)
		}

		destDir := m.BinDir
		if destDir == "" {
			destDir = os.TempDir()
		}

		if err := m.fsys.MkdirAll(destDir, 0755); err != nil {
			return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
		}

		binNames := GetBinaryNames(tool.Name, tool.Binaries)

		symlink := getBoolParam(tool.InstallParams, "symlink", false)
		if symlink {
			for _, binName := range binNames {
				destPath := filepath.Join(destDir, binName)
				_ = m.fsys.Remove(destPath)
				if err := m.fsys.Symlink(binaryPath, destPath); err != nil {
					return nil, fmt.Errorf("creating symlink %s -> %s: %w", destPath, binaryPath, err)
				}
			}
			return &InstallResult{
				Binaries: binNames,
			}, nil
		}

		// Copy the binary file for each expected binary name
		data, err := m.fsys.ReadFile(binaryPath)
		if err != nil {
			return nil, fmt.Errorf("reading source binary: %w", err)
		}

		for _, binName := range binNames {
			destPath := filepath.Join(destDir, binName)
			if err := m.fsys.WriteFile(destPath, data, 0755); err != nil {
				return nil, fmt.Errorf("writing copied binary %s: %w", binName, err)
			}
			chmodCmd := m.runner.CommandContext(ctx, "chmod", "+x", destPath)
			_ = chmodCmd.Run()
		}

		return &InstallResult{
			Binaries: binNames,
		}, nil
	}

	return &InstallResult{
		Binaries: []string{},
	}, nil
}

func (m *ManualInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := m.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return m.fsys.Remove(destPath)
	}
	return nil
}

func (m *ManualInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{}, nil
}

func init() {
	_ = Register(&ManualInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
