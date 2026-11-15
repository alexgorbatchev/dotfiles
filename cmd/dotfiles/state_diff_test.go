package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestDiffCommand(t *testing.T) {
	tmpDir := t.TempDir()
	dir := filepath.ToSlash(tmpDir)
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: `+strconv.Quote(dir)+`, generatedDir: `+strconv.Quote(dir+"/.generated")+`, targetDir: `+strconv.Quote(dir+"/bin")+`, homeDir: `+strconv.Quote(dir+"/home")+` } };`), 0644)

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
	dir := filepath.ToSlash(tmpDir)
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: `+strconv.Quote(dir)+`, generatedDir: `+strconv.Quote(dir+"/.generated")+`, targetDir: `+strconv.Quote(dir+"/bin")+`, homeDir: `+strconv.Quote(dir+"/home")+` } };`), 0644)

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
	dir := filepath.ToSlash(tmpDir)
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: `+strconv.Quote(dir)+`, generatedDir: `+strconv.Quote(dir+"/.generated")+`, targetDir: `+strconv.Quote(dir+"/bin")+`, homeDir: `+strconv.Quote(dir+"/home")+` } };`), 0644)

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

func TestDiffBatchContinuesAfterFailure(t *testing.T) {
	// Direct command tests set their own streams. Inherit the root command's
	// captured streams when exercising the complete CLI here.
	stateDiffCmd.SetOut(nil)
	stateDiffCmd.SetErr(nil)
	for _, json := range []bool{false, true} {
		t.Run(fmt.Sprintf("json=%t", json), func(t *testing.T) {
			p := newE2EProject(t, tsTools{
				"a-broken": `install().template("bad.tmpl", "~/broken")`,
				"z-good":   `install().copy("good.conf", "~/healthy-copy")`,
			})
			for name, content := range map[string]string{"bad.tmpl": "unresolved = {missing_var}", "good.conf": "healthy-content"} {
				if err := os.WriteFile(filepath.Join(p.Root, "tools", name), []byte(content), 0600); err != nil {
					t.Fatal(err)
				}
			}
			args := []string{"state", "diff"}
			if json {
				args = append(args, "--json")
			}
			out, err := p.run(args...)
			if err == nil {
				t.Fatalf("diff succeeded despite invalid template\n%s", out.Combined)
			}
			if !strings.Contains(out.Stdout, "z-good") {
				t.Fatalf("healthy tool was not inspected: %v\n%s", err, out.Combined)
			}
			mustContain(t, "stdout", out.Stdout, "z-good", "healthy-copy")
			mustContain(t, "stderr", out.Stderr, "a-broken")
		})
	}
}
