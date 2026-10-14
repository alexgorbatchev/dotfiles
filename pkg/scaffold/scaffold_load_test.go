package scaffold_test

import (
	"io"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/scaffold"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

// loadScaffolded provisions the templates for targetOS and loads the result back
// through the loader, evaluating it against the given target rather than the host.
func loadScaffolded(t *testing.T, targetOS, targetArch string) map[string]*config.ToolConfig {
	t.Helper()

	tmpDir := t.TempDir()
	osFS := fs.NewOSFS()
	if _, err := scaffold.Run(osFS, scaffold.Options{
		Dir:      filepath.Join(tmpDir, "tools"),
		TargetOS: targetOS,
	}); err != nil {
		t.Fatalf("scaffold failed: %v", err)
	}

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	if err := os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: `+strconv.Quote(filepath.ToSlash(tmpDir))+` } };`), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	log := logger.New(logger.Config{Writer: io.Discard})
	_, toolConfigs, _, err := vm.LoadTypeScriptConfig(log, osFS, configPath, vm.WithTarget(vm.Target{OS: targetOS, Arch: targetArch}))
	if err != nil {
		t.Fatalf("loading scaffolded %s repository failed: %v", targetOS, err)
	}
	return toolConfigs
}

// Scaffolded templates are TypeScript the loader has to bundle and evaluate, so a
// malformed one would ship a repository that cannot be loaded at all.
func TestScaffoldedTemplatesLoad(t *testing.T) {
	for _, targetOS := range []string{"darwin", "linux", "windows"} {
		t.Run(targetOS, func(t *testing.T) {
			if _, ok := loadScaffolded(t, targetOS, "arm64")["dotfiles"]; !ok {
				t.Error("expected the dotfiles tool to be loaded")
			}
		})
	}
}

func TestScaffoldedTemplatesLoadAfterFileFailure(t *testing.T) {
	root := t.TempDir()
	toolsDir := filepath.Join(root, "tools")
	if err := os.MkdirAll(filepath.Join(toolsDir, "dotfiles.tool.ts"), 0755); err != nil {
		t.Fatal(err)
	}
	osFS := fs.NewOSFS()
	if _, err := scaffold.Run(osFS, scaffold.Options{Dir: toolsDir, TargetOS: "linux"}); err == nil {
		t.Fatal("expected an error reading a directory as a starter file")
	}
	configPath := filepath.Join(root, "dotfiles.config.ts")
	if err := os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: `+strconv.Quote(filepath.ToSlash(root))+` } };`), 0644); err != nil {
		t.Fatal(err)
	}
	log := logger.New(logger.Config{Writer: io.Discard})
	_, tools, _, err := vm.LoadTypeScriptConfig(log, osFS, configPath, vm.WithTarget(vm.Target{OS: "linux", Arch: "amd64"}))
	if err != nil {
		t.Fatalf("loading successful starter after another failed: %v", err)
	}
	if tools["typescript"] == nil {
		t.Fatal("later starter was not created as a loadable tool")
	}
}

// Homebrew's install prefix differs per macOS architecture and both are released
// targets, so the scaffolded tool must resolve to the right one on each.
func TestScaffoldedBrewToolResolvesPerArchitecture(t *testing.T) {
	tests := []struct {
		name       string
		targetArch string
		prefix     string
	}{
		{name: "apple silicon", targetArch: "arm64", prefix: "/opt/homebrew"},
		{name: "intel", targetArch: "amd64", prefix: "/usr/local"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			brew := loadScaffolded(t, "darwin", tt.targetArch)["brew"]
			if brew == nil {
				t.Fatal("expected a brew tool to be scaffolded on darwin")
			}
			if brew.Disabled {
				t.Fatalf("expected brew to be enabled on darwin/%s", tt.targetArch)
			}

			if got, want := brew.InstallParams["binaryPath"], tt.prefix+"/bin/brew"; got != want {
				t.Errorf("binaryPath = %v, want %v", got, want)
			}

			wantShell := `eval "$(` + tt.prefix + `/bin/brew shellenv)"`
			for shell, cfg := range map[string]*config.ShellTypeConfig{
				"zsh":  brew.ShellConfigs.Zsh,
				"bash": brew.ShellConfigs.Bash,
			} {
				if cfg == nil || len(cfg.Scripts) == 0 {
					t.Errorf("expected a %s shell script for brew", shell)
					continue
				}
				if got := cfg.Scripts[0].Value; got != wantShell {
					t.Errorf("%s script = %q, want %q", shell, got, wantShell)
				}
			}
		})
	}
}
