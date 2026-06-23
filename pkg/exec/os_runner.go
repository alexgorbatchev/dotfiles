package exec

import (
	"context"
	"io"
	"os/exec"
)

// osCmd wraps an *os/exec.Cmd to satisfy the Cmd interface.
type osCmd struct {
	cmd *exec.Cmd
}

// Run starts the specified command and waits for it to complete.
func (c *osCmd) Run() error {
	return c.cmd.Run()
}

// Start starts the specified command but does not wait for it to complete.
func (c *osCmd) Start() error {
	return c.cmd.Start()
}

// Wait waits for the command to exit. It must have been started by Start.
func (c *osCmd) Wait() error {
	return c.cmd.Wait()
}

// Output runs the command and returns its standard output.
func (c *osCmd) Output() ([]byte, error) {
	return c.cmd.Output()
}

// CombinedOutput runs the command and returns its combined standard output and standard error.
func (c *osCmd) CombinedOutput() ([]byte, error) {
	return c.cmd.CombinedOutput()
}

// SetDir sets the working directory of the command.
func (c *osCmd) SetDir(dir string) {
	c.cmd.Dir = dir
}

// SetEnv sets the environment of the command.
func (c *osCmd) SetEnv(env []string) {
	c.cmd.Env = env
}

// SetStdin sets the standard input of the command.
func (c *osCmd) SetStdin(r io.Reader) {
	c.cmd.Stdin = r
}

// SetStdout sets the standard output of the command.
func (c *osCmd) SetStdout(w io.Writer) {
	c.cmd.Stdout = w
}

// SetStderr sets the standard error of the command.
func (c *osCmd) SetStderr(w io.Writer) {
	c.cmd.Stderr = w
}

// Dir returns the working directory of the command.
func (c *osCmd) Dir() string {
	return c.cmd.Dir
}

// Env returns the environment of the command.
func (c *osCmd) Env() []string {
	return c.cmd.Env
}

// Stdin returns the standard input of the command.
func (c *osCmd) Stdin() io.Reader {
	return c.cmd.Stdin
}

// Stdout returns the standard output of the command.
func (c *osCmd) Stdout() io.Writer {
	return c.cmd.Stdout
}

// Stderr returns the standard error of the command.
func (c *osCmd) Stderr() io.Writer {
	return c.cmd.Stderr
}

// osRunner implements CommandRunner using the system's native subprocess driver.
type osRunner struct{}

// NewOSRunner returns a CommandRunner executing real subprocesses via os/exec.
func NewOSRunner() CommandRunner {
	return &osRunner{}
}

// Command returns a Cmd to execute the named program with the given arguments.
func (r *osRunner) Command(name string, arg ...string) Cmd {
	return &osCmd{cmd: exec.Command(name, arg...)}
}

// CommandContext returns a Cmd to execute the named program with a context.
func (r *osRunner) CommandContext(ctx context.Context, name string, arg ...string) Cmd {
	return &osCmd{cmd: exec.CommandContext(ctx, name, arg...)}
}
