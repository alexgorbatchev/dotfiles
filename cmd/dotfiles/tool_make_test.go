package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/harness"
)

// stubHarnessEnv makes the test binary act as an AI harness (see TestMain): it records
// what it was started with in the file the variable names, so a test can run tool make
// end to end without any real harness installed.
const stubHarnessEnv = "DOTFILES_STUB_HARNESS"

// stubHarnessExitEnv is the status the stub harness exits with.
const stubHarnessExitEnv = "DOTFILES_STUB_HARNESS_EXIT"

// stubHarnessRun is what the stub harness records about the one run.
type stubHarnessRun struct {
	Args  []string `json:"args"`
	Dir   string   `json:"dir"`
	Stdin string   `json:"stdin"`
}

func runStubHarness() {
	stdin, _ := io.ReadAll(os.Stdin)
	dir, _ := os.Getwd()
	record, _ := json.Marshal(stubHarnessRun{Args: os.Args[1:], Dir: dir, Stdin: string(stdin)})
	if err := os.WriteFile(os.Getenv(stubHarnessEnv), record, 0644); err != nil {
		os.Exit(98)
	}
	fmt.Println("stub harness output")
	fmt.Fprintln(os.Stderr, "stub harness diagnostics")
	code, _ := strconv.Atoi(os.Getenv(stubHarnessExitEnv))
	os.Exit(code)
}

// stubCLI is the CLI command the prompt names in tests: DOTFILES_CLI_COMMAND, which
// the orchestrator's CLI resolution honours first, set to a path with a space so the
// prompt has to quote it.
const stubCLI = "/opt/dot files/dotfiles"

// makeProject is a project whose ai.harness runs the stub harness with the given
// arguments after the executable, and the file the stub records its run in.
func makeProject(t *testing.T, harnessArgs ...string) (e2eProject, string) {
	t.Helper()
	p := newE2EProject(t, nil)
	t.Setenv("DOTFILES_CLI_COMMAND", stubCLI)
	// The real runner, so the stub harness is actually started.
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	record := filepath.Join(t.TempDir(), "run.json")
	t.Setenv(stubHarnessEnv, record)
	command, err := json.Marshal(append([]string{os.Args[0]}, harnessArgs...))
	if err != nil {
		t.Fatal(err)
	}
	p.ConfigPath = p.writeConfig(t, nil, "", fmt.Sprintf(`"ai": {"harness": %s}`, command))
	return p, record
}

func readStubHarnessRun(t *testing.T, record string) stubHarnessRun {
	t.Helper()
	data, err := os.ReadFile(record)
	if err != nil {
		t.Fatalf("the harness did not run: %v", err)
	}
	var run stubHarnessRun
	if err := json.Unmarshal(data, &run); err != nil {
		t.Fatal(err)
	}
	return run
}

