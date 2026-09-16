package config

import (
	"strings"
	"testing"
)

func TestValidateProjectConfigRawJSON(t *testing.T) {
	t.Run("valid project config", func(t *testing.T) {
		validJSON := []byte(`{
			"paths": {
				"dotfilesDir": "/home/user/.dotfiles",
				"homeDir": "/home/user",
				"targetDir": "/home/user/bin"
			},
			"features": {
				"shellInstall": {
					"zsh": "~/.zshrc"
				},
				"catalog": {
					"generate": true,
					"filePath": "./CATALOG.md"
				}
			},
			"system": {
				"sudoPrompt": "[sudo] password: "
			},
			"logging": {
				"debug": "verbose"
			},
			"updates": {
				"checkOnRun": true,
				"checkInterval": 86400
			},
			"github": {
				"host": "https://api.github.com",
				"cache": {
					"enabled": true,
					"ttl": 3600
				}
			},
			"cargo": {
				"cratesIo": {
					"host": "https://crates.io"
				}
			},
			"downloader": {
				"timeout": 30,
				"retryCount": 3,
				"retryDelay": 2,
				"cache": {
					"enabled": true,
					"ttl": 7200
				}
			}
		}`)

		err := ValidateProjectConfigRawJSON(validJSON)
		if err != nil {
			t.Fatalf("expected valid config to pass, got: %v", err)
		}
	})

	t.Run("nested features.features error", func(t *testing.T) {
		invalidJSON := []byte(`{
			"paths": { "dotfilesDir": "/home/user/.dotfiles" },
			"features": {
				"features": {
					"shellInstall": { "zsh": "~/.zshrc" }
				}
			}
		}`)

		err := ValidateProjectConfigRawJSON(invalidJSON)
		if err == nil {
			t.Fatal("expected error for features.features, got nil")
		}
		expected := `unknown property "features.features" (valid properties under 'features': catalog, shellInstall)`
		if err.Error() != expected {
			t.Errorf("expected %q, got %q", expected, err.Error())
		}
	})

	t.Run("did you mean suggestion for misspelled property", func(t *testing.T) {
		invalidJSON := []byte(`{
			"features": {
				"shelInstall": { "zsh": "~/.zshrc" }
			}
		}`)

		err := ValidateProjectConfigRawJSON(invalidJSON)
		if err == nil {
			t.Fatal("expected error for shelInstall, got nil")
		}
		expected := `unknown property "features.shelInstall" (did you mean "features.shellInstall"?)`
		if err.Error() != expected {
			t.Errorf("expected %q, got %q", expected, err.Error())
		}
	})

	t.Run("top-level unknown property with suggestion", func(t *testing.T) {
		invalidJSON := []byte(`{
			"featurs": {}
		}`)

		err := ValidateProjectConfigRawJSON(invalidJSON)
		if err == nil {
			t.Fatal("expected error for featurs, got nil")
		}
		expected := `unknown property "featurs" (did you mean "features"?)`
		if err.Error() != expected {
			t.Errorf("expected %q, got %q", expected, err.Error())
		}
	})

	t.Run("top-level unknown property without suggestion lists valid properties", func(t *testing.T) {
		invalidJSON := []byte(`{
			"completelyUnknownProperty": {}
		}`)

		err := ValidateProjectConfigRawJSON(invalidJSON)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), `unknown top-level property "completelyUnknownProperty"`) {
			t.Errorf("unexpected error message: %v", err)
		}
		if !strings.Contains(err.Error(), "valid properties: cargo, downloader, features, github, logging, paths, system, updates") {
			t.Errorf("unexpected allowed list: %v", err)
		}
	})

	t.Run("nested sub-object property errors", func(t *testing.T) {
		tests := []struct {
			name     string
			json     string
			expected string
		}{
			{
				name:     "paths.homeDire suggestion",
				json:     `{ "paths": { "homeDire": "/home" } }`,
				expected: `unknown property "paths.homeDire" (did you mean "paths.homeDir"?)`,
			},
			{
				name:     "system.badProp error",
				json:     `{ "system": { "badProp": true } }`,
				expected: `unknown property "system.badProp" (valid properties under 'system': sudoPrompt)`,
			},
			{
				name:     "logging.badProp error",
				json:     `{ "logging": { "badProp": true } }`,
				expected: `unknown property "logging.badProp" (valid properties under 'logging': debug)`,
			},
			{
				name:     "updates.badProp error",
				json:     `{ "updates": { "badProp": true } }`,
				expected: `unknown property "updates.badProp" (valid properties under 'updates': checkInterval, checkOnRun)`,
			},
			{
				name:     "github.badProp error",
				json:     `{ "github": { "badProp": true } }`,
				expected: `unknown property "github.badProp" (valid properties under 'github': cache, host, token, userAgent)`,
			},
			{
				name:     "github.cache.badProp error",
				json:     `{ "github": { "cache": { "badProp": true } } }`,
				expected: `unknown property "github.cache.badProp" (valid properties under 'github.cache': enabled, ttl)`,
			},
			{
				name:     "cargo.badProp error",
				json:     `{ "cargo": { "badProp": true } }`,
				expected: `unknown property "cargo.badProp" (valid properties under 'cargo': cratesIo, githubRaw, githubRelease, userAgent)`,
			},
			{
				name:     "cargo.cratesIo.badProp error",
				json:     `{ "cargo": { "cratesIo": { "badProp": true } } }`,
				expected: `unknown property "cargo.cratesIo.badProp" (valid properties under 'cargo.cratesIo': cache, host, token, userAgent)`,
			},
			{
				name:     "downloader.badProp error",
				json:     `{ "downloader": { "badProp": true } }`,
				expected: `unknown property "downloader.badProp" (valid properties under 'downloader': cache, retryCount, retryDelay, timeout)`,
			},
			{
				name:     "downloader.cache.badProp error",
				json:     `{ "downloader": { "cache": { "badProp": true } } }`,
				expected: `unknown property "downloader.cache.badProp" (valid properties under 'downloader.cache': enabled, ttl)`,
			},
			{
				name:     "features.catalog.filPath suggestion",
				json:     `{ "features": { "catalog": { "filPath": "./CATALOG.md" } } }`,
				expected: `unknown property "features.catalog.filPath" (did you mean "features.catalog.filePath"?)`,
			},
			{
				name:     "features.shellInstall.fish error",
				json:     `{ "features": { "shellInstall": { "fish": "~/.config/fish/config.fish" } } }`,
				expected: `unknown property "features.shellInstall.fish" (valid properties under 'features.shellInstall': bash, powershell, zsh)`,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateProjectConfigRawJSON([]byte(tt.json))
				if err == nil {
					t.Fatalf("expected error for %s, got nil", tt.name)
				}
				if err.Error() != tt.expected {
					t.Errorf("expected %q, got %q", tt.expected, err.Error())
				}
			})
		}
	})

	t.Run("invalid JSON syntax", func(t *testing.T) {
		err := ValidateProjectConfigRawJSON([]byte(`{ invalid `))
		if err == nil {
			t.Fatal("expected JSON syntax error, got nil")
		}
	})
}

