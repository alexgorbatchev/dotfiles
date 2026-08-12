package exec

import (
	"context"
	"io"
	"sync"
	"sync/atomic"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// MockCmd represents a mocked command that implements the Cmd interface.
type MockCmd struct {
	Name string
	Args []string
	Ctx  context.Context

	dir          string
	env          []string
	stdin        io.Reader
	stdout       io.Writer
	stderr       io.Writer
	processGroup bool
	killed       atomic.Bool
	pid          int
	doneCh       chan error

	// These define the mock behavior
	runFunc func(c *MockCmd) error
	output  []byte
	err     error
}

func (c *MockCmd) checkSudo() {
	if c.Name == "sudo" {
		projCfg := config.GetProjectConfig(c.Ctx)
		if projCfg != nil && projCfg.System.SudoPrompt != "" {
			hasP := false
			for i, arg := range c.Args {
				if arg == "-p" && i+1 < len(c.Args) {
					hasP = true
					break
				}
			}
			if !hasP {
				newArgs := make([]string, 0, len(c.Args)+2)
				newArgs = append(newArgs, "-p", projCfg.System.SudoPrompt)
				newArgs = append(newArgs, c.Args...)
				c.Args = newArgs
			}
		}
	}
}

// Run executes the mock behavior configured for this command.
func (c *MockCmd) Run() error {
	if err := c.Start(); err != nil {
		return err
	}
	return c.Wait()
}

// Start simulates starting the command in a background goroutine.
func (c *MockCmd) Start() error {
	c.checkSudo()
	c.doneCh = make(chan error, 1)
	go func() {
		var err error
		if c.runFunc != nil {
			err = c.runFunc(c)
		} else {
			err = c.err
		}
		if c.stdout != nil && len(c.output) > 0 {
			_, _ = c.stdout.Write(c.output)
		}
		c.doneCh <- err
	}()
	return nil
}

// Wait simulates waiting for the command to finish.
func (c *MockCmd) Wait() error {
	if c.doneCh == nil {
		return nil
	}
	return <-c.doneCh
}

// Output simulates running the command and returns the pre-configured standard output.
func (c *MockCmd) Output() ([]byte, error) {
	c.checkSudo()
	if c.runFunc != nil {
		err := c.runFunc(c)
		return c.output, err
	}
	return c.output, c.err
}

// CombinedOutput simulates running the command and returns pre-configured output.
func (c *MockCmd) CombinedOutput() ([]byte, error) {
	c.checkSudo()
	if c.runFunc != nil {
		err := c.runFunc(c)
		return c.output, err
	}
	return c.output, c.err
}

// SetDir sets the working directory of the command.
func (c *MockCmd) SetDir(dir string) { c.dir = dir }

// SetEnv sets the environment of the command.
func (c *MockCmd) SetEnv(env []string) { c.env = env }

// SetStdin sets the standard input of the command.
func (c *MockCmd) SetStdin(r io.Reader) { c.stdin = r }

// SetStdout sets the standard output of the command.
func (c *MockCmd) SetStdout(w io.Writer) { c.stdout = w }

// SetStderr sets the standard error of the command.
func (c *MockCmd) SetStderr(w io.Writer) { c.stderr = w }

// Dir returns the working directory of the command.
func (c *MockCmd) Dir() string { return c.dir }

// Env returns the environment of the command.
func (c *MockCmd) Env() []string { return c.env }

// Stdin returns the standard input of the command.
func (c *MockCmd) Stdin() io.Reader { return c.stdin }

// Stdout returns the standard output of the command.
func (c *MockCmd) Stdout() io.Writer { return c.stdout }

// Stderr returns the standard error of the command.
func (c *MockCmd) Stderr() io.Writer { return c.stderr }

// SetProcessGroup configures whether the command runs in its own process group.
func (c *MockCmd) SetProcessGroup(pgid bool) { c.processGroup = pgid }

// ProcessGroup returns whether process group isolation is enabled.
func (c *MockCmd) ProcessGroup() bool { return c.processGroup }

// Kill simulates terminating the process with SIGKILL.
func (c *MockCmd) Kill() error {
	c.killed.Store(true)
	return nil
}

// Killed returns whether Kill was called on this mock command.
func (c *MockCmd) Killed() bool { return c.killed.Load() }

// SetProcessPid sets a mock PID.
func (c *MockCmd) SetProcessPid(pid int) { c.pid = pid }

// ProcessPid returns the mock process ID.
func (c *MockCmd) ProcessPid() int { return c.pid }

// MockCommandResult holds the pre-configured mock behavior for a command.
type MockCommandResult struct {
	Output  []byte
	Err     error
	RunFunc func(c *MockCmd) error
}

// MockRunner implements CommandRunner with controllable behavior and execution tracing.
type MockRunner struct {
	mu       sync.Mutex
	History  []*MockCmd
	registry map[string]*MockCommandResult
}

// NewMockRunner creates a new MockRunner instance.
func NewMockRunner() *MockRunner {
	return &MockRunner{
		registry: make(map[string]*MockCommandResult),
	}
}

// Register registers a static output and error for a specific command name.
func (r *MockRunner) Register(name string, output []byte, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.registry[name] = &MockCommandResult{
		Output: output,
		Err:    err,
	}
}

// RegisterFunc registers a custom execution function for a command name.
func (r *MockRunner) RegisterFunc(name string, runFunc func(c *MockCmd) error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.registry[name] = &MockCommandResult{
		RunFunc: runFunc,
	}
}

// Command returns a MockCmd and appends it to the execution history.
func (r *MockRunner) Command(name string, arg ...string) Cmd {
	r.mu.Lock()
	defer r.mu.Unlock()

	cmd := &MockCmd{
		Name: name,
		Args: arg,
	}

	if res, exists := r.registry[name]; exists {
		cmd.output = res.Output
		cmd.err = res.Err
		cmd.runFunc = res.RunFunc
	}

	r.History = append(r.History, cmd)
	return cmd
}

// CommandContext is like Command but includes a context.
func (r *MockRunner) CommandContext(ctx context.Context, name string, arg ...string) Cmd {
	r.mu.Lock()
	defer r.mu.Unlock()

	cmd := &MockCmd{
		Name: name,
		Args: arg,
		Ctx:  ctx,
	}

	if res, exists := r.registry[name]; exists {
		cmd.output = res.Output
		cmd.err = res.Err
		cmd.runFunc = res.RunFunc
	}

	r.History = append(r.History, cmd)
	return cmd
}

// Clear resets the registered mock behaviors and execution history.
func (r *MockRunner) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.History = nil
	r.registry = make(map[string]*MockCommandResult)
}
