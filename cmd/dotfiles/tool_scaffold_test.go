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
			p := newE2EProject(t, "")
			toolsDir := filepath.Join(p.Root, "tools")
			p.writeConfig(t, "", fmt.Sprintf(`"toolConfigsDir": %q`, toolsDir), "")

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
