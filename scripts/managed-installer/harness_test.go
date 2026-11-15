package managedinstaller

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestScenarioWorkspaceCleanup(t *testing.T) {
	for _, mode := range []string{"success", "failure", "terminate"} {
		for _, keep := range []bool{false, true} {
			name := mode
			if keep {
				name += "/keep"
			}
			t.Run(name, func(t *testing.T) {
				root := t.TempDir()
				scriptDir := filepath.Join(root, "scripts", "managed-installer")
				for _, dir := range []string{filepath.Join(scriptDir, "fixtures", "fresh-empty"), filepath.Join(root, ".dist"), filepath.Join(root, ".tmp"), filepath.Join(root, "bin")} {
					if err := os.MkdirAll(dir, 0755); err != nil {
						t.Fatal(err)
					}
				}
				writeFixture(t, filepath.Join(scriptDir, "test.sh"), readFixture(t, "test.sh"), 0755)
				writeFixture(t, filepath.Join(scriptDir, "install.sh"), harnessInstallFixture, 0755)
				writeFixture(t, filepath.Join(root, ".dist", "dotfiles"), "#!/bin/bash\nexit 0\n", 0755)
				writeFixture(t, filepath.Join(root, "bin", "bun"), "#!/bin/bash\nexit 0\n", 0755)
				writeFixture(t, filepath.Join(root, ".tmp", "unrelated"), "preserve", 0644)
				args := []string{filepath.Join(scriptDir, "test.sh"), "fresh-empty"}
				if keep {
					args = append(args, "--keep")
				}
				ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
				defer cancel()
				cmd := exec.CommandContext(ctx, "bash", args...)
				cmd.Env = append(os.Environ(), "BASH_ENV=", "PATH="+filepath.Join(root, "bin")+string(os.PathListSeparator)+os.Getenv("PATH"), "HARNESS_MODE="+mode)
				output, err := cmd.CombinedOutput()
				if mode == "success" && err != nil || mode != "success" && err == nil {
					t.Fatalf("harness error=%v for %s: %s", err, mode, output)
				}
				entries, err := os.ReadDir(filepath.Join(root, ".tmp"))
				if err != nil {
					t.Fatal(err)
				}
				workspaces := 0
				for _, entry := range entries {
					if entry.IsDir() {
						workspaces++
					}
				}
				want := 0
				if keep {
					want = 1
				}
				if workspaces != want {
					t.Errorf("retained %d workspaces, want %d (keep=%t): %s", workspaces, want, keep, output)
				}
				if got := readFixture(t, filepath.Join(root, ".tmp", "unrelated")); got != "preserve" {
					t.Errorf("unrelated scratch changed: %q", got)
				}
			})
		}
	}
}

const harnessInstallFixture = `#!/bin/bash
set -euo pipefail
case "$HARNESS_MODE" in
  failure) echo 'Simulated bootstrap failure'; exit 7 ;;
  terminate) kill -TERM "$PPID"; exit 143 ;;
esac
mkdir -p .generated/node_modules/@alexgorbatchev/dotfiles node_modules/@alexgorbatchev/dotfiles
touch .generated/node_modules/@alexgorbatchev/dotfiles/index.d.ts .generated/tool-types.d.ts dotfiles.config.ts
printf '#!/bin/bash\ncurl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash\n' >dotfiles-init.sh
chmod +x dotfiles-init.sh
printf '%s\n' 'No dotfiles config found' 'dotfiles bootstrap complete' 'Generating shims and shell configuration' 'Next Step: Connect dotfiles to your shell' 'source "$HOME/.generated/main.bash"'
`
