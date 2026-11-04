// Package harness hands work to an AI coding harness: the command a project configures
// under ai.harness, run with a generated prompt in place of its placeholder element.
package harness

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"slices"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// Placeholder is the ai.harness element that is replaced with the prompt. Only an
// element equal to it is replaced; text that merely contains it is passed unchanged.
const Placeholder = "PROMPT"

// ErrNotConfigured reports a project configuration that names no harness.
var ErrNotConfigured = errors.New(`no AI harness is configured: set ai.harness in the project configuration, for example ai: { harness: ["claude", "PROMPT"] }`)

// Argv returns the configured harness command with every element equal to Placeholder
// replaced by prompt. The result is an argument vector for direct execution, so the
// prompt reaches the harness as a single argument however it is worded.
func Argv(command []string, prompt string) ([]string, error) {
	if len(command) == 0 {
		return nil, ErrNotConfigured
	}
	if command[0] == "" || command[0] == Placeholder {
		return nil, fmt.Errorf("ai.harness must start with the harness executable, got %q", command[0])
	}
	if !slices.Contains(command, Placeholder) {
		return nil, fmt.Errorf("ai.harness %q has no %q element to receive the prompt", command, Placeholder)
	}
	argv := make([]string, len(command))
	for i, arg := range command {
		if arg == Placeholder {
			arg = prompt
		}
		argv[i] = arg
	}
	return argv, nil
}

// Streams are the standard streams the harness is attached to.
type Streams struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
}

// ExitError reports a harness that ran and exited with a nonzero status.
type ExitError struct {
	// Name is the harness executable as configured.
	Name string
	// Code is the status the harness exited with.
	Code int
	err  error
}

func (e *ExitError) Error() string {
	return fmt.Sprintf("AI harness %s exited with status %d", e.Name, e.Code)
}

func (e *ExitError) Unwrap() error { return e.err }

// Run executes argv in dir, attached to streams, and waits for it to exit. A harness that
// exits with a nonzero status is reported as an *ExitError carrying that status.
//
// A harness is usually an interactive program, so it shares the caller's terminal: it is
// not moved to a process group of its own, which would cut it off from the terminal, and
// it is given no timeout. While it runs, an interrupt typed at the terminal is left to
// the harness, which receives it from the terminal directly, rather than terminating the
// CLI and orphaning a harness that treats the interrupt as "cancel this step".
func Run(ctx context.Context, runner exec.CommandRunner, argv []string, dir string, streams Streams) error {
	interrupts := make(chan os.Signal, 1)
	signal.Notify(interrupts, os.Interrupt)
	defer signal.Stop(interrupts)

	cmd := runner.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.SetDir(dir)
	cmd.SetStdin(streams.Stdin)
	cmd.SetStdout(streams.Stdout)
	cmd.SetStderr(streams.Stderr)

	err := cmd.Run()
	if err == nil {
		return nil
	}
	var exited interface{ ExitCode() int }
	if errors.As(err, &exited) && exited.ExitCode() > 0 {
		return &ExitError{Name: argv[0], Code: exited.ExitCode(), err: err}
	}
	return fmt.Errorf("running AI harness %s: %w", argv[0], err)
}
