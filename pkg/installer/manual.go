package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type ManualInstaller struct {
	log    *logger.Logger
	fsys   fs.FS
	sysCtx *SystemContext
	BinDir string // Destination directory for binaries
}

func NewManualInstaller(fsys fs.FS, sysCtx *SystemContext) *ManualInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &ManualInstaller{
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (m *ManualInstaller) Name() string {
	return "manual"
}

// SetSystemContext applies the target the run was invoked for.
func (m *ManualInstaller) SetSystemContext(sysCtx *SystemContext) {
	m.sysCtx = sysCtx
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
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	binaryPath, err := ResolveBinaryPath(m.fsys, tool, config.GetProjectConfig(ctx))
	if err != nil {
		return nil, err
	}
	if binaryPath != "" {
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

		// CopyFile streams the binary and keeps the source's mode, which may not be
		// executable, so each copy is made executable explicitly.
		for _, binName := range binNames {
			destPath := filepath.Join(destDir, binName)
			if err := m.fsys.CopyFile(binaryPath, destPath); err != nil {
				return nil, fmt.Errorf("copying binary %s from %s: %w", binName, binaryPath, err)
			}
			if err := m.fsys.Chmod(destPath, 0755); err != nil {
				return nil, fmt.Errorf("making binary %s executable: %w", binName, err)
			}
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
		fsys: &fs.OSFS{},
	})
}
