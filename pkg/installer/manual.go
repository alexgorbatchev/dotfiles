package installer

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

// Clone returns an isolated copy of m for a single tool install.
func (m *ManualInstaller) Clone() Installer {
	clone := *m
	return &clone
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
	binaryPath, err := ResolveBinaryPath(m.fsys, tool, config.GetProjectConfig(ctx), m.BinDir)
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

		if !shouldCopyBinary(tool.InstallParams) {
			for _, binName := range binNames {
				destPath := filepath.Join(destDir, binName)
				if filepath.Clean(binaryPath) == filepath.Clean(destPath) {
					continue
				}
				if err := m.fsys.Remove(destPath); err != nil && !errors.Is(err, os.ErrNotExist) && !os.IsNotExist(err) {
					return nil, fmt.Errorf("%s: clearing %s for symlink: %w", tool.Name, destPath, err)
				}
				symlinkTarget := binaryPath
				if rel, err := filepath.Rel(destDir, binaryPath); err == nil && !strings.HasPrefix(rel, "..") {
					symlinkTarget = rel
				}
				if err := m.fsys.Symlink(symlinkTarget, destPath); err != nil {
					return nil, fmt.Errorf("creating symlink %s -> %s: %w", destPath, symlinkTarget, err)
				}
			}
			return &InstallResult{
				Binaries: binNames,
			}, nil
		}

		// CopyFile streams the binary and keeps the source's mode, which may not be
		// executable, so each copy is made executable explicitly. Existing entries
		// are cleared first so a prior symlink is replaced rather than written through.
		for _, binName := range binNames {
			destPath := filepath.Join(destDir, binName)
			if filepath.Clean(binaryPath) != filepath.Clean(destPath) {
				if err := m.fsys.Remove(destPath); err != nil && !errors.Is(err, os.ErrNotExist) && !os.IsNotExist(err) {
					return nil, fmt.Errorf("%s: clearing %s for copy: %w", tool.Name, destPath, err)
				}
				if err := m.fsys.CopyFile(binaryPath, destPath); err != nil {
					return nil, fmt.Errorf("copying binary %s from %s: %w", binName, binaryPath, err)
				}
			}
			if err := m.fsys.Chmod(destPath, 0755); err != nil {
				return nil, fmt.Errorf("making binary %s executable: %w", binName, err)
			}
		}

		return &InstallResult{
			Binaries: binNames,
		}, nil
	}

	if m.BinDir != "" && len(tool.Binaries) > 0 {
		entries, err := m.fsys.ReadDir(m.BinDir)
		if err == nil && len(entries) > 0 {
			promoted, err := PromoteBinaries(m.fsys, m.BinDir, tool.Name, tool.Binaries, KeepOutsideLinks)
			if err != nil {
				return nil, err
			}
			return &InstallResult{
				Binaries: promoted,
			}, nil
		}
	}

	return &InstallResult{
		Binaries: []string{},
	}, nil
}

func (m *ManualInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed Installation) error {
	destDir := m.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return m.fsys.Remove(destPath)
	}
	return nil
}

// CheckUpdate reports ErrUpdateCheckUnsupported. A manually installed binary has no upstream to ask for a newer version.
func (m *ManualInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return nil, ErrUpdateCheckUnsupported
}

// shouldCopyBinary decides whether manual installation copies binaryPath or
// symlinks it. It links by default, copying only on explicit request (copy: true or
// symlink: false).
func shouldCopyBinary(params map[string]interface{}) bool {
	if getBoolParam(params, "copy", false) {
		return true
	}
	if _, ok := params["symlink"]; ok && !getBoolParam(params, "symlink", true) {
		return true
	}
	return false
}

func init() {
	_ = Register(&ManualInstaller{
		fsys: &fs.OSFS{},
	})
}
