package dashboard

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// settingsRecordingRuns numbers the installers TestDashboard_CheckUpdateAppliesProjectSettings
// registers.
var settingsRecordingRuns atomic.Int32

// settingsRecordingInstaller records the project settings it holds when it is asked
// for an update check.
type settingsRecordingInstaller struct {
	mockCheckUpdateInstaller
	mu            sync.Mutex
	github        installer.GitHubSettings
	cargo         installer.CargoSettings
	checkedGitHub []installer.GitHubSettings
	checkedCargo  []installer.CargoSettings
}

func (m *settingsRecordingInstaller) SetGitHubSettings(settings installer.GitHubSettings) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.github = settings
}

func (m *settingsRecordingInstaller) SetCargoSettings(settings installer.CargoSettings) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cargo = settings
}

func (m *settingsRecordingInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	m.mu.Lock()
	m.checkedGitHub = append(m.checkedGitHub, m.github)
	m.checkedCargo = append(m.checkedCargo, m.cargo)
	m.mu.Unlock()
	return m.mockCheckUpdateInstaller.CheckUpdate(ctx, tool)
}

// TestDashboard_CheckUpdateAppliesProjectSettings pins that the dashboard's update
// check reaches the installer configured by the project, as tool check and tool update
// do: the github and cargo sections are in place when CheckUpdate runs, so a cargo
// tool is checked against the configured crates.io host with the configured
// User-Agent and token.
func TestDashboard_CheckUpdateAppliesProjectSettings(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	sqlDB, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	// The global registry has no way to remove an installer, so every run registers one
	// under a name of its own (-count=N reruns the test in the same process).
	name := fmt.Sprintf("mock-settings-recording-inst-%d", settingsRecordingRuns.Add(1))
	inst := &settingsRecordingInstaller{mockCheckUpdateInstaller: mockCheckUpdateInstaller{name: name, latestVersion: "2.0.0"}}
	if err := installer.Register(inst); err != nil {
		t.Fatalf("registering mock installer: %v", err)
	}

	projCfg := &config.ProjectConfig{
		Paths:  config.PathsConfig{ToolConfigsDir: t.TempDir(), GeneratedDir: "/gen"},
		Github: config.HostConfig{Host: "https://ghe.example/api/v3", Token: "github-secret"},
		Cargo: config.CargoConfig{
			CratesIo:  config.HostConfig{Host: "https://crates.mirror.example", Token: "crates-secret"},
			UserAgent: "my-bot",
		},
	}
	toolConfigs := []*config.ToolConfig{{Name: "mycrate", InstallationMethod: inst.name}}
	server := NewServer(log, "127.0.0.1", 0, registry.NewRegistry(sqlDB), testFS(), "", projCfg, toolConfigs, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("starting server: %v", err)
	}
	defer server.Stop()

	resp, err := http.Post(fmt.Sprintf("http://127.0.0.1:%d/api/tools/mycrate/check-update", server.Port()), "application/json", nil)
	if err != nil {
		t.Fatalf("POST check-update: %v", err)
	}
	resp.Body.Close()

	inst.mu.Lock()
	defer inst.mu.Unlock()
	if inst.calls.Load() != 1 {
		t.Fatalf("CheckUpdate ran %d time(s), want 1", inst.calls.Load())
	}
	wantCargo := installer.NewCargoSettings(projCfg)
	if len(inst.checkedCargo) != 1 || inst.checkedCargo[0] != wantCargo {
		t.Errorf("cargo settings at check time = %+v, want %+v", inst.checkedCargo, wantCargo)
	}
	if len(inst.checkedGitHub) != 1 || inst.checkedGitHub[0].Host != projCfg.Github.Host || inst.checkedGitHub[0].Token != projCfg.Github.Token {
		t.Errorf("github settings at check time = %+v, want the project's github section", inst.checkedGitHub)
	}
}
