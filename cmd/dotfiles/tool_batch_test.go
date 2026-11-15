package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestToolBatchesContinueAfterFailure(t *testing.T) {
	for _, command := range [][]string{
		{"state", "generate"}, {"generate"}, {"tool", "install"},
		{"tool", "install", "a-broken", "z-good"}, {"install", "a-broken", "z-good"},
	} {
		t.Run(strings.Join(command, " "), func(t *testing.T) {
			tools := tsTools{
				"a-broken": `install().symlink("missing.app", "~/Applications/Missing.app")`,
				"z-good":   `install().ensureDir("~/good-generated")`,
			}
			p := newE2EProject(t, tools)
			generating := command[len(command)-1] == "generate"
			if generating {
				p.writeConfig(t, tools, "", `"features": {"shellInstall": {"zsh": "~/.zshrc"}}`)
				if err := os.WriteFile(filepath.Join(p.HomeDir, ".zshrc"), []byte("# existing settings\n"), 0644); err != nil {
					t.Fatal(err)
				}
			}
			out, err := p.run(command...)
			if err == nil {
				t.Fatalf("batch succeeded despite the missing symlink source\n%s", out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, "a-broken", "source path does not exist")
			if _, err := os.Stat(filepath.Join(p.HomeDir, "good-generated")); err != nil {
				t.Errorf("tool after the failure was not generated: %v\n%s", err, out.Combined)
			}
			if _, err := os.Stat(filepath.Join(p.GeneratedDir, "shell-scripts", "main.zsh")); err != nil {
				t.Errorf("batch did not finish shell generation: %v", err)
			}
			if generating {
				completion := filepath.Join(p.GeneratedDir, "shell-scripts", "zsh", "completions", "_dotfiles")
				if _, err := os.Stat(completion); err != nil {
					t.Errorf("batch did not write CLI completion: %v", err)
				}
				profile, err := os.ReadFile(filepath.Join(p.HomeDir, ".zshrc"))
				if err != nil {
					t.Fatal(err)
				}
				mustContain(t, "profile", string(profile), "# existing settings", "main.zsh")
			}
			mustNotContain(t, "stderr", out.Stderr, "DONE")
		})
	}
}

func TestNamedToolBatchesContinueAfterUnknownTool(t *testing.T) {
	for _, command := range []string{"install", "uninstall", "update", "check"} {
		t.Run(command, func(t *testing.T) {
			p := newE2EProject(t, tsTools{"good": `install("manual")`})
			p.seedInstallation(t, "good", "v1.0.0", filepath.Join(p.Root, "installed", "good"))
			out, err := p.run("tool", command, "missing", "good")
			if err == nil {
				t.Fatalf("batch succeeded despite the unknown tool\n%s", out.Combined)
			}
			mustContain(t, "stderr", out.Stderr, `tool "missing" not found in configuration`, "[good]")
		})
	}
}
