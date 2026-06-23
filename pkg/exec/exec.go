package exec

import (
	"context"
	"io"
)

// Cmd abstracts a terminal command to be executed.
type Cmd interface {
	// Run starts the specified command and waits for it to complete.
	Run() error
	// Start starts the specified command but does not wait for it to complete.
	Start() error
	// Wait waits for the command to exit. It must have been started by Start.
	Wait() error
	// Output runs the command and returns its standard output.
	Output() ([]byte, error)
	// CombinedOutput runs the command and returns its combined standard output and standard error.
	CombinedOutput() ([]byte, error)

	// SetDir sets the working directory of the command.
	SetDir(dir string)
	// SetEnv sets the environment of the command.
	SetEnv(env []string)
	// SetStdin sets the standard input of the command.
	SetStdin(r io.Reader)
	// SetStdout sets the standard output of the command.
	SetStdout(w io.Writer)
	// SetStderr sets the standard error of the command.
	SetStderr(w io.Writer)

	// Dir returns the working directory of the command.
	Dir() string
	// Env returns the environment of the command.
	Env() []string
	// Stdin returns the standard input of the command.
	Stdin() io.Reader
	// Stdout returns the standard output of the command.
	Stdout() io.Writer
	// Stderr returns the standard error of the command.
	Stderr() io.Writer
}

// CommandRunner abstracts the creation of executable commands.
type CommandRunner interface {
	// Command returns the Cmd struct to execute the named program with the given arguments.
	Command(name string, arg ...string) Cmd
	// CommandContext is like Command but includes a context.
	CommandContext(ctx context.Context, name string, arg ...string) Cmd
}
