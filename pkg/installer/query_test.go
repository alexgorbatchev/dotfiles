package installer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// exitStatusError stands in for *os/exec.ExitError, which only a process that really
// ran can produce: like it, it reports the status the mocked command exited with.
type exitStatusError int

func (e exitStatusError) Error() string { return fmt.Sprintf("exit status %d", int(e)) }
func (e exitStatusError) ExitCode() int { return int(e) }

// registerQuery makes every run of the command name print stdout and stderr and end
// with err, which is nil for exit status 0 and an exitStatusError for any other status.
func registerQuery(runner *exec.MockRunner, name, stdout, stderr string, err error) {
	runner.RegisterFunc(name, func(c *exec.MockCmd) error {
		c.SetOutput([]byte(stdout))
		if stderr != "" && c.Stderr() != nil {
			_, _ = io.WriteString(c.Stderr(), stderr)
		}
		return err
	})
}

// assertCheckFailed fails the test unless CheckUpdate returned an error containing every
// one of wantText and no result beside it: a failed check must never come back as a
// result, which callers read as "up to date".
func assertCheckFailed(t *testing.T, res *UpdateCheckResult, err error, wantText ...string) {
	t.Helper()
	if err == nil {
		t.Fatalf("CheckUpdate() = %+v, nil; want an error", res)
	}
	if errors.Is(err, ErrUpdateCheckUnsupported) {
		t.Errorf("CheckUpdate() = %v; a failed check is not an unsupported one", err)
	}
	if res != nil {
		t.Errorf("CheckUpdate() result = %+v, want nil alongside the error", res)
	}
	for _, want := range wantText {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("CheckUpdate() error = %q, want it to contain %q", err, want)
		}
	}
}

// queryHelperEnv makes the test binary act as a query command instead of running tests;
// see TestQueryHelperProcess.
const queryHelperEnv = "DOTFILES_QUERY_HELPER_EXIT"

// TestQueryHelperProcess is not a test: run by TestRunQuery_OSRunner as a subprocess, it
// prints to both streams and exits with the status the environment names.
func TestQueryHelperProcess(t *testing.T) {
	status := os.Getenv(queryHelperEnv)
	if status == "" {
		return
	}
	code, err := strconv.Atoi(status)
	if err != nil {
		os.Exit(2)
	}
	fmt.Fprint(os.Stdout, "listed\n")
	fmt.Fprint(os.Stderr, "warned\n")
	os.Exit(code)
}

// TestRunQuery_OSRunner pins that the exit status of a real process reaches exitCode
// through the production runner, which the update checks of dnf and pacman depend on.
func TestRunQuery_OSRunner(t *testing.T) {
	for _, code := range []int{0, 1, 100} {
		t.Run(strconv.Itoa(code), func(t *testing.T) {
			t.Setenv(queryHelperEnv, strconv.Itoa(code))
			args := []string{"-test.run=^TestQueryHelperProcess$"}
			r := runQuery(exec.NewOSRunner().CommandContext(context.Background(), os.Args[0], args...), os.Args[0], args...)
			got, exited := r.exitCode()
			if got != code || !exited {
				t.Fatalf("exitCode() = %d, %v; want %d, true (err: %v)", got, exited, code, r.err)
			}
			if r.stdout != "listed\n" || r.stderr != "warned\n" {
				t.Errorf("runQuery() streams = %q, %q; want %q, %q", r.stdout, r.stderr, "listed\n", "warned\n")
			}
		})
	}
}

func TestRunQuery(t *testing.T) {
	errNotFound := errors.New(`exec: "dnf": executable file not found in $PATH`)
	tests := []struct {
		name       string
		stdout     string
		stderr     string
		err        error
		wantCode   int
		wantExited bool
		wantFail   []string
	}{
		{
			name:       "a command that succeeded",
			stdout:     "1.2.3\n",
			wantExited: true,
			wantFail:   []string{"running dnf check-update ripgrep: something odd: 1.2.3"},
		},
		{
			name:       "a non-zero exit status keeps both streams",
			stdout:     "partial\n",
			stderr:     "Error: No matching Packages to list\n",
			err:        exitStatusError(1),
			wantCode:   1,
			wantExited: true,
			wantFail:   []string{"running dnf check-update ripgrep: exit status 1: Error: No matching Packages to list"},
		},
		{
			name:     "a command that never ran has no exit status",
			err:      errNotFound,
			wantFail: []string{"running dnf check-update ripgrep: ", "executable file not found"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			registerQuery(runner, "dnf", tt.stdout, tt.stderr, tt.err)

			args := []string{"check-update", "ripgrep"}
			r := runQuery(runner.CommandContext(context.Background(), "dnf", args...), "dnf", args...)
			if r.stdout != tt.stdout || r.stderr != tt.stderr {
				t.Errorf("runQuery() streams = %q, %q; want %q, %q", r.stdout, r.stderr, tt.stdout, tt.stderr)
			}
			code, exited := r.exitCode()
			if code != tt.wantCode || exited != tt.wantExited {
				t.Errorf("exitCode() = %d, %v; want %d, %v", code, exited, tt.wantCode, tt.wantExited)
			}

			cause := tt.err
			if cause == nil {
				cause = errors.New("something odd")
			}
			err := r.fail(cause)
			if !errors.Is(err, cause) {
				t.Errorf("fail() = %v; want it to wrap %v", err, cause)
			}
			for _, want := range tt.wantFail {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("fail() = %q; want it to contain %q", err, want)
				}
			}
		})
	}
}

// TestQueryResultRefuse pins that refuse names the command and wraps its cause but
// leaves out what the command printed, which fail would append.
func TestQueryResultRefuse(t *testing.T) {
	r := queryResult{command: "apt-cache policy jq", stdout: "jq:\n  Installed: (none)\n", stderr: "W: noise\n"}
	cause := errors.New("apt package jq is not installed")
	err := r.refuse(cause)
	if !errors.Is(err, cause) {
		t.Errorf("refuse() = %v; want it to wrap %v", err, cause)
	}
	if want := "running apt-cache policy jq: apt package jq is not installed"; err.Error() != want {
		t.Errorf("refuse() = %q, want %q", err, want)
	}
}

// TestShellCommandLine pins that the command an update-check error names can be pasted
// into a shell as it is printed, on one line.
func TestShellCommandLine(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{name: "plain words", args: []string{"npm", "view", "@acme/cli", "version"}, want: "npm view @acme/cli version"},
		{name: "a glob", args: []string{"dnf", "check-update", dnfFailUnavailableRepos, "bash"}, want: "dnf check-update '--setopt=*.skip_if_unavailable=False' bash"},
		{name: "a newline", args: []string{"rpm", "-q", "--qf", rpmVersionFormat, "zsh"}, want: "rpm -q --qf $'%{VERSION}-%{RELEASE}\\n' zsh"},
		{name: "a single quote and a space", args: []string{"echo", "it's here"}, want: `echo 'it'\''s here'`},
		{name: "a control character with quotes", args: []string{"x", "a'\\\tb\x01"}, want: `x $'a\'\\\tb\x01'`},
		{name: "non-ASCII bytes beside a control character", args: []string{"x", "é\u0085\xff\n"}, want: "x $'é\u0085\xff\\n'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shellCommandLine(tt.args[0], tt.args[1:]...); got != tt.want {
				t.Errorf("shellCommandLine(%q) = %q, want %q", tt.args, got, tt.want)
			}
		})
	}
}
