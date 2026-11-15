package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

func resetContext(cmd *cobra.Command) {
	cmd.SetContext(nil)
	for _, sub := range cmd.Commands() {
		resetContext(sub)
	}
}

func resetFlags(cmd *cobra.Command) {
	resetContext(cmd)
	cmd.Flags().VisitAll(func(f *pflag.Flag) {
		_ = f.Value.Set(f.DefValue)
		f.Changed = false
	})
	for _, sub := range cmd.Commands() {
		resetFlags(sub)
	}
}

// commandOutput is what one rootCmd execution wrote. Stdout and Stderr are kept
// apart because the package convention keeps stdout clean for pipeline data and
// sends diagnostics to stderr; Combined interleaves both in write order for tests
// that only need to know a message appeared somewhere.
type commandOutput struct {
	Stdout   string
	Stderr   string
	Combined string
}

// runCommand executes rootCmd with args on a clean flag state and captures each
// stream separately.
func runCommand(args ...string) (commandOutput, error) {
	return runCommandContext(context.Background(), args...)
}

// safeBuffer is a thread-safe wrapper around bytes.Buffer for concurrent test streams.
type safeBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (s *safeBuffer) Write(p []byte) (n int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.Write(p)
}

func (s *safeBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.String()
}

// runCommandContext executes rootCmd with ctx and args on a clean flag state and
// captures each stream separately.
func runCommandContext(ctx context.Context, args ...string) (commandOutput, error) {
	// Reset global persistent flags before each execution
	cfgFile = ""
	dryRun = false
	trace = false
	logLevel = "default"
	platform = ""
	arch = ""
	libc = ""
	verbose = false
	quiet = false

	// Reset subcommand flags
	dashboardHost = "127.0.0.1"
	dashboardPort = 8080
	logTailLines = 50

	resetFlags(rootCmd)
	defer resetContext(rootCmd)

	var stdout, stderr bytes.Buffer
	var combined safeBuffer
	if rootCmd.InOrStdin() == os.Stdin {
		rootCmd.SetIn(strings.NewReader(""))
		defer rootCmd.SetIn(nil)
	}
	rootCmd.SetOut(io.MultiWriter(&stdout, &combined))
	rootCmd.SetErr(io.MultiWriter(&stderr, &combined))
	rootCmd.SetArgs(args)

	err := rootCmd.ExecuteContext(ctx)
	return commandOutput{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		Combined: combined.String(),
	}, err
}

// executeCommand runs rootCmd and returns stdout and stderr interleaved. Use
// runCommand when a test must assert on one stream alone.
func executeCommand(args ...string) (string, error) {
	out, err := runCommand(args...)
	return out.Combined, err
}

// executeCommandContext runs rootCmd with a context and returns stdout and stderr interleaved.
func executeCommandContext(ctx context.Context, args ...string) (string, error) {
	out, err := runCommandContext(ctx, args...)
	return out.Combined, err
}

// enterTempDir creates a temporary directory, makes it the working directory for
// the rest of the test, and returns it.
func enterTempDir(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed getting current dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(origDir)
	})
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("failed changing dir: %v", err)
	}
	return tmpDir
}

// createTempConfigDir makes a fresh temp dir the working directory and writes a
// one-tool project there, so commands run without --config discover it. It returns
// the directory; the configuration is its dotfiles.config.ts.
func createTempConfigDir(t *testing.T) string {
	t.Helper()
	tmpDir := enterTempDir(t)
	writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}`, tsTools{
		"bat": `install("github-release", { repo: "sharkdp/bat" })`,
	})
	return tmpDir
}

func findRepoRoot() string {
	dir, _ := os.Getwd()
	for dir != "/" && dir != "." {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	return "."
}

// mustContain fails the test unless every want string appears in got.
func mustContain(t *testing.T, label, got string, want ...string) {
	t.Helper()
	for _, w := range want {
		if !strings.Contains(got, w) {
			t.Fatalf("%s does not contain %q:\n%s", label, w, got)
		}
	}
}

// mustNotContain fails the test if any unwanted string appears in got.
func mustNotContain(t *testing.T, label, got string, unwanted ...string) {
	t.Helper()
	for _, u := range unwanted {
		if strings.Contains(got, u) {
			t.Fatalf("%s must not contain %q:\n%s", label, u, got)
		}
	}
}

// mustFailAfterLogging fails the test unless a command that went on past a failure it
// had logged ended with ErrSilent (#132): main then exits 1 without printing the failure
// a second time.
func mustFailAfterLogging(t *testing.T, err error, out commandOutput) {
	t.Helper()
	if !errors.Is(err, ErrSilent) {
		t.Fatalf("error = %v, want ErrSilent after a logged failure\n%s", err, out.Combined)
	}
}
