package orchestrator

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

type cacheSpyInstaller struct {
	name     string
	settings downloader.Settings
}

func (c *cacheSpyInstaller) Name() string       { return c.name }
func (c *cacheSpyInstaller) SupportsSudo() bool { return false }
func (c *cacheSpyInstaller) SetDownloadSettings(settings downloader.Settings) {
	c.settings = settings
}
func (c *cacheSpyInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{
		Binaries: []string{"spybin"},
	}, nil
}
func (c *cacheSpyInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	return nil
}
func (c *cacheSpyInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{}, nil
}

func TestInstallTool_StagingDirectoryAndPersistentDownloadCache(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()
	reg := registry.NewRegistry(database)

	instReg := installer.NewRegistry()
	spy := &cacheSpyInstaller{name: "spy-installer"}
	_ = instReg.Register(spy)

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
		Downloader: config.DownloaderConfig{
			Timeout:    120000, // 2 minutes in ms
			RetryCount: 5,
			RetryDelay: 2500, // ms
			Cache: config.CacheConfig{
				TTL: 86400000, // 1 day in ms
			},
		},
	}

	tool := &config.ToolConfig{
		Name:               "spy-tool",
		InstallationMethod: "spy-installer",
		Binaries:           testutil.DeclaredBinaries("spybin"),
	}

	err = orch.InstallTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	expectedCacheDir := "/home/test/.generated/cache/downloads"
	if spy.settings.CacheDir != expectedCacheDir {
		t.Errorf("expected CacheDir %q, got %q", expectedCacheDir, spy.settings.CacheDir)
	}
	if spy.settings.CacheTTL != 24*time.Hour {
		t.Errorf("expected CacheTTL 24h, got %v", spy.settings.CacheTTL)
	}
	if !spy.settings.CacheEnabled {
		t.Errorf("expected CacheEnabled true, got %v", spy.settings.CacheEnabled)
	}
	if spy.settings.Timeout != 2*time.Minute {
		t.Errorf("expected Timeout 2m, got %v", spy.settings.Timeout)
	}
	if spy.settings.RetryCount != 5 {
		t.Errorf("expected RetryCount 5, got %d", spy.settings.RetryCount)
	}
	if spy.settings.RetryDelay != 2500*time.Millisecond {
		t.Errorf("expected RetryDelay 2.5s, got %v", spy.settings.RetryDelay)
	}
}

// cargoSettingsSpyInstaller records the cargo settings the install pipeline applies.
type cargoSettingsSpyInstaller struct {
	cacheSpyInstaller
	cargo []installer.CargoSettings
}

func (c *cargoSettingsSpyInstaller) SetCargoSettings(settings installer.CargoSettings) {
	c.cargo = append(c.cargo, settings)
}

// TestInstallTool_AppliesCargoSettings pins that the install pipeline hands every
// installer the project's cargo section, as it does the github section, so a cargo
// install reaches the configured hosts with the configured User-Agent and tokens.
func TestInstallTool_AppliesCargoSettings(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	instReg := installer.NewRegistry()
	spy := &cargoSettingsSpyInstaller{cacheSpyInstaller: cacheSpyInstaller{name: "cargo-spy-installer"}}
	_ = instReg.Register(spy)
	orch := NewOrchestrator(log, newMemFS(), exec.NewMockRunner(), registry.NewRegistry(database), instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
		Cargo: config.CargoConfig{
			CratesIo:      config.CargoHostConfig{Host: "https://crates.mirror.example", Token: "crates-secret"},
			GithubRelease: config.CargoReleaseHostConfig{Host: "https://ghe.example", Token: "release-secret"},
			UserAgent:     "my-bot",
		},
	}
	tool := &config.ToolConfig{Name: "spy-tool", InstallationMethod: spy.name, Binaries: testutil.DeclaredBinaries("spybin")}
	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	want := installer.NewCargoSettings(projCfg)
	if len(spy.cargo) != 1 || spy.cargo[0] != want {
		t.Fatalf("cargo settings applied = %+v, want exactly %+v", spy.cargo, want)
	}
}

type gitHubSettingsSpyInstaller struct {
	cacheSpyInstaller
	github []installer.GitHubSettings
}

func (g *gitHubSettingsSpyInstaller) SetGitHubSettings(settings installer.GitHubSettings) {
	g.github = append(g.github, settings)
}

// TestInstallTool_AppliesGitHubSettings pins that the install pipeline hands every
// installer the project's github section via NewGitHubSettings, including its cache
// directory and TTL.
func TestInstallTool_AppliesGitHubSettings(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	instReg := installer.NewRegistry()
	spy := &gitHubSettingsSpyInstaller{cacheSpyInstaller: cacheSpyInstaller{name: "github-spy-installer"}}
	_ = instReg.Register(spy)
	orch := NewOrchestrator(log, newMemFS(), exec.NewMockRunner(), registry.NewRegistry(database), instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
		Github: config.HostConfig{
			Host:  "https://ghe.example/api/v3",
			Token: "github-secret",
			Cache: config.CacheConfig{TTL: 3600000},
		},
	}
	tool := &config.ToolConfig{Name: "spy-tool", InstallationMethod: spy.name, Binaries: testutil.DeclaredBinaries("spybin")}
	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	want := installer.NewGitHubSettings(projCfg)
	if len(spy.github) != 1 || spy.github[0] != want {
		t.Fatalf("github settings applied = %+v, want exactly %+v", spy.github, want)
	}
}

// TestDownloadSettingsFromProjectConfig pins how the `downloader` section of a
// project configuration becomes the policy installers download under, including the
// values a configuration that says nothing gets.
func TestDownloadSettingsFromProjectConfig(t *testing.T) {
	t.Parallel()
	disabled := false

	tests := []struct {
		name string
		cfg  config.DownloaderConfig
		want downloader.Settings
	}{
		{
			name: "section left out",
			want: downloader.Settings{
				CacheDir:     filepath.Join("/gen", "cache", "downloads"),
				CacheTTL:     30 * 24 * time.Hour,
				CacheEnabled: true,
			},
		},
		{
			name: "every key set",
			cfg: config.DownloaderConfig{
				Timeout:    300000,
				RetryCount: 3,
				RetryDelay: 1000,
				Cache:      config.CacheConfig{TTL: 3600000, Enabled: &disabled},
			},
			want: downloader.Settings{
				CacheDir:     filepath.Join("/gen", "cache", "downloads"),
				CacheTTL:     time.Hour,
				CacheEnabled: false,
				Timeout:      5 * time.Minute,
				RetryCount:   3,
				RetryDelay:   time.Second,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			projCfg := &config.ProjectConfig{
				Paths:      config.PathsConfig{GeneratedDir: "/gen"},
				Downloader: tt.cfg,
			}
			if got := downloadSettings(projCfg); got != tt.want {
				t.Errorf("downloadSettings() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
