package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/shell"
)

// Run off from the copied executable: os.Executable then names the retained dev
// generation, which must remain a bootstrap helper without pinning shell routing.
func TestCopiedDevelopmentCLIOffRestoresShellRouting(t *testing.T) {
	bash, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash is unavailable")
	}
	cli := sharedDevBin(t)
	for _, name := range []string{"dotfiles", "local--cli", "internal-only"} {
		t.Run(name, func(t *testing.T) {
			target := newConfiguredTarget(t, `export default {paths: {
  dotfilesDir: "./", toolConfigsDir: "./tools", generatedDir: "./.generated", targetDir: "./target"
}};`)
			tool := name
			if name == "internal-only" {
				tool = "dotfiles"
			} else {
				writeTestFile(t, filepath.Join(target, "tools", name+".tool.ts"), `import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install) => install("github-release", {repo: "owner/dotfiles"}).bin("dotfiles"));`, 0644)
			}
			if err := os.MkdirAll(filepath.Join(target, "tools"), 0755); err != nil {
				t.Fatal(err)
			}
			externalDir := filepath.Join(target, "external")
			release := filepath.Join(target, ".generated", "binaries", tool, "current", "dotfiles")
			if name == "internal-only" {
				release = filepath.Join(externalDir, "dotfiles")
			}
			writeTestFile(t, release, "#!/bin/sh\nprintf 'release-version\\n'\n", 0755)
			configPath := filepath.Join(target, "dotfiles.config.ts")
			run := func(executable string, args ...string) []byte {
				t.Helper()
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				cmd := exec.CommandContext(ctx, executable, args...)
				cmd.Dir = target
				cmd.Env = append(os.Environ(), "DOTFILES_CLI_COMMAND=", "DOTFILES_REPO_ROOT=", "DOTFILES_E2E_TEST=true", "PATH="+externalDir+string(os.PathListSeparator)+os.Getenv("PATH"))
				out, err := cmd.CombinedOutput()
				if err != nil {
					t.Fatalf("%s %v: %v\n%s", executable, args, err, out)
				}
				return out
			}
			run(cli, "--config", configPath, "tool", "dev", "use", "dotfiles", "--bin", "dotfiles="+cli)
			store := devtools.New(fs.NewOSFS(), filepath.Join(target, ".generated", "dev-tools"))
			record, err := store.Lookup(tool)
			if err != nil || record == nil {
				t.Fatalf("development registration = %#v, %v", record, err)
			}
			run(record.Binaries["dotfiles"], "--config", configPath, "tool", "dev", "off", "dotfiles")
			mainShell := filepath.Join(target, ".generated", "shell-scripts", "main.bash")
			out := run(bash, "--noprofile", "--norc", "-c", fmt.Sprintf("source %s; dotfiles self version", shell.Quote(mainShell)))
			if strings.TrimSpace(string(out)) != "release-version" {
				t.Fatalf("shell retained the disabled development CLI: %s", out)
			}
			if name != "internal-only" {
				shim, err := os.ReadFile(filepath.Join(target, "target", "dotfiles"))
				if err != nil || !strings.Contains(string(shim), record.Binaries["dotfiles"]) {
					t.Fatalf("release shim lost its retained installation helper: %v\n%s", err, shim)
				}
			} else if _, err := os.Lstat(filepath.Join(target, "target", "dotfiles")); !os.IsNotExist(err) {
				t.Fatalf("internal-only off retained its shim: %v", err)
			}
		})
	}
}
