package harness

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// helperEnv selects the harness stand-in TestMain runs instead of the tests, so the
// tests can execute a real child process without depending on any installed program.
const helperEnv = "DOTFILES_HARNESS_TEST_HELPER"

// TestMain turns the test binary into a stand-in harness when helperEnv is set. The
// stand-in echoes its arguments and working directory, copies stdin to stdout until
// a line reading "exit N" (or end of input), and exits with N.
func TestMain(m *testing.M) {
	if os.Getenv(helperEnv) != "1" {
		os.Exit(m.Run())
	}
	runHelperHarness()
}

func runHelperHarness() {
	args := os.Args[1:]
	for i, arg := range args {
		if arg == "--" {
			args = args[i+1:]
			break
		}
	}
	dir, _ := os.Getwd()
	fmt.Printf("args=%q\ndir=%s\nready\n", args, dir)
	fmt.Fprintln(os.Stderr, "harness stderr")
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		if code, ok := strings.CutPrefix(line, "exit "); ok {
			n, err := strconv.Atoi(code)
			if err != nil {
				os.Exit(99)
			}
			os.Exit(n)
		}
		fmt.Println("echo " + line)
	}
	os.Exit(0)
}

// helperCommand returns a harness command that runs the stand-in harness.
func helperCommand(t *testing.T, args ...string) []string {
	t.Helper()
	t.Setenv(helperEnv, "1")
	return append([]string{os.Args[0], "-test.run=^$", "--"}, args...)
}

func TestArgv(t *testing.T) {
	tests := []struct {
		name    string
		command []string
		want    []string
		wantErr string
	}{
		{name: "replaces the placeholder element", command: []string{"claude", "-p", "PROMPT"}, want: []string{"claude", "-p", "the prompt"}},
		{name: "replaces every placeholder element", command: []string{"h", "PROMPT", "--again", "PROMPT"}, want: []string{"h", "the prompt", "--again", "the prompt"}},
		{name: "keeps text that only contains the placeholder", command: []string{"h", "--prompt=PROMPT", "PROMPT"}, want: []string{"h", "--prompt=PROMPT", "the prompt"}},
		{name: "unconfigured", command: nil, wantErr: ErrNotConfigured.Error()},
		{name: "empty list", command: []string{}, wantErr: ErrNotConfigured.Error()},
		{name: "no placeholder", command: []string{"claude", "-p"}, wantErr: `ai.harness ["claude" "-p"] has no "PROMPT" element to receive the prompt`},
		{name: "placeholder as the executable", command: []string{"PROMPT"}, wantErr: `ai.harness must start with the harness executable, got "PROMPT"`},
		{name: "empty executable", command: []string{"", "PROMPT"}, wantErr: `ai.harness must start with the harness executable, got ""`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Argv(tt.command, "the prompt")
			if tt.wantErr != "" {
				if err == nil || err.Error() != tt.wantErr {
					t.Fatalf("Argv(%q) error = %v, want %q", tt.command, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Argv(%q): %v", tt.command, err)
			}
			if strings.Join(got, "\x00") != strings.Join(tt.want, "\x00") {
				t.Fatalf("Argv(%q) = %q, want %q", tt.command, got, tt.want)
			}
		})
	}
}

func TestArgvLeavesTheConfiguredCommandUnchanged(t *testing.T) {
	command := []string{"claude", "PROMPT"}
	if _, err := Argv(command, "the prompt"); err != nil {
		t.Fatal(err)
	}
	if command[1] != Placeholder {
		t.Fatalf("Argv rewrote the configured command: %q", command)
	}
}

func TestRunAttachesTheHarness(t *testing.T) {
	runner := exec.NewMockRunner()
	stdin := strings.NewReader("input")
	var stdout, stderr strings.Builder
	ctx := context.WithValue(context.Background(), struct{}{}, "marker")

	err := Run(ctx, runner, []string{"claude", "-p", "a prompt"}, "/project", Streams{Stdin: stdin, Stdout: &stdout, Stderr: &stderr})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(runner.History) != 1 {
		t.Fatalf("ran %d commands, want 1", len(runner.History))
	}
	cmd := runner.History[0]
	if cmd.Name != "claude" || strings.Join(cmd.Args, "|") != "-p|a prompt" {
		t.Fatalf("ran %s %q, want claude [-p \"a prompt\"]", cmd.Name, cmd.Args)
	}
	if cmd.Ctx != ctx {
		t.Fatal("harness was not run under the caller's context")
	}
	if cmd.Dir() != "/project" {
		t.Fatalf("dir = %q, want /project", cmd.Dir())
	}
	if cmd.Stdin() != stdin || cmd.Stdout() != &stdout || cmd.Stderr() != &stderr {
		t.Fatal("harness is not attached to the given streams")
	}
	if cmd.ProcessGroup() {
		t.Fatal("harness was moved to its own process group, away from the terminal")
	}
}

type exitCodeError int

func (e exitCodeError) Error() string { return fmt.Sprintf("exit status %d", int(e)) }
func (e exitCodeError) ExitCode() int { return int(e) }

func TestRunReportsFailures(t *testing.T) {
	notFound := errors.New(`exec: "claude": executable file not found in $PATH`)
	tests := []struct {
		name     string
		err      error
		wantCode int
		wantMsg  string
	}{
		{name: "nonzero exit status", err: exitCodeError(3), wantCode: 3, wantMsg: "AI harness claude exited with status 3"},
		{name: "killed by a signal", err: exitCodeError(-1), wantMsg: "running AI harness claude: exit status -1"},
		{name: "not started", err: notFound, wantMsg: "running AI harness claude: " + notFound.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			runner.Register("claude", nil, tt.err)
			err := Run(context.Background(), runner, []string{"claude", "prompt"}, "", Streams{})
			if err == nil || err.Error() != tt.wantMsg {
				t.Fatalf("Run error = %v, want %q", err, tt.wantMsg)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("Run error %v does not wrap %v", err, tt.err)
			}
			var exitErr *ExitError
			gotCode := 0
			if errors.As(err, &exitErr) {
				gotCode = exitErr.Code
			}
			if gotCode != tt.wantCode {
				t.Fatalf("exit status = %d, want %d", gotCode, tt.wantCode)
			}
		})
	}
}

