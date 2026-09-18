package config

import (
	"strings"
	"testing"
)

func TestResolvePlaceholders(t *testing.T) {
	projCfg := &ProjectConfig{
		Paths: PathsConfig{
			HomeDir:        "/home/user",
			DotfilesDir:    "/home/user/dotfiles",
			TargetDir:      "/home/user/.bin",
			BinariesDir:    "/home/user/.binaries",
			GeneratedDir:   "/home/user/.generated",
			ToolConfigsDir: "/home/user/tools",
		},
	}

	t.Run("nil ProjectConfig", func(t *testing.T) {
		got, err := ResolvePlaceholders("{homeDir}/path", "fzf", nil)
		if err != nil || got != "{homeDir}/path" {
			t.Errorf("expected original string without error when projCfg is nil, got %q, err=%v", got, err)
		}
	})

	t.Run("basic replacements", func(t *testing.T) {
		input := "{paths.homeDir}/.config/{tool.name}"
		want := "/home/user/.config/fzf"
		got, err := ResolvePlaceholders(input, "fzf", projCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != want {
			t.Errorf("ResolvePlaceholders(%q) = %q, want %q", input, got, want)
		}
	})

	t.Run("escaped dollar token", func(t *testing.T) {
		input := "${HOME}/.bin/{toolName}"
		want := "${HOME}/.bin/ripgrep"
		got, err := ResolvePlaceholders(input, "ripgrep", projCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != want {
			t.Errorf("ResolvePlaceholders(%q) = %q, want %q", input, got, want)
		}
	})

	t.Run("unresolved unknown token", func(t *testing.T) {
		input := "/path/to/{unknownToken}"
		want := "/path/to/{unknownToken}"
		got, err := ResolvePlaceholders(input, "bat", projCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != want {
			t.Errorf("ResolvePlaceholders(%q) = %q, want %q", input, got, want)
		}
	})

	t.Run("default shellScriptsDir fallback", func(t *testing.T) {
		projNoScripts := *projCfg
		projNoScripts.Paths.ShellScriptsDir = ""
		got, err := ResolvePlaceholders("{paths.shellScriptsDir}/main.zsh", "bat", &projNoScripts)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "/home/user/.generated/shell-scripts/main.zsh"
		if got != want {
			t.Errorf("ResolvePlaceholders() = %q, want %q", got, want)
		}
	})

	t.Run("cycle detection error", func(t *testing.T) {
		projCfgCycle := *projCfg
		projCfgCycle.Paths.HomeDir = "{paths.dotfilesDir}/sub"
		projCfgCycle.Paths.DotfilesDir = "{paths.homeDir}/dot"

		_, err := ResolvePlaceholders("{paths.homeDir}", "bat", &projCfgCycle)
		if err == nil {
			t.Fatal("expected cycle detection error, got nil")
		}
		if !strings.Contains(err.Error(), "substitution did not converge") {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}

func TestResolvePathPlaceholders(t *testing.T) {
	projCfg := &ProjectConfig{
		Paths: PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  "/home/user/dotfiles",
			TargetDir:    "/home/user/.bin",
			BinariesDir:  "/home/user/.binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	// A paths block whose settings reference each other never resolves, which is what
	// makes ResolvePlaceholders itself fail rather than leave a token behind.
	cyclicCfg := *projCfg
	cyclicCfg.Paths.HomeDir = "{paths.dotfilesDir}/sub"
	cyclicCfg.Paths.DotfilesDir = "{paths.homeDir}/dot"

	tests := []struct {
		name     string
		projCfg  *ProjectConfig
		input    string
		want     string
		wantErrs []string
	}{
		{
			name:  "a path with no placeholder is used as written",
			input: "/etc/config",
			want:  "/etc/config",
		},
		{
			name:  "known placeholders are substituted",
			input: "{paths.homeDir}/.config/{tool.name}",
			want:  "/home/user/.config/bat",
		},
		{
			name:  "a shell expansion is not a placeholder",
			input: "${HOME}/.config/bat",
			want:  "${HOME}/.config/bat",
		},
		{
			// {configFileDir} names a real setting of the paths block, which is the
			// realistic way a placeholder this resolver does not know reaches a path.
			name:     "a placeholder nothing can fill is reported",
			input:    "{configFileDir}/bat.conf",
			wantErrs: []string{"unknown placeholder", "{configFileDir}"},
		},
		{
			name:     "a cycle is reported as ResolvePlaceholders reports it",
			projCfg:  &cyclicCfg,
			input:    "{paths.homeDir}",
			wantErrs: []string{"substitution did not converge"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := tt.projCfg
			if cfg == nil {
				cfg = projCfg
			}

			got, err := ResolvePathPlaceholders(tt.input, "bat", cfg)
			if len(tt.wantErrs) == 0 {
				if err != nil {
					t.Fatalf("ResolvePathPlaceholders(%q) = %v, want no error", tt.input, err)
				}
				if got != tt.want {
					t.Fatalf("ResolvePathPlaceholders(%q) = %q, want %q", tt.input, got, tt.want)
				}
				return
			}

			if err == nil {
				t.Fatalf("ResolvePathPlaceholders(%q) = %q, want an error", tt.input, got)
			}
			for _, want := range tt.wantErrs {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("ResolvePathPlaceholders(%q) = %v, want it to mention %q", tt.input, err, want)
				}
			}
			if got != "" {
				t.Errorf("ResolvePathPlaceholders(%q) = %q alongside its error, want the zero value", tt.input, got)
			}
		})
	}
}