func TestValidateLoaderResultRawJSON(t *testing.T) {
	t.Run("valid loader result", func(t *testing.T) {
		validJSON := []byte(`{
			"projectConfig": {
				"paths": { "dotfilesDir": "/home/user/.dotfiles" }
			},
			"toolConfigs": {
				"bat": {
					"name": "bat",
					"version": "1.0.0",
					"installationMethod": "github-release",
					"installParams": { "repo": "sharkdp/bat" },
					"symlinks": [{ "source": "s", "target": "t" }],
					"copies": [{ "source": "s", "target": "t" }],
					"updateCheck": { "enabled": true, "constraint": "^1.0.0" },
					"shellConfigs": {
						"zsh": {
							"aliases": { "b": "bat" }
						}
					}
				}
			}
		}`)

		err := ValidateLoaderResultRawJSON(validJSON)
		if err != nil {
			t.Fatalf("expected valid loader result to pass, got: %v", err)
		}
	})

	t.Run("unknown tool property error", func(t *testing.T) {
		invalidJSON := []byte(`{
			"projectConfig": { "paths": { "dotfilesDir": "/home/user" } },
			"toolConfigs": {
				"bat": {
					"name": "bat",
					"invalidToolProp": true
				}
			}
		}`)

		err := ValidateLoaderResultRawJSON(invalidJSON)
		if err == nil {
			t.Fatal("expected error for invalidToolProp, got nil")
		}
		if !strings.Contains(err.Error(), `unknown property "tool \"bat\".invalidToolProp"`) {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("unknown root property in loader result", func(t *testing.T) {
		invalidJSON := []byte(`{
			"projectConfig": {},
			"extraRoot": {}
		}`)

		err := ValidateLoaderResultRawJSON(invalidJSON)
		if err == nil {
			t.Fatal("expected error for extraRoot, got nil")
		}
		if !strings.Contains(err.Error(), `unknown top-level property "extraRoot"`) {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}