// The real runner hands the harness the prompt as one argument, the working directory,
// and the caller's streams, and reports the status the harness exits with.
func TestRunExecutesTheHarness(t *testing.T) {
	// The harness reports its working directory with symbolic links resolved.
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prompt := "make a tool for `x` with \"quotes\", $HOME and\nnewlines"
	argv, err := Argv(helperCommand(t, "-p", Placeholder), prompt)
	if err != nil {
		t.Fatal(err)
	}

	for _, tt := range []struct {
		name     string
		stdin    string
		wantCode int
	}{
		{name: "success", stdin: "hello\n"},
		{name: "failure", stdin: "hello\nexit 7\n", wantCode: 7},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr strings.Builder
			err := Run(context.Background(), exec.NewOSRunner(), argv, dir, Streams{Stdin: strings.NewReader(tt.stdin), Stdout: &stdout, Stderr: &stderr})
			var exitErr *ExitError
			switch {
			case tt.wantCode == 0 && err != nil:
				t.Fatalf("Run: %v", err)
			case tt.wantCode != 0 && (!errors.As(err, &exitErr) || exitErr.Code != tt.wantCode):
				t.Fatalf("Run error = %v, want exit status %d", err, tt.wantCode)
			}
			want := fmt.Sprintf("args=%q\ndir=%s\nready\necho hello\n", []string{"-p", prompt}, dir)
			if stdout.String() != want {
				t.Fatalf("harness stdout = %q, want %q", stdout.String(), want)
			}
			if stderr.String() != "harness stderr\n" {
				t.Fatalf("harness stderr = %q", stderr.String())
			}
		})
	}
}
