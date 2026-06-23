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