func resolvePath(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func TestToolMakeRunsTheHarness(t *testing.T) {
	p, record := makeProject(t, "-p", harness.Placeholder, "--verbose")
	rootCmd.SetIn(strings.NewReader("typed by the user"))
	t.Cleanup(func() { rootCmd.SetIn(nil) })

	out, err := p.run("tool", "make", "https://github.com/muesli/duf", "with", "config")
	if err != nil {
		t.Fatalf("tool make: %v\n%s", err, out.Combined)
	}

	run := readStubHarnessRun(t, record)
	wantPrompt := harness.ToolPrompt(harness.ToolRequest{
		Subject:        "https://github.com/muesli/duf with config",
		ConfigPath:     p.ConfigPath,
		ToolConfigsDir: filepath.Join(p.Root, "tools"),
		CLI:            `"` + stubCLI + `"`,
	})
	if len(run.Args) != 3 || run.Args[0] != "-p" || run.Args[1] != wantPrompt || run.Args[2] != "--verbose" {
		t.Fatalf("harness arguments = %q, want [-p <prompt> --verbose] with prompt\n%s", run.Args, wantPrompt)
	}
	if resolvePath(t, run.Dir) != resolvePath(t, p.Root) {
		t.Fatalf("harness ran in %s, want the configuration's directory %s", run.Dir, p.Root)
	}
	if run.Stdin != "typed by the user" {
		t.Fatalf("harness stdin = %q, want the command's input", run.Stdin)
	}
	if out.Stdout != "stub harness output\n" {
		t.Fatalf("stdout = %q, want the harness's output only", out.Stdout)
	}
	if out.Stderr != "stub harness diagnostics\n" {
		t.Fatalf("stderr = %q, want the harness's diagnostics only", out.Stderr)
	}
}

func TestToolMakeExitsWithTheHarnessStatus(t *testing.T) {
	p, record := makeProject(t, harness.Placeholder)
	t.Setenv(stubHarnessExitEnv, "3")
	previousExit := exitFunc
	t.Cleanup(func() { exitFunc = previousExit })
	exitCode := -1
	exitFunc = func(code int) { exitCode = code }
	var output bytes.Buffer
	rootCmd.SetErr(&output)
	rootCmd.SetOut(&output)
	rootCmd.SetIn(strings.NewReader(""))
	t.Cleanup(func() { rootCmd.SetIn(nil) })
	resetFlags(rootCmd)
	rootCmd.SetArgs([]string{"--config", p.ConfigPath, "tool", "make", "duf"})

	main()

	if exitCode != 3 {
		t.Fatalf("exit code = %d, want the harness's 3", exitCode)
	}
	readStubHarnessRun(t, record)
	wantError := fmt.Sprintf("AI harness %s exited with status 3", os.Args[0])
	if strings.Count(output.String(), wantError) != 1 {
		t.Fatalf("output does not report %q exactly once:\n%s", wantError, output.String())
	}
}

func TestToolMakeRejectsUnusableHarnessConfiguration(t *testing.T) {
	tests := []struct {
		name    string
		project string
		wantErr string
	}{
		{name: "not configured", project: "", wantErr: harness.ErrNotConfigured.Error()},
		{name: "empty", project: `"ai": {"harness": []}`, wantErr: harness.ErrNotConfigured.Error()},
		{name: "no placeholder", project: `"ai": {"harness": ["claude", "-p"]}`, wantErr: `ai.harness ["claude" "-p"] has no "PROMPT" element to receive the prompt`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := newE2EProject(t, nil)
			p.ConfigPath = p.writeConfig(t, nil, "", tt.project)
			out, err := p.run("tool", "make", "duf")
			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("tool make error = %v, want %q\n%s", err, tt.wantErr, out.Combined)
			}
		})
	}
}

func TestToolMakeRejectsAnEmptyRequest(t *testing.T) {
	p, record := makeProject(t, harness.Placeholder)
	for _, args := range [][]string{{}, {" ", "\t"}} {
		out, err := p.run(append([]string{"tool", "make"}, args...)...)
		if err == nil {
			t.Fatalf("tool make %q succeeded:\n%s", args, out.Combined)
		}
	}
	if _, err := os.Stat(record); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("the harness ran for an empty request: %v", err)
	}
}

func TestToolMakeDryRunPrintsThePrompt(t *testing.T) {
	p, record := makeProject(t, "-p", harness.Placeholder)

	out, err := p.run("tool", "make", "--dry-run", "duf")
	if err != nil {
		t.Fatalf("tool make --dry-run: %v\n%s", err, out.Combined)
	}

	if _, err := os.Stat(record); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("a dry run started the harness: %v", err)
	}
	wantPrompt := harness.ToolPrompt(harness.ToolRequest{Subject: "duf", ConfigPath: p.ConfigPath, ToolConfigsDir: filepath.Join(p.Root, "tools"), CLI: `"` + stubCLI + `"`})
	if out.Stdout != wantPrompt {
		t.Fatalf("stdout = %q, want the prompt %q", out.Stdout, wantPrompt)
	}
	wantLog := fmt.Sprintf("Would run AI harness: %q", []string{os.Args[0], "-p", harness.Placeholder})
	if !strings.Contains(out.Stderr, wantLog) {
		t.Fatalf("stderr = %q, want %q", out.Stderr, wantLog)
	}
}

// A harness executable written relative to the home directory starts, as it would from
// a shell, although no shell runs it.
func TestToolMakeExpandsAHomeRelativeHarness(t *testing.T) {
	p, record := makeProject(t, harness.Placeholder)
	harnessDir := filepath.Join(p.HomeDir, "bin")
	if err := os.MkdirAll(harnessDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(os.Args[0], filepath.Join(harnessDir, "stub-harness")); err != nil {
		t.Fatal(err)
	}
	p.ConfigPath = p.writeConfig(t, nil, "", `"ai": {"harness": ["~/bin/stub-harness", "PROMPT"]}`)

	out, err := p.run("tool", "make", "duf")
	if err != nil {
		t.Fatalf("tool make: %v\n%s", err, out.Combined)
	}
	if run := readStubHarnessRun(t, record); len(run.Args) != 1 || !strings.HasPrefix(run.Args[0], "Create a dotfiles tool configuration file (.tool.ts) for: duf\n") {
		t.Fatalf("harness arguments = %q, want the prompt", run.Args)
	}
}
