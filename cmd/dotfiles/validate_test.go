package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateCommand_ValidConfig(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	out, err := executeCommand("-c", configPath, "validate")
	if err != nil {
		t.Fatalf("validate command failed: %v", err)
	}
	if !strings.Contains(out, "Checked") || !strings.Contains(out, "all valid") {
		t.Errorf("expected validate output to show checked tools and valid result, got:\n%s", out)
	}
}

func TestValidateCommand_SpecificTool(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	out, err := executeCommand("-c", configPath, "validate", "bat")
	if err != nil {
		t.Fatalf("validate bat failed: %v", err)
	}
	if !strings.Contains(out, "Checked 1 tool configuration") {
		t.Errorf("expected 1 checked tool, got:\n%s", out)
	}
}

func TestValidateCommand_NonExistentTool(t *testing.T) {
	tmpDir := createTempConfigDir(t)
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")

	_, err := executeCommand("-c", configPath, "validate", "non-existent-tool")
	if err == nil {
		t.Errorf("expected validate non-existent-tool to return an error")
	}
}

func TestValidateCommand_InvalidMethod(t *testing.T) {
	tmpDir := t.TempDir()
	configContent := `{
	"projectConfig": {"paths": {"homeDir": "/tmp/h", "targetDir": "/tmp/t", "generatedDir": "/tmp/g"}},
	"toolConfigs": {
		"badtool": {
			"name": "badtool",
			"installationMethod": "invalid-installer-method"
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config failed: %v", err)
	}

	out, err := executeCommand("-c", configPath, "validate")
	if err == nil {
		t.Errorf("expected validate with invalid installer method to fail, got out:\n%s", out)
	}
	if !strings.Contains(out, "Unknown installation method") {
		t.Errorf("expected 'Unknown installation method' in output, got:\n%s", out)
	}
}

func TestValidateCommand_AptWithoutSudoWarning(t *testing.T) {
	tmpDir := t.TempDir()
	configContent := `{
	"projectConfig": {"paths": {"homeDir": "/tmp/h", "targetDir": "/tmp/t", "generatedDir": "/tmp/g"}},
	"toolConfigs": {
		"apttool": {
			"name": "apttool",
			"installationMethod": "apt"
		}
	}
}`
	configPath := filepath.Join(tmpDir, "dotfiles.config.json")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config failed: %v", err)
	}

	out, err := executeCommand("-c", configPath, "validate")
	if err != nil {
		t.Fatalf("validate apt without sudo failed unexpectedly: %v", err)
	}
	if !strings.Contains(out, "usually requires .sudo() elevation") {
		t.Errorf("expected warning about .sudo() elevation, got:\n%s", out)
	}
}
