package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

func TestInstallPruneCacheFlag(t *testing.T) {
	for _, tc := range []struct {
		name          string
		configuration string
		flag          string
		automatic     bool
	}{
		{"default", "", "", true},
		{"config enabled", "downloader: {pruneCache: true}", "", true},
		{"config disabled", "downloader: {pruneCache: false}", "", false},
		{"flag disables config", "downloader: {pruneCache: true}", "--prune-cache=false", false},
		{"flag enables config", "downloader: {pruneCache: false}", "--prune-cache=true", true},
		{"flag without value enables config", "downloader: {pruneCache: false}", "--prune-cache", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := newE2EProject(t, nil)
			t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				fmt.Fprint(w, r.URL.Path)
			}))
			defer server.Close()
			for _, version := range []string{"v1", "v2"} {
				p.writeConfig(t, tsTools{"tool": fmt.Sprintf(`install("curl-binary", {url: %q}).version(%q).bin("tool")`, server.URL+"/"+version, version)}, "", tc.configuration)
				args := []string{"tool", "install", "tool", "--force"}
				if tc.flag != "" {
					args = append(args, tc.flag)
				}
				out, err := p.run(args...)
				if err != nil {
					t.Fatalf("install: %v\n%s", err, out.Combined)
				}
			}
			d := downloader.NewDownloader(fs.NewOSFS(), nil)
			d.CacheDir = filepath.Join(p.GeneratedDir, "cache", "downloads")
			result, err := d.Prune(context.Background(), map[string]string{"tool": "v2"}, nil)
			if err != nil {
				t.Fatal(err)
			}
			want := 0
			if !tc.automatic {
				want = 1
			}
			if result.Entries != want {
				t.Fatalf("remaining obsolete archives = %d, want %d", result.Entries, want)
			}
			// The installed version remains usable from cache after the server stops.
			server.Close()
			if err := d.Download(context.Background(), server.URL+"/v2", filepath.Join(p.Root, "from-cache"), ""); err != nil {
				t.Fatalf("installed archive was pruned: %v", err)
			}
		})
	}
}

func TestInstallCommand_ShimModeQuietOutput(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	createTempConfigDir(t)

	out, err := executeCommand("tool", "install", "--shim-mode", "bat")
	if err != nil {
		t.Fatalf("tool install bat in shim mode failed: %v", err)
	}
	if out != "" {
		t.Errorf("expected no output in shim mode, got: %q", out)
	}
}

