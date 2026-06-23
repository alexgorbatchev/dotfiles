package venv

import (
	"bytes"
	_ "embed"
	"fmt"
	"path/filepath"
	"text/template"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

//go:embed source.tmpl
var sourceTemplateStr string

//go:embed source_ps1.tmpl
var ps1TemplateStr string

var (
	sourceTemplate = template.Must(template.New("source").Parse(sourceTemplateStr))
	ps1Template    = template.Must(template.New("source_ps1").Parse(ps1TemplateStr))
)

const (
	// EnvDirVar is the environment variable for dotfiles virtual environment directory.
	EnvDirVar = "DOTFILES_ENV_DIR"
	// EnvNameVar is the environment variable for dotfiles virtual environment name.
	EnvNameVar = "DOTFILES_ENV_NAME"
	// SourceFile is the activation script filename for POSIX shells.
	SourceFile = "source"
	// PowerShellFile is the activation script filename for PowerShell.
	PowerShellFile = "source.ps1"
	// ConfigFile is the default config filename.
	ConfigFile = "dotfiles.config.ts"
	// ToolsDirName is the directory containing tools.
	ToolsDirName = "tools"
)

// Manager handles creating, deleting, and validating virtual environment sandboxes.
type Manager struct {
	fs fs.FS
}

// NewManager creates a new Manager instance.
func NewManager(f fs.FS) *Manager {
	return &Manager{fs: f}
}

// EnvInfo holds information about a created virtual environment.
type EnvInfo struct {
	EnvDir  string
	EnvName string
}

type templateData struct {
	EnvDir  string
	EnvName string
}

// Create generates a localized, path-isolated virtual environment sandbox.
// Returns (EnvInfo, error).
func (m *Manager) Create(parentDir, envName string, force bool) (*EnvInfo, error) {
	if parentDir == "" {
		return nil, fmt.Errorf("parent directory must not be empty")
	}
	if envName == "" {
		return nil, fmt.Errorf("environment name must not be empty")
	}

	envDir := filepath.Join(parentDir, envName)

	exists, err := m.fs.Exists(envDir)
	if err != nil {
		return nil, fmt.Errorf("checking environment existence: %w", err)
	}

	if exists {
		if !force {
			return nil, fmt.Errorf("environment already exists at %s", envDir)
		}
		// Try deleting existing files first to enable fresh creation
		_ = m.fs.Remove(filepath.Join(envDir, SourceFile))
		_ = m.fs.Remove(filepath.Join(envDir, PowerShellFile))
		_ = m.fs.Remove(filepath.Join(envDir, ConfigFile))
		_ = m.fs.Remove(filepath.Join(envDir, ToolsDirName))
		_ = m.fs.Remove(envDir)
	}

	if err := m.fs.MkdirAll(envDir, 0755); err != nil {
		return nil, fmt.Errorf("creating environment directory: %w", err)
	}

	toolsDir := filepath.Join(envDir, ToolsDirName)
	if err := m.fs.MkdirAll(toolsDir, 0755); err != nil {
		return nil, fmt.Errorf("creating tools directory: %w", err)
	}

	data := templateData{
		EnvDir:  envDir,
		EnvName: envName,
	}

	var sourceBuf bytes.Buffer
	if err := sourceTemplate.Execute(&sourceBuf, data); err != nil {
		return nil, fmt.Errorf("executing POSIX activation template: %w", err)
	}
	if err := m.fs.WriteFile(filepath.Join(envDir, SourceFile), sourceBuf.Bytes(), 0755); err != nil {
		return nil, fmt.Errorf("writing POSIX activation script: %w", err)
	}

	var psBuf bytes.Buffer
	if err := ps1Template.Execute(&psBuf, data); err != nil {
		return nil, fmt.Errorf("executing PowerShell activation template: %w", err)
	}
	if err := m.fs.WriteFile(filepath.Join(envDir, PowerShellFile), psBuf.Bytes(), 0644); err != nil {
		return nil, fmt.Errorf("writing PowerShell activation script: %w", err)
	}

	configContent := `import { defineConfig } from "./dotfiles.config";

export default defineConfig({
  tools: []
});
`
	if err := m.fs.WriteFile(filepath.Join(envDir, ConfigFile), []byte(configContent), 0644); err != nil {
		return nil, fmt.Errorf("writing config file: %w", err)
	}

	return &EnvInfo{
		EnvDir:  envDir,
		EnvName: envName,
	}, nil
}

// IsValidEnv checks if the directory exists and contains our virtual environment files.
func (m *Manager) IsValidEnv(envDir string) (bool, error) {
	if envDir == "" {
		return false, nil
	}

	exists, err := m.fs.Exists(filepath.Join(envDir, SourceFile))
	if err != nil {
		return false, err
	}
	if !exists {
		return false, nil
	}

	exists, err = m.fs.Exists(filepath.Join(envDir, ConfigFile))
	if err != nil {
		return false, err
	}
	return exists, nil
}

// Delete removes an existing virtual environment directory and its files.
func (m *Manager) Delete(envDir string) error {
	valid, err := m.IsValidEnv(envDir)
	if err != nil {
		return fmt.Errorf("validating env before delete: %w", err)
	}
	if !valid {
		return fmt.Errorf("not a valid virtual environment directory: %s", envDir)
	}

	_ = m.fs.Remove(filepath.Join(envDir, SourceFile))
	_ = m.fs.Remove(filepath.Join(envDir, PowerShellFile))
	_ = m.fs.Remove(filepath.Join(envDir, ConfigFile))
	_ = m.fs.Remove(filepath.Join(envDir, ToolsDirName))

	err = m.fs.Remove(envDir)
	if err != nil {
		return fmt.Errorf("removing environment directory: %w", err)
	}

	return nil
}
