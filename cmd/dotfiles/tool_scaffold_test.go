package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScaffoldCommand_RespectsPlatformFlag(t *testing.T) {
	tests := []struct {
		name       string
		platform   string
		wantFiles  []string
		wontFiles  []string
		wantStderr []string
		wontStderr []string
	}{
		{
			name:       "linux target omits darwin-specific brew tool",
			platform:   "linux",
			wantFiles:  []string{"dotfiles.tool.ts", "typescript.tool.ts"},
			wontFiles:  []string{"brew.tool.ts"},
			wantStderr: []string{"Created ", "dotfiles.tool.ts", "typescript.tool.ts"},
			wontStderr: []string{"brew.tool.ts"},
		},
		{
			name:       "windows target omits darwin-specific brew tool",
			platform:   "windows",
			wantFiles:  []string{"dotfiles.tool.ts", "typescript.tool.ts"},
			wontFiles:  []string{"brew.tool.ts"},
			wantStderr: []string{"Created ", "dotfiles.tool.ts", "typescript.tool.ts"},
			wontStderr: []string{"brew.tool.ts"},
		},
		{
			name:       "macos target includes brew tool",
			platform:   "macos",
			wantFiles:  []string{"dotfiles.tool.ts", "typescript.tool.ts", "brew.tool.ts"},
			wontFiles:  nil,
			wantStderr: []string{"Created ", "dotfiles.tool.ts", "typescript.tool.ts", "brew.tool.ts"},
			wontStderr: nil,
		},
		{
			name:       "darwin target includes brew tool",
			platform:   "darwin",
			wantFiles:  []string{"dotfiles.tool.ts", "typescript.tool.ts", "brew.tool.ts"},
			wontFiles:  nil,
			wantStderr: []string{"Created ", "dotfiles.tool.ts", "typescript.tool.ts", "brew.tool.ts"},
			wontStderr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := newE2EProject(t, nil)
			toolsDir := filepath.Join(p.Root, "tools")
			p.writeConfig(t, nil, fmt.Sprintf(`"toolConfigsDir": %q`, toolsDir), "")

			out, err := p.run("--platform", tt.platform, "tool", "scaffold")
			if err != nil {
				t.Fatalf("scaffold --platform %s failed: %v\n%s", tt.platform, err, out.Combined)
			}

			for _, wantFile := range tt.wantFiles {
				filePath := filepath.Join(toolsDir, wantFile)
				if _, err := os.Stat(filePath); err != nil {
					t.Errorf("expected %s to exist for platform %s: %v", wantFile, tt.platform, err)
				}
			}

			for _, wontFile := range tt.wontFiles {
				filePath := filepath.Join(toolsDir, wontFile)
				if _, err := os.Stat(filePath); !os.IsNotExist(err) {
					t.Errorf("expected %s to NOT exist for platform %s, but it was found", wontFile, tt.platform)
				}
			}

			for _, want := range tt.wantStderr {
				mustContain(t, "stderr", out.Stderr, want)
			}

			for _, wont := range tt.wontStderr {
				if strings.Contains(out.Stderr, wont) {
					t.Errorf("stderr contains %q, but should not for platform %s:\n%s", wont, tt.platform, out.Stderr)
				}
			}
		})
	}
}

func TestScaffoldCommand(t *testing.T) {
	p := newE2EProject(t, nil)
	toolsDir := filepath.Join(p.Root, "tools")
	p.writeConfig(t, nil, fmt.Sprintf(`"toolConfigsDir": %q`, filepath.ToSlash(toolsDir)), "")
	dotfilesTool := filepath.Join(toolsDir, "dotfiles.tool.ts")

	t.Run("creates the starter files", func(t *testing.T) {
		out, err := p.run("tool", "scaffold")
		if err != nil {
			t.Fatalf("tool scaffold: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Created "+dotfilesTool)
		if _, err := os.Stat(dotfilesTool); err != nil {
			t.Fatalf("expected %s to exist: %v", dotfilesTool, err)
		}
	})

	t.Run("leaves existing files alone", func(t *testing.T) {
		out, err := p.run("tool", "scaffold")
		if err != nil {
			t.Fatalf("tool scaffold: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, dotfilesTool+" already exists, skipping")
	})

	t.Run("force replaces an edited file and keeps a backup", func(t *testing.T) {
		if err := os.WriteFile(dotfilesTool, []byte("// my edits\n"), 0644); err != nil {
			t.Fatalf("editing file: %v", err)
		}
		out, err := p.run("tool", "scaffold", "--force")
		if err != nil {
			t.Fatalf("tool scaffold --force: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr,
			"Overwrote "+dotfilesTool,
			"Saved your previous dotfiles.tool.ts to "+dotfilesTool+".bak",
		)
		backup, err := os.ReadFile(dotfilesTool + ".bak")
		if err != nil {
			t.Fatalf("reading backup: %v", err)
		}
		if string(backup) != "// my edits\n" {
			t.Fatalf("backup = %q, want the edited content", backup)
		}
	})

	t.Run("dry run only reports", func(t *testing.T) {
		fresh := newE2EProject(t, nil)
		freshTools := filepath.Join(fresh.Root, "tools")
		fresh.writeConfig(t, nil, fmt.Sprintf(`"toolConfigsDir": %q`, filepath.ToSlash(freshTools)), "")
		out, err := fresh.run("tool", "scaffold", "--dry-run")
		if err != nil {
			t.Fatalf("tool scaffold --dry-run: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Would create "+filepath.Join(freshTools, "dotfiles.tool.ts"))
		if _, err := os.Stat(freshTools); !os.IsNotExist(err) {
			t.Fatalf("dry run must not create %s (stat err = %v)", freshTools, err)
		}
	})
}

func TestScaffoldBatchContinuesAfterFailure(t *testing.T) {
	p := newE2EProject(t, tsTools{})
	broken := filepath.Join(p.Root, "tools", "dotfiles.tool.ts")
	if err := os.MkdirAll(broken, 0755); err != nil {
		t.Fatal(err)
	}
	out, err := p.run("tool", "scaffold")
	if err == nil {
		t.Fatalf("scaffold succeeded despite unreadable starter file\n%s", out.Combined)
	}
	if _, err := os.Stat(filepath.Join(p.Root, "tools", "typescript.tool.ts")); err != nil {
		t.Fatalf("later starter file was not written: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "Created", "typescript.tool.ts")
}
