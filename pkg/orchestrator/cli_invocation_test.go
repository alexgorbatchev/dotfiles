package orchestrator

import (
	"context"
	"fmt"
	"io"
	"os"
	osexec "os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shell"
)

func TestOrchestrator_GetCliArgs(t *testing.T) {
	fsys := newMemFS()
	reg := registry.NewRegistry(nil)
	orch := NewOrchestrator(nil, fsys, nil, reg, nil)

	// Case 1: DOTFILES_CLI_COMMAND is set
	t.Setenv("DOTFILES_CLI_COMMAND", "custom-cli-command")
	cmd := orch.getCliArgs()[0]
	if cmd != "custom-cli-command" {
		t.Errorf("expected custom-cli-command, got %q", cmd)
	}

	// Case 2: DOTFILES_CLI_COMMAND is not set, but DOTFILES_E2E_TEST is true
	t.Setenv("DOTFILES_CLI_COMMAND", "")
	t.Setenv("DOTFILES_E2E_TEST", "true")
	cmd = orch.getCliArgs()[0]
	execPath, _ := os.Executable()
	if cmd != execPath {
		t.Errorf("expected %q, got %q", execPath, cmd)
	}
}

func TestOrchestrator_FormatCliCommandForShell(t *testing.T) {
	orch := NewOrchestrator(nil, newMemFS(), nil, registry.NewRegistry(nil), nil)
	project := &config.ProjectConfig{Paths: config.PathsConfig{TargetDir: "/home/user/.generated/bin"}}
	for _, tc := range []struct{ command, posix, powershell string }{
		{"go run /path/to/cmd/dotfiles", "go run /path/to/cmd/dotfiles", "'go' 'run' '/path/to/cmd/dotfiles'"},
		{"go run /path with spaces/cmd/dotfiles", "go run '/path with spaces/cmd/dotfiles'", "'go' 'run' '/path with spaces/cmd/dotfiles'"},
		{`C:\Users\bin\dotfiles`, `'C:\Users\bin\dotfiles'`, `'C:\Users\bin\dotfiles'`},
		{"dotfiles", "command dotfiles", "'/home/user/.generated/bin/dotfiles'"},
		{"/virtual/dir with spaces/bin/dotfiles", "'/virtual/dir with spaces/bin/dotfiles'", "'/virtual/dir with spaces/bin/dotfiles'"},
	} {
		t.Run(tc.command, func(t *testing.T) {
			t.Setenv("DOTFILES_CLI_COMMAND", tc.command)
			for _, sh := range []string{"bash", "zsh", "powershell"} {
				want := tc.posix
				if sh == "powershell" {
					want = tc.powershell
				}
				if got := orch.CliCommandForShell(sh, project); got != want {
					t.Errorf("%s = %q, want %q", sh, got, want)
				}
			}
		})
	}
}

