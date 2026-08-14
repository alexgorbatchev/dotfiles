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