func TestInstallCommand_ArgumentHandling(t *testing.T) {
	p := newE2EProject(t, tsTools{
		"bat":    `install("manual")`,
		"broken": `install().bin("brk")`,
	})

	t.Run("KEY=VALUE words are not tool names", func(t *testing.T) {
		out, err := p.run("tool", "install", "FOO=1", "bat")
		if err != nil {
			t.Fatalf("tool install FOO=1 bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Installing...")
	})

	t.Run("unknown tool", func(t *testing.T) {
		_, err := p.run("tool", "install", "nope")
		if err == nil || !strings.Contains(err.Error(), `tool "nope" not found in configuration`) {
			t.Fatalf("error = %v, want not-found failure", err)
		}
	})

	t.Run("a failed installation is logged once and the error silenced", func(t *testing.T) {
		out, err := p.run("tool", "install", "broken")
		if !errors.Is(err, toolbatch.ErrFailed) {
			t.Fatalf("error = %v, want reported tool failure", err)
		}
		mustContain(t, "stderr", out.Stderr, "[broken] installation method not specified")
	})

	t.Run("force reinstalls", func(t *testing.T) {
		out, err := p.run("tool", "install", "--force", "bat")
		if err != nil {
			t.Fatalf("tool install --force bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Installing...")
	})
}

func TestInstallCommand_DisabledTool(t *testing.T) {
	definitions := []struct {
		name string
		body string
	}{
		{"explicitly disabled", `install("manual").bin("disabled").disable()`},
		{"macOS only", `install().platform(Platform.MacOS, install => install("manual").bin("disabled"))`},
	}
	modes := []struct {
		name        string
		args        []string
		wantMessage bool
		wantActive  bool
	}{
		{"targeted", []string{"tool", "install", "disabled"}, true, false},
		{"root shortcut", []string{"install", "disabled"}, true, false},
		{"forced", []string{"tool", "install", "disabled", "--force"}, true, false},
		{"agent", []string{"tool", "install", "disabled"}, true, false},
		{"shim", []string{"tool", "install", "disabled", "--shim-mode"}, false, false},
		{"quiet", []string{"tool", "install", "disabled", "--quiet"}, false, false},
		{"batch", []string{"tool", "install"}, false, true},
		{"multiple tools", []string{"tool", "install", "disabled", "active"}, true, true},
	}
	for _, definition := range definitions {
		for _, mode := range modes {
			t.Run(definition.name+"/"+mode.name, func(t *testing.T) {
				t.Setenv("AGENT", "0")
				if mode.name == "agent" {
					t.Setenv("AGENT", "1")
				}
				p := newE2EProject(t, tsTools{"disabled": definition.body, "active": `install("manual")`})
				source := "import { defineTool, Platform } from \"@alexgorbatchev/dotfiles\";\n" +
					"export default defineTool((install, ctx) => " + definition.body + ");\n"
				if err := os.WriteFile(filepath.Join(p.Root, "tools", "disabled.tool.ts"), []byte(source), 0644); err != nil {
					t.Fatal(err)
				}
				args := append([]string{"--platform", "linux"}, mode.args...)
				out, err := p.run(args...)
				if err != nil {
					t.Fatalf("install disabled tool: %v\n%s", err, out.Combined)
				}
				message := "[disabled] Skipping installation: tool is disabled for this configuration"
				if strings.Contains(out.Stderr, message) != mode.wantMessage {
					t.Fatalf("skip message present = %t, want %t; stderr:\n%s", strings.Contains(out.Stderr, message), mode.wantMessage, out.Stderr)
				}
				if out.Stdout != "" {
					t.Fatalf("diagnostics on stdout: %q", out.Stdout)
				}
				if p.installation(t, "disabled") != nil {
					t.Fatal("disabled tool was installed")
				}
				if _, err := os.Lstat(filepath.Join(p.TargetDir, "disabled")); !os.IsNotExist(err) {
					t.Fatalf("disabled tool has a generated shim: %v", err)
				}
				if (p.installation(t, "active") != nil) != mode.wantActive {
					t.Fatalf("active tool installed, want %t", mode.wantActive)
				}
			})
		}
	}
}

func TestInstallCommand_TargetedVsBatchAlreadyInstalled(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install("manual")`})

	t.Run("first install logs Installing...", func(t *testing.T) {
		out, err := p.run("tool", "install", "bat")
		if err != nil {
			t.Fatalf("tool install bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Installing...")
		mustNotContain(t, "stderr", out.Stderr, "Already installed")
	})

	t.Run("targeted install on already installed tool logs Already installed at info level without Installing...", func(t *testing.T) {
		out, err := p.run("tool", "install", "bat")
		if err != nil {
			t.Fatalf("tool install bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Already installed")
		mustNotContain(t, "stderr", out.Stderr, "[bat] Installing...")
	})

	t.Run("batch install does not spam Already installed lines at info level", func(t *testing.T) {
		out, err := p.run("tool", "install")
		if err != nil {
			t.Fatalf("tool install: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "Installing all configured tools")
		mustNotContain(t, "stderr", out.Stderr, "Already installed")
		mustNotContain(t, "stderr", out.Stderr, "[bat] Installing...")
	})

	t.Run("targeted install with --force reinstalls and logs Installing...", func(t *testing.T) {
		out, err := p.run("tool", "install", "--force", "bat")
		if err != nil {
			t.Fatalf("tool install --force bat: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, "[bat] Installing...")
		mustNotContain(t, "stderr", out.Stderr, "Already installed")
	})
}

func TestInstallCommand_RefreshesShellOnlyConfiguration(t *testing.T) {
	for _, command := range [][]string{{"install"}, {"tool", "install"}} {
		for _, mode := range [][]string{nil, {"--quiet"}, {"--shim-mode"}} {
			args := append(append([]string{}, command...), mode...)
			t.Run(strings.Join(args, " "), func(t *testing.T) {
				p := newE2EProject(t, tsTools{
					"workspace": `install().dependsOn("other").zsh(sh => sh.functions({workspace: "echo workspace-ready"}).always("export WORKSPACE_READY=yes"))`,
					"other":     `install().zsh(sh => sh.functions({other: "echo other-ready"}))`,
					"disabled":  `install().disable().zsh(sh => sh.always("echo disabled-marker"))`,
					"untouched": `install().ensureDir("~/must-not-be-generated").zsh(sh => sh.always("echo untouched-marker"))`,
				})
				out, err := p.run(append(args, "workspace")...)
				if err != nil {
					t.Fatalf("install workspace: %v\n%s", err, out.Combined)
				}
				if out.Stdout != "" {
					t.Errorf("status leaked to stdout: %q", out.Stdout)
				}
				if len(mode) == 0 {
					mustContain(t, "stderr", out.Stderr, "[workspace] Generating configuration...")
				} else {
					mustNotContain(t, "stderr", out.Stderr, "Generating configuration...")
				}
				mustNotContain(t, "stderr", out.Stderr, "[workspace] Installing...")
				scriptPath := filepath.Join(p.GeneratedDir, "shell-scripts", "main.zsh")
				script, err := os.ReadFile(scriptPath)
				if err != nil {
					t.Fatal(err)
				}
				text := string(script)
				mustContain(t, "shell initialization", text, "echo workspace-ready", "WORKSPACE_READY", "echo other-ready", "echo untouched-marker")
				mustNotContain(t, "shell initialization", text, "disabled-marker")
				if strings.Index(text, "echo other-ready") > strings.Index(text, "echo workspace-ready") {
					t.Error("dependent shell setup preceded its dependency")
				}
				if _, err := os.Stat(filepath.Join(p.HomeDir, "must-not-be-generated")); !os.IsNotExist(err) {
					t.Fatalf("targeted install generated an unrelated tool's files: %v", err)
				}
			})
		}
	}
}

func TestInstallCommand_ShellGenerationFailure(t *testing.T) {
	p := newE2EProject(t, tsTools{"workspace": `install().zsh(sh => sh.always("echo workspace-ready"))`})
	if err := os.MkdirAll(filepath.Join(p.GeneratedDir, "shell-scripts"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(p.GeneratedDir, "shell-scripts", ".once"), []byte("not a directory"), 0644); err != nil {
		t.Fatal(err)
	}
	out, err := p.run("install", "workspace")
	if err == nil {
		t.Fatalf("install succeeded despite shell generation failure\n%s", out.Combined)
	}
	mustContain(t, "stderr", out.Stderr, "[system]", "not a directory")
}
