package exec

import (
	"context"
	"io"
	"sync"
)

// MockCmd represents a mocked command that implements the Cmd interface.
type MockCmd struct {
	Name string
	Args []string
	Ctx  context.Context

	dir    string
	env    []string
	stdin  io.Reader
	stdout io.Writer
	stderr io.Writer

	// These define the mock behavior
	runFunc func(c *MockCmd) error
	output  []byte
	err     error
}

// Run executes the mock behavior configured for this command.
func (c *MockCmd) Run() error {
	if c.runFunc != nil {
		err := c.runFunc(c)
		if err != nil {
			return err
		}
	}
	if c.stdout != nil && len(c.output) > 0 {
		_, _ = c.stdout.Write(c.output)
	}
	return c.err
}

// Start simulates starting the command.
func (c *MockCmd) Start() error {
	return nil
}

// Wait simulates waiting for the command.
func (c *MockCmd) Wait() error {
	return nil
}

// Output simulates running the command and returns the pre-configured standard output.
func (c *MockCmd) Output() ([]byte, error) {
	if c.runFunc != nil {
		err := c.runFunc(c)
		return c.output, err
	}
	return c.output, c.err
}

// CombinedOutput simulates running the command and returns pre-configured output.
func (c *MockCmd) CombinedOutput() ([]byte, error) {
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
