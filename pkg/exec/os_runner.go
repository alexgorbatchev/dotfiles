package exec

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/mattn/go-isatty"
)

// osCmd wraps an *os/exec.Cmd to satisfy the Cmd interface.
type osCmd struct {
	cmd *exec.Cmd
	ctx context.Context
}

// SudoPreflightCommand defines the command used for non-blocking sudo verification.
// Overridden in tests to avoid dependency on host sudo privileges.
var SudoPreflightCommand = []string{"sudo", "-n", "true"}

func isStdinTerminal(stdin io.Reader) bool {
	if stdin == nil {
		return isatty.IsTerminal(os.Stdin.Fd())
	}
	if f, ok := stdin.(*os.File); ok {
		return isatty.IsTerminal(f.Fd())
	}
	return false
}

func (c *osCmd) checkSudo() error {
	if len(c.cmd.Args) > 0 && c.cmd.Args[0] == "sudo" {
		projCfg := config.GetProjectConfig(c.ctx)
		if projCfg != nil && projCfg.System.SudoPrompt != "" {
			hasP := false
			for i, arg := range c.cmd.Args {
				if arg == "-p" && i+1 < len(c.cmd.Args) {
					hasP = true
					break
				}
			}
			if !hasP {
				newArgs := make([]string, 0, len(c.cmd.Args)+2)
				newArgs = append(newArgs, "sudo", "-p", projCfg.System.SudoPrompt)
				newArgs = append(newArgs, c.cmd.Args[1:]...)
				c.cmd.Args = newArgs
			}
		}

		isTTY := isStdinTerminal(c.cmd.Stdin) && isatty.IsTerminal(os.Stdout.Fd())
		if os.Getenv("CI") != "" {
			cmdCheck := exec.Command(SudoPreflightCommand[0], SudoPreflightCommand[1:]...)
			if err := cmdCheck.Run(); err != nil {
				return fmt.Errorf("non-interactive CI/CD environment requires passwordless sudo access for elevated configurations: %w", err)
			}
		} else if !isTTY {
			cmdCheck := exec.Command(SudoPreflightCommand[0], SudoPreflightCommand[1:]...)
			if err := cmdCheck.Run(); err != nil {
				return fmt.Errorf("headless environment requires passwordless sudo access for elevated configurations: %w", err)
			}
		} else {
			fmt.Fprintln(os.Stderr, "WARNING: Executing elevated privilege (sudo) command.")
		}
	}
	return nil
}

// Run starts the specified command and waits for it to complete.
func (c *osCmd) Run() error {
	if err := c.checkSudo(); err != nil {
		return err
	}
	return c.cmd.Run()
}

// Start starts the specified command but does not wait for it to complete.
func (c *osCmd) Start() error {
	if err := c.checkSudo(); err != nil {
		return err
	}
	return c.cmd.Start()
}

// Wait waits for the command to exit. It must have been started by Start.
func (c *osCmd) Wait() error {
	return c.cmd.Wait()
}

// Output runs the command and returns its standard output.
func (c *osCmd) Output() ([]byte, error) {
	if err := c.checkSudo(); err != nil {
		return nil, err
	}
	return c.cmd.Output()
}

// CombinedOutput runs the command and returns its combined standard output and standard error.
func (c *osCmd) CombinedOutput() ([]byte, error) {
	if err := c.checkSudo(); err != nil {
		return nil, err
	}
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
	return &osCmd{cmd: exec.Command(name, arg...), ctx: context.Background()}
}

// CommandContext returns a Cmd to execute the named program with a context.
func (r *osRunner) CommandContext(ctx context.Context, name string, arg ...string) Cmd {
	return &osCmd{cmd: exec.CommandContext(ctx, name, arg...), ctx: ctx}
}
