package orchestrator

import (
	"context"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
)

// mockInstaller implements installer.Installer for testing.
type mockInstaller struct {
	name         string
	supportsSudo bool
	lastTool     *config.ToolConfig
	binaries     []string
	err          error
	uninstallErr error
	installCount int
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.supportsSudo
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	m.installCount++
	m.lastTool = tool
	if m.err != nil {
		return nil, m.err
	}
	return &installer.InstallResult{
		Binaries: m.binaries,
	}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	if m.uninstallErr != nil {
		return m.uninstallErr
	}
	return nil
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

func strPtr(s string) *string {
	return &s
}

type mockFailingInstaller struct {
	mockInstaller
}

func (m *mockFailingInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return nil, fmt.Errorf("mock installation error")
}
