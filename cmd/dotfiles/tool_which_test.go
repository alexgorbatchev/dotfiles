package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestWhyCommand(t *testing.T) {
	repoRoot := findRepoRoot()
	absConfig := filepath.Join(repoRoot, "test-project/dotfiles.config.ts")

	t.Run("found tool by binary name bat", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "bat")
		if err != nil {
			t.Fatalf("tool which bat failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/github-release--bat.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("found tool in subfolder by binary name eza", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "eza")
		if err != nil {
			t.Fatalf("tool which eza failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/subfolder/cargo--eza.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("found tool by full name github-release--bat", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "github-release--bat")
		if err != nil {
			t.Fatalf("tool which github-release--bat failed: %v", err)
		}
		expectedPath := filepath.Join(repoRoot, "test-project/tools/github-release--bat.tool.ts")
		if strings.TrimSpace(out) != expectedPath {
			t.Errorf("expected output %q, got %q", expectedPath, strings.TrimSpace(out))
		}
	})

	t.Run("not found tool fz", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which", "fz")
		if err == nil {
			t.Errorf("expected error when tool not found, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})

	t.Run("no argument provided", func(t *testing.T) {
		out, err := executeCommand("-c", absConfig, "tool", "which")
		if err == nil {
			t.Errorf("expected error when no arg provided, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})

	t.Run("bootstrap error invalid config file", func(t *testing.T) {
		out, err := executeCommand("-c", "/nonexistent/config.ts", "tool", "which", "bat")
		if err == nil {
			t.Errorf("expected error on bootstrap failure, got nil")
		}
		if out != "" {
			t.Errorf("expected empty output on failure, got %q", out)
		}
	})
}

func TestBinCommand_Resolution(t *testing.T) {
	p := newE2EProject(t, tsTools{
		"gh-tool": `install("manual").bin("ghb")`,
		"plain":   `install("manual")`,
	})
	binariesDir := filepath.Join(p.GeneratedDir, "binaries")
	ghb := filepath.Join(binariesDir, "gh-tool", "current", "ghb")
	if err := os.MkdirAll(filepath.Dir(ghb), 0755); err != nil {
		t.Fatalf("creating binary dir: %v", err)
	}
	if err := os.WriteFile(ghb, []byte("bin"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}
	// The command resolves symlinks, and temp dirs may sit behind one.
	wantPath, err := filepath.EvalSymlinks(ghb)
	if err != nil {
		t.Fatalf("resolving %s: %v", ghb, err)
	}

	for _, name := range []string{"ghb", "gh-tool"} {
		t.Run("resolves "+name, func(t *testing.T) {
			out, err := p.run("tool", "which", "--bin", name)
			if err != nil {
				t.Fatalf("tool which --bin %s: %v\n%s", name, err, out.Combined)
			}
			if strings.TrimSpace(out.Stdout) != wantPath {
				t.Fatalf("stdout = %q, want %q", out.Stdout, wantPath)
			}
		})
	}

	t.Run("resolves as json", func(t *testing.T) {
		out, err := p.run("tool", "which", "--bin", "ghb", "--json")
		if err != nil {
			t.Fatalf("tool which --bin ghb --json: %v\n%s", err, out.Combined)
		}
		var got map[string]string
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got["tool"] != "gh-tool" || got["binary"] != "ghb" || got["path"] != wantPath {
			t.Fatalf("json = %v, want tool gh-tool, binary ghb, path %s", got, wantPath)
		}
	})

	t.Run("unknown name", func(t *testing.T) {
		_, err := p.run("tool", "which", "--bin", "nope")
		if err == nil || !strings.Contains(err.Error(), "not found") {
			t.Fatalf("error = %v, want not-found failure", err)
		}
	})

	t.Run("binary missing on disk", func(t *testing.T) {
		_, err := p.run("tool", "which", "--bin", "plain")
		if err == nil || !strings.Contains(err.Error(), "binary path does not exist") {
			t.Fatalf("error = %v, want missing-path failure", err)
		}
	})

	t.Run("bin dir as json", func(t *testing.T) {
		out, err := p.run("path", "target", "--json")
		if err != nil {
			t.Fatalf("path target --json: %v\n%s", err, out.Combined)
		}
		var got map[string]string
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
		}
		if got["path"] != p.TargetDir {
			t.Fatalf("path = %q, want the target dir %q", got["path"], p.TargetDir)
		}
	})

	t.Run("list as json", func(t *testing.T) {
		out, err := p.run("tool", "list", "--json")
		if err != nil {
			t.Fatalf("tool list --json: %v\n%s", err, out.Combined)
		}
		var got []ToolListItem
		if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		names := []string{}
		for _, item := range got {
			names = append(names, item.Name)
		}
		if !slices.Contains(names, "gh-tool") || !slices.Contains(names, "plain") {
			t.Fatalf("tools = %+v, want gh-tool and plain", names)
		}
	})
}

// Without --bin, `tool which` names the .tool.ts file the tool was loaded from.
func TestWhichCommand_PrintsToolFile(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install("manual").bin("batcat")`})
	toolFile := filepath.Join(p.Root, "tools", "bat.tool.ts")

	for _, query := range []string{"bat", "batcat"} {
		out, err := p.run("tool", "which", query)
		if err != nil {
			t.Fatalf("tool which %s: %v\n%s", query, err, out.Combined)
		}
		if out.Stdout != toolFile+"\n" {
			t.Fatalf("tool which %s printed %q, want %q", query, out.Stdout, toolFile+"\n")
		}
	}

	out, err := p.run("tool", "which", "bat", "--json")
	if err != nil {
		t.Fatalf("tool which bat --json: %v\n%s", err, out.Combined)
	}
	var got map[string]string
	if err := json.Unmarshal([]byte(out.Stdout), &got); err != nil {
		t.Fatalf("stdout is not a JSON object: %v\n%s", err, out.Stdout)
	}
	if got["tool"] != "bat" || got["configPath"] != toolFile {
		t.Fatalf("json = %v, want tool bat configured in %s", got, toolFile)
	}
}
