package installer

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type ManualInstaller struct {
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

func (m *ManualInstaller) SupportsSudo() bool {
	return true
}

func (m *ManualInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	binaryPath := getStringParam(tool.InstallParams, "binaryPath", "")

	if binaryPath != "" {
		exists, err := m.fsys.Exists(binaryPath)
		if err != nil || !exists {
			return nil, fmt.Errorf("binary not found at %s", binaryPath)
		}

		destDir := m.BinDir
		if destDir == "" {
			destDir = "/tmp"
		}

		if err := m.fsys.MkdirAll(destDir, 0755); err != nil {
			return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
		}

		destPath := filepath.Join(destDir, tool.Name)

		// Copy the binary file
		data, err := m.fsys.ReadFile(binaryPath)
		if err != nil {
			return nil, fmt.Errorf("reading source binary: %w", err)
		}

		if err := m.fsys.WriteFile(destPath, data, 0755); err != nil {
			return nil, fmt.Errorf("writing copied binary: %w", err)
		}

		// Make executable
		chmodCmd := m.runner.CommandContext(ctx, "chmod", "+x", destPath)
		_ = chmodCmd.Run()

		return &InstallResult{
			Binaries: []string{tool.Name},
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
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&ManualInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
