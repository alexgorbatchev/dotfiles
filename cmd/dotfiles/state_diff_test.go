package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiffCommand(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: "`+tmpDir+`", generatedDir: "`+tmpDir+`/.generated", targetDir: "`+tmpDir+`/bin", homeDir: "`+tmpDir+`/home" } };`), 0644)

	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)
	toolPath := filepath.Join(toolsDir, "ssh.tool.ts")
	_ = os.WriteFile(toolPath, []byte(`
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((i) => i("manual").block("~/.ssh/config", { id: "main", content: "Include a" }));
`), 0644)

	var buf bytes.Buffer
	stateDiffCmd.SetOut(&buf)
	stateDiffCmd.SetErr(&buf)
	cfgFile = configPath

	err := stateDiffCmd.RunE(stateDiffCmd, []string{})
	if err != nil {
		t.Fatalf("stateDiffCmd.RunE failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "ssh") || !strings.Contains(out, "block main") {
		t.Errorf("expected diff output to contain tool ssh and block main, got:\n%s", out)
	}
}

func TestDiffCommandJSON(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: "`+tmpDir+`", generatedDir: "`+tmpDir+`/.generated", targetDir: "`+tmpDir+`/bin", homeDir: "`+tmpDir+`/home" } };`), 0644)

	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)
	toolPath := filepath.Join(toolsDir, "ssh.tool.ts")
	_ = os.WriteFile(toolPath, []byte(`
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((i) => i("manual").block("~/.ssh/config", { id: "main", content: "Include a" }));
`), 0644)

	var buf bytes.Buffer
	stateDiffCmd.SetOut(&buf)
	stateDiffCmd.SetErr(&buf)
	cfgFile = configPath
	diffJSON = true
	defer func() { diffJSON = false }()

	err := stateDiffCmd.RunE(stateDiffCmd, []string{})
	if err != nil {
		t.Fatalf("stateDiffCmd.RunE failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, `"hasDrift": true`) || !strings.Contains(out, `"blockId": "main"`) {
		t.Errorf("expected json output, got:\n%s", out)
	}
}

func TestDiffCommandCopy(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: "`+tmpDir+`", generatedDir: "`+tmpDir+`/.generated", targetDir: "`+tmpDir+`/bin", homeDir: "`+tmpDir+`/home" } };`), 0644)

	toolsDir := filepath.Join(tmpDir, "tools")
	_ = os.MkdirAll(toolsDir, 0755)
	srcFile := filepath.Join(toolsDir, "app.conf")
	_ = os.WriteFile(srcFile, []byte("setting = 1\n"), 0644)

	toolPath := filepath.Join(toolsDir, "app.tool.ts")
	_ = os.WriteFile(toolPath, []byte(`
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((i) => i("manual").copy("./app.conf", "~/.config/app/app.conf"));
`), 0644)

	var buf bytes.Buffer
	stateDiffCmd.SetOut(&buf)
	stateDiffCmd.SetErr(&buf)
	cfgFile = configPath

	err := stateDiffCmd.RunE(stateDiffCmd, []string{})
	if err != nil {
		t.Fatalf("stateDiffCmd.RunE failed: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "app") || !strings.Contains(out, "copy") {
		t.Errorf("expected diff output to contain tool app and copy type, got:\n%s", out)
	}
}
