package dashboard

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// settingsRecordingInstaller records the project settings the dashboard applies to it
// before asking it anything.
type settingsRecordingInstaller struct {
	mockCheckUpdateInstaller
	mu     sync.Mutex
	github []installer.GitHubSettings
	cargo  []installer.CargoSettings
}

func (m *settingsRecordingInstaller) SetGitHubSettings(settings installer.GitHubSettings) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.github = append(m.github, settings)
}

func (m *settingsRecordingInstaller) SetCargoSettings(settings installer.CargoSettings) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cargo = append(m.cargo, settings)
}

// TestDashboard_CheckUpdateAppliesProjectSettings pins that the dashboard's update
// check reaches the installer configured by the project, as tool check and tool update
// do: the github and cargo sections are applied before CheckUpdate runs, so a cargo
// tool is checked against the configured crates.io host with the configured
// User-Agent and token.
func TestDashboard_CheckUpdateAppliesProjectSettings(t *testing.T) {
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	sqlDB, err := db.NewConnection(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()

	inst := &settingsRecordingInstaller{mockCheckUpdateInstaller: mockCheckUpdateInstaller{name: "mock-settings-recording-inst", latestVersion: "2.0.0"}}
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
	if len(inst.cargo) != 1 || inst.cargo[0] != wantCargo {
		t.Errorf("cargo settings applied = %+v, want exactly %+v", inst.cargo, wantCargo)
	}
	if len(inst.github) != 1 || inst.github[0].Host != projCfg.Github.Host || inst.github[0].Token != projCfg.Github.Token {
		t.Errorf("github settings applied = %+v, want the project's github section", inst.github)
	}
}
