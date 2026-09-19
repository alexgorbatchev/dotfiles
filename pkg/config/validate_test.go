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
		if !strings.Contains(err.Error(), "valid properties: cargo, downloader, features, github, paths, platform, system") {
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
				name:     "logging.badProp error (rejected top-level property)",
				json:     `{ "logging": { "badProp": true } }`,
				expected: `unknown top-level property "logging" (valid properties: cargo, downloader, features, github, paths, platform, system)`,
			},
			{
				name:     "updates.badProp error (rejected top-level property)",
				json:     `{ "updates": { "badProp": true } }`,
				expected: `unknown top-level property "updates" (valid properties: cargo, downloader, features, github, paths, platform, system)`,
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

// The platform list mirrors the v1 schema: every override names at least one matcher,
// a matcher names an os and/or an arch from the fixed vocabularies, and the override
// config may set any of the base sections but not nest another platform list.
func TestValidateProjectConfigPlatformOverrides(t *testing.T) {
	t.Run("valid overrides pass", func(t *testing.T) {
		validJSON := []byte(`{
			"paths": { "targetDir": "/usr/local/bin" },
			"platform": [
				{
					"match": [{ "os": "macos", "arch": "arm64" }],
					"config": { "paths": { "targetDir": "/opt/homebrew/bin" } }
				},
				{
					"match": [{ "os": "linux" }, { "arch": "x86_64" }],
					"config": {
						"paths": { "dotfilesDir": "/dots" },
						"system": { "sudoPrompt": "sudo:" },
						"github": { "cache": { "enabled": false } },
						"cargo": { "cratesIo": { "host": "https://crates.io" } },
						"downloader": { "cache": { "ttl": 1 } },
						"features": { "shellInstall": { "bash": "~/.bashrc" } }
					}
				},
				{
					"match": [{ "os": "windows" }],
					"config": {}
				}
			]
		}`)
		if err := ValidateProjectConfigRawJSON(validJSON); err != nil {
			t.Fatalf("expected valid platform overrides to pass, got: %v", err)
		}
	})

	tests := []struct {
		name     string
		json     string
		expected string
	}{
		{
			name:     "platform must be an array",
			json:     `{ "platform": { "match": [{ "os": "macos" }], "config": {} } }`,
			expected: `property "platform" must be an array of platform overrides`,
		},
		{
			name:     "override must be an object",
			json:     `{ "platform": ["macos"] }`,
			expected: `property "platform[0]" must be an object with "match" and "config"`,
		},
		{
			name:     "override unknown key",
			json:     `{ "platform": [{ "match": [{ "os": "macos" }], "config": {}, "when": true }] }`,
			expected: `unknown property "platform[0].when" (valid properties under 'platform[0]': config, match)`,
		},
		{
			name:     "override misspelled key suggestion",
			json:     `{ "platform": [{ "matches": [{ "os": "macos" }], "config": {} }] }`,
			expected: `unknown property "platform[0].matches" (did you mean "platform[0].match"?)`,
		},
		{
			name:     "match is required",
			json:     `{ "platform": [{ "config": {} }] }`,
			expected: `property "platform[0].match" must be a non-empty array of matchers`,
		},
		{
			name:     "match must not be empty",
			json:     `{ "platform": [{ "match": [], "config": {} }] }`,
			expected: `property "platform[0].match" must be a non-empty array of matchers`,
		},
		{
			name:     "matcher must be an object",
			json:     `{ "platform": [{ "match": ["macos"], "config": {} }] }`,
			expected: `property "platform[0].match[0]" must be an object with "os" and/or "arch"`,
		},
		{
			name:     "matcher unknown key",
			json:     `{ "platform": [{ "match": [{ "platform": "darwin", "arch": "arm64" }], "config": {} }] }`,
			expected: `unknown property "platform[0].match[0].platform" (valid properties under 'platform[0].match[0]': arch, os)`,
		},
		{
			name:     "matcher needs os or arch",
			json:     `{ "platform": [{ "match": [{}], "config": {} }] }`,
			expected: `property "platform[0].match[0]" must name at least one of "os" and "arch"`,
		},
		{
			name:     "matcher os vocabulary",
			json:     `{ "platform": [{ "match": [{ "os": "darwin" }], "config": {} }] }`,
			expected: `property "platform[0].match[0].os" must be one of "linux", "macos", "windows", got "darwin"`,
		},
		{
			name:     "matcher os must be a string",
			json:     `{ "platform": [{ "match": [{ "os": 2 }], "config": {} }] }`,
			expected: `property "platform[0].match[0].os" must be one of "linux", "macos", "windows", got 2`,
		},
		{
			name:     "matcher arch vocabulary",
			json:     `{ "platform": [{ "match": [{ "arch": "amd64" }], "config": {} }] }`,
			expected: `property "platform[0].match[0].arch" must be one of "arm64", "x86_64", got "amd64"`,
		},
		{
			name:     "config is required",
			json:     `{ "platform": [{ "match": [{ "os": "macos" }] }] }`,
			expected: `property "platform[0].config" must be an object of configuration sections`,
		},
		{
			name:     "config must be an object",
			json:     `{ "platform": [{ "match": [{ "os": "macos" }], "config": [] }] }`,
			expected: `property "platform[0].config" must be an object of configuration sections`,
		},
		{
			name:     "config sections are validated",
			json:     `{ "platform": [{ "match": [{ "os": "macos" }], "config": { "paths": { "targetDire": "/x" } } }] }`,
			expected: `unknown property "platform[0].config.paths.targetDire" (did you mean "platform[0].config.paths.targetDir"?)`,
		},
		{
			name:     "config cannot nest another platform list",
			json:     `{ "platform": [{ "match": [{ "os": "macos" }], "config": { "platform": [] } }] }`,
			expected: `unknown property "platform[0].config.platform" (valid properties under 'platform[0].config': cargo, downloader, features, github, paths, system)`,
		},
		{
			name:     "second override is reported with its index",
			json:     `{ "platform": [{ "match": [{ "os": "macos" }], "config": {} }, { "match": [{ "os": "macos" }, { "arch": "arm65" }], "config": {} }] }`,
			expected: `property "platform[1].match[1].arch" must be one of "arm64", "x86_64", got "arm65"`,
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

	t.Run("loader result validates the project platform list too", func(t *testing.T) {
		err := ValidateLoaderResultRawJSON([]byte(`{
			"projectConfig": { "platform": [{ "match": [{ "os": "darwin" }], "config": {} }] },
			"toolConfigs": {}
		}`))
		if err == nil {
			t.Fatal("expected the loader result validation to reject the matcher, got nil")
		}
		expected := `property "platform[0].match[0].os" must be one of "linux", "macos", "windows", got "darwin"`
		if err.Error() != expected {
			t.Errorf("expected %q, got %q", expected, err.Error())
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
