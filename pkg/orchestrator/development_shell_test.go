package orchestrator

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
)

func TestDevelopmentShellUsesShimAndKeepsBootstrapHelper(t *testing.T) {
	for _, name := range []string{"dotfiles", "local--cli"} {
		t.Run(name, func(t *testing.T) {
			o, mem, project, _, _ := developmentFixture(t)
			t.Setenv("DOTFILES_CLI_COMMAND", "")
			t.Setenv("DOTFILES_REPO_ROOT", "")
			tool := &config.ToolConfig{Name: name, Binaries: testutil.DeclaredBinaries("dotfiles")}
			o.cacheTools = []*config.ToolConfig{tool}
			record, err := o.developmentStore(project).Use(context.Background(), name, devtools.UseOptions{Binaries: map[string]string{"dotfiles": "/build/example"}})
			if err != nil {
				t.Fatal(err)
			}
			shim := filepath.Join(project.Paths.TargetDir, "dotfiles")
			if err := mem.MkdirAll(project.Paths.TargetDir, 0755); err != nil {
				t.Fatal(err)
			}
			if err := mem.WriteFile(shim, []byte("shim"), 0755); err != nil {
				t.Fatal(err)
			}
			if args, search := o.shellCLIArgsForProject(project); len(args) != 1 || args[0] != shim || search {
				t.Fatalf("shell invocation = %v, search=%v", args, search)
			}
			if args := o.cliArgsForProject(project); len(args) != 1 || args[0] != record.Binaries["dotfiles"] {
				t.Fatalf("shim bootstrap would recurse: %v", args)
			}
			if err := mem.Remove(shim); err != nil {
				t.Fatal(err)
			}
			if command := o.CliCommandForShell("bash", project); command != "command dotfiles" {
				t.Fatalf("removed CLI POSIX invocation = %q", command)
			}
			if command := o.CliCommandForShell("powershell", project); command != "(Get-Command dotfiles -CommandType Application -ErrorAction Stop).Source" {
				t.Fatalf("removed CLI PowerShell invocation = %q", command)
			}
			t.Setenv("DOTFILES_CLI_COMMAND", record.Binaries["dotfiles"])
			if args, search := o.shellCLIArgsForProject(project); args[0] != record.Binaries["dotfiles"] || search {
				t.Fatalf("explicit command changed: %v, search=%v", args, search)
			}
			t.Setenv("DOTFILES_CLI_COMMAND", "")
			t.Setenv("DOTFILES_REPO_ROOT", "/source")
			t.Setenv("DOTFILES_E2E_TEST", "")
			if args, search := o.shellCLIArgsForProject(project); strings.Join(args, " ") != "go -C /source run ./cmd/dotfiles" || search {
				t.Fatalf("explicit source changed: %v, search=%v", args, search)
			}
			t.Setenv("DOTFILES_E2E_TEST", "true")
			if args, search := o.shellCLIArgsForProject(project); args[0] != "dotfiles" || !search {
				t.Fatalf("E2E source exemption changed: %v, search=%v", args, search)
			}
		})
	}
}
