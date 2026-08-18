package config

import (
	"strings"
	"testing"
)

func TestProjectConfigInstantiationAndValidation(t *testing.T) {
	pc := ProjectConfig{
		Paths: PathsConfig{
			HomeDir:     "/home/user",
			DotfilesDir: "/home/user/dotfiles",
			TargetDir:   "/home/user/.bin",
		},
	}

	t.Run("Valid ProjectConfig", func(t *testing.T) {
		if err := pc.Validate(); err != nil {
			t.Errorf("expected no validation error, got %v", err)
		}
	})

	t.Run("Missing HomeDir", func(t *testing.T) {
		invalid := pc
		invalid.Paths.HomeDir = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "homeDir is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Missing DotfilesDir", func(t *testing.T) {
		invalid := pc
		invalid.Paths.DotfilesDir = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "dotfilesDir is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Missing TargetDir", func(t *testing.T) {
		invalid := pc
		invalid.Paths.TargetDir = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "targetDir is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}

func TestToolConfigValidation(t *testing.T) {
	tc := ToolConfig{
		Name: "bat",
	}

	t.Run("Valid Minimal ToolConfig", func(t *testing.T) {
		if err := tc.Validate(); err != nil {
			t.Errorf("expected no validation error, got %v", err)
		}
	})

	t.Run("Missing Name", func(t *testing.T) {
		invalid := tc
		invalid.Name = ""
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "name is required") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid SymlinkConfig (Empty Source)", func(t *testing.T) {
		invalid := tc
		invalid.Symlinks = []SymlinkConfig{
			{Source: "", Target: "target"},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "source path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid SymlinkConfig (Empty Target)", func(t *testing.T) {
		invalid := tc
		invalid.Symlinks = []SymlinkConfig{
			{Source: "source", Target: ""},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "target path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid CopyConfig (Empty Source)", func(t *testing.T) {
		invalid := tc
		invalid.Copies = []CopyConfig{
			{Source: "", Target: "target"},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "source path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid CopyConfig (Empty Target)", func(t *testing.T) {
		invalid := tc
		invalid.Copies = []CopyConfig{
			{Source: "source", Target: ""},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "target path cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid ShellScript (Invalid Kind)", func(t *testing.T) {
		invalid := tc
		invalid.ShellConfigs = &ShellConfigs{
			Zsh: &ShellTypeConfig{
				Scripts: []ShellScript{
					{Kind: "invalid-kind", Value: "echo hello"},
				},
			},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "must be 'once' or 'always'") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid ShellScript (Empty Value)", func(t *testing.T) {
		invalid := tc
		invalid.ShellConfigs = &ShellConfigs{
			Bash: &ShellTypeConfig{
				Scripts: []ShellScript{
					{Kind: "always", Value: ""},
				},
			},
		}
		err := invalid.Validate()
		if err == nil {
			t.Error("expected validation error, got nil")
		} else if !strings.Contains(err.Error(), "value cannot be empty") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Invalid BinaryConfig (Empty Name)", func(t *testing.T) {
		bc := BinaryConfig{Name: "", Pattern: "pat"}
		if err := bc.Validate(); err == nil {
			t.Error("expected validation error, got nil")
		}
	})

	t.Run("Invalid BinaryConfig (Empty Pattern)", func(t *testing.T) {
		bc := BinaryConfig{Name: "bin", Pattern: ""}
		if err := bc.Validate(); err == nil {
			t.Error("expected validation error, got nil")
		}
	})
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func TestGetBinaryName(t *testing.T) {
	if got := getBinaryName("rg"); got != "rg" {
		t.Errorf("getBinaryName(\"rg\") = %q, want \"rg\"", got)
	}

	if got := getBinaryName(map[string]interface{}{"name": "bat"}); got != "bat" {
		t.Errorf("getBinaryName(map) = %q, want \"bat\"", got)
	}

	bc := BinaryConfig{Name: "fzf", Pattern: "fzf*"}
	if got := getBinaryName(bc); got != "fzf" {
		t.Errorf("getBinaryName(BinaryConfig) = %q, want \"fzf\"", got)
	}

	if got := getBinaryName(&bc); got != "fzf" {
		t.Errorf("getBinaryName(*BinaryConfig) = %q, want \"fzf\"", got)
	}

	var nilBc *BinaryConfig
	if got := getBinaryName(nilBc); got != "" {
		t.Errorf("getBinaryName(nil) = %q, want empty", got)
	}

	if got := getBinaryName(12345); got != "" {
		t.Errorf("getBinaryName(int) = %q, want empty", got)
	}
}

func TestToolConfigMerge(t *testing.T) {
	base := ToolConfig{
		Name:    "ripgrep",
		Version: strPtr("13.0.0"),
		Binaries: []interface{}{
			"rg",
		},
		ShellConfigs: &ShellConfigs{
			Zsh: &ShellTypeConfig{
				Aliases: map[string]string{"rgi": "rg -i"},
				Paths:   []interface{}{"/usr/local/bin"},
			},
		},
	}

	override := ToolConfig{
		Name:               "ripgrep-custom",
		Version:            strPtr("14.0.0"),
		ConfigFilePath:     "/etc/rg.conf",
		Disabled:           true,
		Hostname:           "my-host",
		Sudo:               true,
		InstallationMethod: "cargo",
		InstallParams:      map[string]interface{}{"crate": "ripgrep"},
		UpdateCheck:        &ToolConfigUpdateCheck{Enabled: boolPtr(true), Constraint: strPtr("latest")},
		Binaries: []interface{}{
			"rg",  // duplicate binary name, should be skipped
			"rga", // new binary name, should be appended
			map[string]interface{}{"invalid": "no_name"},
		},
		Dependencies: []string{"pcre"},
		Symlinks: []SymlinkConfig{
			{Source: "a", Target: "b"},
			{Source: "a", Target: "b"}, // duplicate
		},
		Copies: []CopyConfig{
			{Source: "c", Target: "d"},
			{Source: "c", Target: "d"}, // duplicate
		},
		ShellConfigs: &ShellConfigs{
			Zsh: &ShellTypeConfig{
				Aliases:         map[string]string{"rga": "rga -i"},
				Paths:           []interface{}{"/opt/bin"},
				Scripts:         []ShellScript{{Kind: "always", Value: "echo zsh"}},
				Env:             map[string]string{"RG_COLOR": "always"},
				Completions:     "complete/_rg",
				SourceFiles:     []string{"source1.zsh"},
				Sources:         []string{"source2.zsh"},
				SourceFunctions: []string{"fn.zsh"},
			},
			Bash: &ShellTypeConfig{
				Functions: map[string]string{"f": "echo bash"},
			},
			Powershell: &ShellTypeConfig{
				Sources: []string{"profile.ps1"},
			},
		},
	}

	rawOverride := map[string]interface{}{
		"name":               "ripgrep-custom",
		"version":            "14.0.0",
		"configFilePath":     "/etc/rg.conf",
		"disabled":           true,
		"hostname":           "my-host",
		"sudo":               true,
		"installationMethod": "cargo",
		"updateCheck":        map[string]interface{}{"enabled": true},
		"installParams":      map[string]interface{}{"crate": "ripgrep"},
		"binaries": []interface{}{
			"rg",
			"rga",
			map[string]interface{}{"invalid": "no_name"},
		},
	}

	base.Merge(&override, rawOverride)

	if base.Name != "ripgrep-custom" {
		t.Errorf("expected Name = ripgrep-custom, got %q", base.Name)
	}
	if base.Version == nil || *base.Version != "14.0.0" {
		t.Errorf("expected Version = 14.0.0, got %v", base.Version)
	}
	if base.ConfigFilePath != "/etc/rg.conf" || !base.Disabled || base.Hostname != "my-host" || !base.Sudo {
		t.Errorf("expected primitive fields merged")
	}
	if base.InstallationMethod != "cargo" {
		t.Errorf("expected InstallationMethod = cargo, got %q", base.InstallationMethod)
	}
	if len(base.Dependencies) != 1 || base.Dependencies[0] != "pcre" {
		t.Errorf("expected Dependencies merged")
	}
	if base.ShellConfigs.Zsh.Completions != "complete/_rg" {
		t.Errorf("expected Completions merged")
	}
	if len(base.ShellConfigs.Zsh.SourceFiles) != 1 || len(base.ShellConfigs.Zsh.Sources) != 1 || len(base.ShellConfigs.Zsh.SourceFunctions) != 1 {
		t.Errorf("expected SourceFiles/Sources/SourceFunctions merged")
	}
}

func TestValidateProjectAndShellConfigs(t *testing.T) {
	tcInvalid := &ShellTypeConfig{
		Scripts: []ShellScript{{Kind: "invalid", Value: "echo"}},
	}

	scZsh := ShellConfigs{Zsh: tcInvalid}
	if err := scZsh.Validate(); err == nil {
		t.Error("expected error for invalid Zsh config")
	}

	scBash := ShellConfigs{Bash: tcInvalid}
	if err := scBash.Validate(); err == nil {
		t.Error("expected error for invalid Bash config")
	}

	scPwsh := ShellConfigs{Powershell: tcInvalid}
	if err := scPwsh.Validate(); err == nil {
		t.Error("expected error for invalid Powershell config")
	}

	tc := ToolConfig{
		Name: "test",
		ShellConfigs: &ShellConfigs{
			Zsh: tcInvalid,
		},
	}
	if err := tc.Validate(); err == nil {
		t.Error("expected error for ToolConfig with invalid shell config")
	}
}

func TestFindTool(t *testing.T) {
	toolConfigs := []*ToolConfig{
		{
			Name: "github-release--bat",
			Binaries: []interface{}{
				"bat",
				&BinaryConfig{Name: "batcat", Pattern: "batcat"},
			},
		},
		{
			Name: "cargo--eza",
			Binaries: []interface{}{
				map[string]interface{}{"name": "eza"},
			},
			ShellConfigs: &ShellConfigs{
				Zsh: &ShellTypeConfig{
					Aliases: map[string]string{"la": "eza -la"},
				},
				Bash: &ShellTypeConfig{
					Functions: map[string]string{"ezafn": "eza $1"},
				},
			},
		},
	}

	tests := []struct {
		name      string
		query     string
		wantMatch string
	}{
		{"exact tool name", "github-release--bat", "github-release--bat"},
		{"tool name suffix", "bat", "github-release--bat"},
		{"binary string match", "batcat", "github-release--bat"},
		{"binary map match", "eza", "cargo--eza"},
		{"zsh alias match", "la", "cargo--eza"},
		{"bash function match", "ezafn", "cargo--eza"},
		{"empty query", "", ""},
		{"whitespace query", "   ", ""},
		{"not found query", "nonexistent", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FindTool(toolConfigs, tt.query)
			if tt.wantMatch == "" {
				if got != nil {
					t.Errorf("FindTool(%q) = %v; want nil", tt.query, got)
				}
			} else {
				if got == nil {
					t.Fatalf("FindTool(%q) = nil; want %q", tt.query, tt.wantMatch)
				}
				if got.Name != tt.wantMatch {
					t.Errorf("FindTool(%q).Name = %q; want %q", tt.query, got.Name, tt.wantMatch)
				}
			}
		})
	}
}