func TestCliInvocationNeedsExplicitDevelopmentRoot(t *testing.T) {
	orch := NewOrchestrator(nil, newMemFS(), nil, registry.NewRegistry(nil), nil)
	t.Setenv("DOTFILES_CLI_COMMAND", "")
	t.Setenv("DOTFILES_REPO_ROOT", "")
	t.Setenv("DOTFILES_E2E_TEST", "")
	if os.Getenv("DOTFILES_TEST_CLI_PATH") == "1" {
		fmt.Print(orch.getCliArgs()[0])
		os.Exit(0)
	}
	// A compiled executable under a temp directory with every former heuristic
	// marker must still generate an invocation of that executable.
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	copyPath := filepath.Join(t.TempDir(), "go-build api_test $cash `tick` 'quote' binary")
	if err := os.Link(executable, copyPath); err != nil {
		content, err := os.ReadFile(executable)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(copyPath, content, 0755); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := osexec.CommandContext(ctx, copyPath, "-test.run=^TestCliInvocationNeedsExplicitDevelopmentRoot$")
	cmd.Env = append(os.Environ(), "DOTFILES_TEST_CLI_PATH=1")
	out, err := cmd.CombinedOutput()
	if err != nil || string(out) != copyPath {
		t.Fatalf("installed invocation = %q, %v; want %q", out, err, copyPath)
	}
	root := filepath.Join(t.TempDir(), "source $cash 'quotes'")
	t.Setenv("DOTFILES_REPO_ROOT", root)
	if got := orch.getCliArgs(); strings.Join(got, "\x00") != strings.Join([]string{"go", "-C", root, "run", "./cmd/dotfiles"}, "\x00") {
		t.Fatalf("explicit development invocation = %q", got)
	}
	t.Setenv("DOTFILES_E2E_TEST", "true")
	if got := orch.getCliArgs(); len(got) != 1 || got[0] != executable {
		t.Fatalf("E2E invocation = %q", got)
	}
}

func TestGeneratedCliWrappersPreserveLiteralArguments(t *testing.T) {
	stubShell, err := osexec.LookPath("sh")
	if err != nil {
		t.Skip("sh is unavailable for the executable fixture")
	}
	for _, sh := range []string{"bash", "zsh", "powershell"} {
		t.Run(sh, func(t *testing.T) {
			name := sh
			if sh == "powershell" {
				name = "pwsh"
			}
			executable, err := osexec.LookPath(name)
			if err != nil {
				t.Skipf("%s is unavailable: %v", name, err)
			}
			for _, special := range []string{"space name", "$cash", "`tick`", `double"quote`, "single'quote", `back\slash`, "line\nfeed", "non\u00a0breaking"} {
				t.Run(special, func(t *testing.T) {
					p := newBashRuntimeProject(t)
					cli := filepath.Join(p.homeDir, "cli-"+special)
					if err := os.WriteFile(cli, []byte("#!"+stubShell+"\nprintf '%s\\000' \"$@\" \"${DOTFILES_TEST_SOURCE:?source missing}\" > \"$DOTFILES_TEST_RECORD\"\n"), 0755); err != nil {
						t.Fatal(err)
					}
					t.Setenv("DOTFILES_CLI_COMMAND", cli)
					p.orch.configFilePath = filepath.Join(p.homeDir, "config-"+special+".ts")
					sourceName := "source-" + special
					sourceContent := "export DOTFILES_TEST_SOURCE=loaded\n"
					if sh == "powershell" {
						// PowerShell treats backslashes as directory separators.
						if special == `back\slash` {
							sourceName = "source-backslash"
						}
						sourceName += ".ps1"
						sourceContent = "$env:DOTFILES_TEST_SOURCE = 'loaded'\n"
					}
					sourcePath := filepath.Join(p.homeDir, sourceName)
					if err := os.WriteFile(sourcePath, []byte(sourceContent), 0644); err != nil {
						t.Fatal(err)
					}
					stc := &config.ShellTypeConfig{Scripts: []config.ShellScript{{Kind: "sourceFile", Value: sourcePath}}}
					tool := &config.ToolConfig{Name: "source-probe", ConfigFilePath: p.orch.configFilePath, ShellConfigs: &config.ShellConfigs{Bash: stc, Zsh: stc, Powershell: stc}}
					if err := p.orch.generateShellScripts(context.Background(), []*config.ToolConfig{tool}, p.projCfg); err != nil {
						t.Fatal(err)
					}
					ext := sh
					quote := shell.Quote
					prefix := "source "
					flags := []string{"--noprofile", "--norc", "-c"}
					if sh == "zsh" {
						flags = []string{"-f", "-c"}
					}
					if sh == "powershell" {
						ext = "ps1"
						quote = shell.QuotePowerShell
						prefix = ". "
						flags = []string{"-NoLogo", "-NoProfile", "-NonInteractive", "-Command"}
					}
					script := prefix + quote(filepath.Join(p.projCfg.Paths.ShellScriptsDir, "main."+ext)) + "; dotfiles probe " + quote(special)
					record := filepath.Join(p.homeDir, "args")
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()
					cmd := osexec.CommandContext(ctx, executable, append(flags, script)...)
					cmd.Env = append(os.Environ(), "DOTFILES_TEST_RECORD="+record, "DOTFILES_TEST_SOURCE=")
					out, err := cmd.CombinedOutput()
					if err != nil {
						t.Fatalf("%s wrapper failed: %v\n%s", sh, err, out)
					}
					got, err := os.ReadFile(record)
					want := strings.Join([]string{"--config", p.orch.configFilePath, "probe", special, "loaded", ""}, "\x00")
					if err != nil || string(got) != want {
						t.Fatalf("arguments = %q, %v; want %q", got, err, want)
					}
				})
			}
		})
	}
}

func TestDevelopmentCliRunsOutsideSourceModule(t *testing.T) {
	if _, err := osexec.LookPath("go"); err != nil {
		t.Skip("go is unavailable")
	}
	root := filepath.Join(t.TempDir(), "source $cash 'quoted'")
	if err := os.MkdirAll(filepath.Join(root, "cmd", "dotfiles"), 0755); err != nil {
		t.Fatal(err)
	}
	for path, content := range map[string]string{
		filepath.Join(root, "go.mod"):                     "module example.test/cli\ngo 1.23\n",
		filepath.Join(root, "cmd", "dotfiles", "main.go"): "package main\nimport (\"fmt\"; \"os\")\nfunc main() { fmt.Printf(\"%s|%s\", os.Args[1], os.Getenv(\"DOTFILES_REPO_ROOT\")) }\n",
	} {
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("DOTFILES_CLI_COMMAND", "")
	t.Setenv("DOTFILES_REPO_ROOT", root)
	t.Setenv("DOTFILES_E2E_TEST", "")
	orch := NewOrchestrator(nil, newMemFS(), nil, registry.NewRegistry(nil), nil)
	for _, sh := range []string{"bash", "zsh", "powershell"} {
		t.Run(sh, func(t *testing.T) {
			name := sh
			flags := []string{"--noprofile", "--norc", "-c"}
			if sh == "zsh" {
				flags = []string{"-f", "-c"}
			}
			if sh == "powershell" {
				name = "pwsh"
				flags = []string{"-NoLogo", "-NoProfile", "-NonInteractive", "-Command"}
			}
			executable, err := osexec.LookPath(name)
			if err != nil {
				t.Skipf("%s unavailable: %v", name, err)
			}
			command := orch.CliCommandForShell(sh, nil) + " 'dev argument'"
			if sh == "powershell" {
				command = "& " + command + "; if ($env:DOTFILES_REPO_ROOT -ne 'caller value') { exit 34 }"
			} else {
				command += "; [[ $DOTFILES_REPO_ROOT == 'caller value' ]] || exit 34"
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			cmd := osexec.CommandContext(ctx, executable, append(flags, command)...)
			cmd.Dir = t.TempDir()
			// A future shell must use the generated root without retaining it after
			// invocation or relying on the environment of the original Just recipe.
			cmd.Env = append(os.Environ(), "DOTFILES_REPO_ROOT=caller value")
			output, err := cmd.CombinedOutput()
			if err != nil || string(output) != "dev argument|"+root {
				t.Fatalf("development invocation from unrelated directory: %q, %v", output, err)
			}
		})
	}
}

func TestAutoInstallAndCliCommandHelpers(t *testing.T) {
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	orch := NewOrchestrator(logger.New(logger.Config{Writer: io.Discard}), memFS, runner, nil, nil)

	// isAutoInstall
	if isAutoInstall(nil) {
		t.Error("expected false for nil tool in isAutoInstall")
	}
	tAuto := &config.ToolConfig{
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"auto": true,
		},
	}
	if !isAutoInstall(tAuto) {
		t.Error("expected true for auto: true in InstallParams")
	}

	tAutoStr := &config.ToolConfig{
		InstallationMethod: "manual",
		InstallParams: map[string]interface{}{
			"auto": "true",
		},
	}
	if !isAutoInstall(tAutoStr) {
		t.Error("expected true for auto: 'true' in InstallParams")
	}

	// getCliArgs with env var override
	t.Setenv("DOTFILES_CLI_COMMAND", "dotfiles-custom")
	if got := orch.getCliArgs()[0]; got != "dotfiles-custom" {
		t.Errorf("getCliArgs with env override = %q, want 'dotfiles-custom'", got)
	}
}

func TestGetCliArgsAndFormatPathCoverage(t *testing.T) {
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	// 1. formatPath with nil / empty HomeDir
	if got := orch.formatPath(nil, "/some/path"); got != "/some/path" {
		t.Errorf("formatPath nil = %q, want /some/path", got)
	}
	if got := orch.formatPath(&config.ProjectConfig{}, "/some/path"); got != "/some/path" {
		t.Errorf("formatPath empty home = %q, want /some/path", got)
	}

	// 2. getCliArgs with DOTFILES_CLI_COMMAND set
	t.Setenv("DOTFILES_CLI_COMMAND", "custom-dotfiles-cli")
	if cmd := orch.getCliArgs()[0]; cmd != "custom-dotfiles-cli" {
		t.Errorf("getCliArgs = %q, want custom-dotfiles-cli", cmd)
	}

	// 3. getCliArgs with DOTFILES_E2E_TEST set
	t.Setenv("DOTFILES_CLI_COMMAND", "")
	t.Setenv("DOTFILES_E2E_TEST", "true")
	if cmd := orch.getCliArgs()[0]; cmd == "" {
		t.Error("expected non-empty getCliArgs in E2E mode")
	}
}
