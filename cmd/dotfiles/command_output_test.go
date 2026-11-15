package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func extractJSONPayload(output string) string {
	var jsonLines []string
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "INFO\t") || strings.HasPrefix(trimmed, "WARN\t") || strings.HasPrefix(trimmed, "ERROR\t") || strings.HasPrefix(trimmed, "DEBUG\t") {
			continue
		}
		jsonLines = append(jsonLines, line)
	}
	return strings.Join(jsonLines, "\n")
}

func TestDualModeAndJSONFlags(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	t.Run("check-updates --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "tool", "check", "--json")
		if err != nil {
			t.Fatalf("check-updates --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[\n  {") {
			t.Errorf("expected indented JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "tool", "check", "--json")
		if err != nil {
			t.Fatalf("tool check --json failed in agent mode: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "\n") {
			t.Errorf("expected minified single-line JSON in agent mode, got:\n%s", jsonAgent)
		}
		if !strings.HasPrefix(jsonAgent, "[{") {
			t.Errorf("expected valid minified JSON array, got:\n%s", jsonAgent)
		}
	})

	t.Run("check-updates text in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", absConfig, "tool", "check")
		if err != nil {
			t.Fatalf("tool check failed in agent mode: %v", err)
		}
		if !strings.Contains(out, "tool:") {
			t.Errorf("expected key-value format in agent mode, got:\n%s", out)
		}
	})

	t.Run("files --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "tool", "files", "--json")
		if err != nil {
			t.Fatalf("tool files --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[]") && !strings.Contains(jsonHuman, "[\n  ") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "tool", "files", "--json")
		if err != nil {
			t.Fatalf("tool files --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("files tree in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, _ := executeCommand("-c", absConfig, "tool", "files")
		if !strings.Contains(outHuman, "No files currently managed") && !strings.Contains(outHuman, "- ") {
			t.Errorf("expected human list in human mode, got:\n%s", outHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, _ := executeCommand("-c", absConfig, "tool", "files")
		if !strings.Contains(outAgent, "no files managed") && !strings.Contains(outAgent, "tool:") {
			t.Errorf("expected compact agent output in agent mode, got:\n%s", outAgent)
		}
	})

	t.Run("bin --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"name\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "\n") {
			t.Errorf("expected minified single-line JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("detect-conflicts --json in human vs agent mode", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"good": `install().bin("good")`})
		if out, err := p.run("generate"); err != nil {
			t.Fatalf("generating audit fixture: %v\n%s", err, out.Combined)
		}
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", p.ConfigPath, "shell", "audit", "--json")
		if err != nil {
			t.Fatalf("shell audit --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"hasConflicts\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", p.ConfigPath, "shell", "audit", "--json")
		if err != nil {
			t.Fatalf("shell audit --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("detect-conflicts text in agent mode", func(t *testing.T) {
		p := newE2EProject(t, tsTools{"good": `install().bin("good")`})
		if out, err := p.run("generate"); err != nil {
			t.Fatalf("generating audit fixture: %v\n%s", err, out.Combined)
		}
		t.Setenv("AGENT", "1")
		out, err := executeCommand("-c", p.ConfigPath, "shell", "audit")
		if err != nil {
			t.Fatalf("shell audit failed: %v", err)
		}
		if !strings.Contains(out, "OK: no conflicts") {
			t.Errorf("expected 'OK: no conflicts' in agent mode, got:\n%s", out)
		}
	})

	t.Run("path --json in human vs agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "path", "list", "--json")
		if err != nil {
			t.Fatalf("path list --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "  \"target\":") {
			t.Errorf("expected pretty JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "path", "list", "--json")
		if err != nil {
			t.Fatalf("path list --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})

	t.Run("log --json and log --status --json", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		outHuman, err := executeCommand("-c", absConfig, "state", "log", "--status", "--json")
		if err != nil {
			t.Fatalf("state log --status --json failed: %v", err)
		}
		jsonHuman := extractJSONPayload(outHuman)
		if !strings.Contains(jsonHuman, "[]") && !strings.Contains(jsonHuman, "  ") {
			t.Errorf("expected valid JSON in human mode, got:\n%s", jsonHuman)
		}

		t.Setenv("AGENT", "1")
		outAgent, err := executeCommand("-c", absConfig, "state", "log", "--status", "--json")
		if err != nil {
			t.Fatalf("state log --status --json in agent mode failed: %v", err)
		}
		jsonAgent := extractJSONPayload(outAgent)
		if strings.Contains(jsonAgent, "  ") {
			t.Errorf("expected minified JSON in agent mode, got:\n%s", jsonAgent)
		}
	})
}
