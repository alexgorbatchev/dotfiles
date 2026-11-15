package main

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

// A shell function another tool declares under a tool's name does not stand in for
// that tool: agent-resume wraps codex in a function and sorts first, and updating codex
// must still reach codex.
func TestToolCommandsTargetToolsNotShellFunctions(t *testing.T) {
	dir := t.TempDir()
	configPath := writeTSProject(t, dir, `"paths": {`+projectPathsTS(dir)+`}`, tsTools{
		"agent-resume": `install().zsh((shell) => shell.functions({ codex: 'command codex "$@"' }))`,
		"codex":        `install("manual").bin("codex")`,
	})

	out, err := runCommand("-c", configPath, "tool", "update", "codex")
	if err == nil {
		t.Fatalf("expected update of an uninstalled tool to fail, output %q", out.Combined)
	}
	mustContain(t, "error", err.Error(), `tool "codex": tool "codex" is not installed`)
	if strings.Contains(out.Combined, "[agent-resume]") {
		t.Errorf("update resolved codex to agent-resume:\n%s", out.Combined)
	}

	info, err := runCommand("-c", configPath, "tool", "info", "codex", "--json")
	if err != nil {
		t.Fatalf("tool info codex: %v\n%s", err, info.Combined)
	}
	var report ToolInfoReport
	if err := json.Unmarshal([]byte(info.Stdout), &report); err != nil {
		t.Fatalf("decoding tool info: %v\n%s", err, info.Stdout)
	}
	if report.Name != "codex" || filepath.Base(report.ConfigFilePath) != "codex.tool.ts" {
		t.Errorf("tool info codex described %q from %q, want codex from codex.tool.ts", report.Name, report.ConfigFilePath)
	}
}

func TestToolListAndInfoCommand_Output(t *testing.T) {
	p := newE2EProject(t, tsTools{
		"gh": `install("manual").bin("ghb").bin("ghc")`,
		"sh": `install()`,
	})

	t.Run("tool list text", func(t *testing.T) {
		out, err := p.run("tool", "list")
		if err != nil {
			t.Fatalf("tool list: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "gh", "sh")
	})

	t.Run("tool list agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("tool", "list")
		if err != nil {
			t.Fatalf("tool list: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "name:gh", "name:sh")
	})

	t.Run("tool list json", func(t *testing.T) {
		out, err := p.run("tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json: %v\n%s", err, out.Combined)
		}
		var got []ToolListItem
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if len(got) != 2 {
			t.Fatalf("expected 2 tools, got %d", len(got))
		}
	})

	t.Run("tool info", func(t *testing.T) {
		out, err := p.run("tool", "info", "gh")
		if err != nil {
			t.Fatalf("tool info gh: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stdout", out.Stdout, "gh", "manual", "ghb", "ghc")
	})

	t.Run("tool info json", func(t *testing.T) {
		out, err := p.run("tool", "info", "gh", "--json")
		if err != nil {
			t.Fatalf("tool info gh --json: %v\n%s", err, out.Combined)
		}
		var got ToolInfoReport
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got.Name != "gh" || got.InstallationMethod != "manual" || len(got.Binaries) != 2 {
			t.Fatalf("unexpected info report: %+v", got)
		}
	})
}
