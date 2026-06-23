package config

import (
	"testing"
)

func TestProjectConfigInstantiation(t *testing.T) {
	// Simple test to instantiate ProjectConfig and eliminate the [no test files] warning from go test.
	// This also serves to verify that all nested structures are valid Go types.
	cfg := ProjectConfig{
		Paths: PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  "/home/user/dotfiles",
			TargetDir:    "/home/user/.bin",
			GeneratedDir: "/home/user/dotfiles/.generated",
		},
		System: SystemConfig{
			SudoPrompt: "Password:",
		},
		Logging: LoggingConfig{
			Debug: "all",
		},
		Updates: UpdatesConfig{
			CheckOnRun:    true,
			CheckInterval: 86400,
		},
		Github: HostConfig{
			Host: "https://api.github.com",
			Cache: CacheConfig{
				Enabled: true,
				TTL:     3600,
			},
			Token:     "test-token",
			UserAgent: "test-agent",
		},
		Cargo: CargoConfig{
			CratesIo: HostConfig{
				Host: "https://crates.io",
			},
			GithubRaw: HostConfig{
				Host: "https://raw.githubusercontent.com",
			},
			GithubRelease: HostConfig{
				Host: "https://github.com",
			},
			UserAgent: "cargo-agent",
		},
		Downloader: DownloaderConfig{
			Timeout:    30000,
			RetryCount: 3,
			RetryDelay: 1000,
			Cache: CacheConfig{
				Enabled: true,
				TTL:     86400,
			},
		},
		Features: FeaturesConfig{
			Catalog: CatalogConfig{
				Generate: true,
				FilePath: "/home/user/dotfiles/CATALOG.md",
			},
			ShellInstall: &ShellInstallConfig{
				Zsh:  "/home/user/.zshrc",
				Bash: "/home/user/.bashrc",
			},
		},
	}

	if cfg.Paths.HomeDir != "/home/user" {
		t.Errorf("expected HomeDir to be /home/user, got %q", cfg.Paths.HomeDir)
	}

	if cfg.Features.ShellInstall.Zsh != "/home/user/.zshrc" {
		t.Errorf("expected Zsh path to match")
	}
}
