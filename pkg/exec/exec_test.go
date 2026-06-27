package exec

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOSRunner(t *testing.T) {
	runner := NewOSRunner()

	t.Run("Command echo", func(t *testing.T) {
		cmd := runner.Command("echo", "hello")
		output, err := cmd.Output()
		if err != nil {
			t.Fatalf("failed to run echo: %v", err)
		}
		got := strings.TrimSpace(string(output))
		if got != "hello" {
			t.Errorf("expected 'hello', got %q", got)
		}
	})

	t.Run("CommandContext echo", func(t *testing.T) {
		ctx := context.Background()
		cmd := runner.CommandContext(ctx, "echo", "hello-ctx")
		output, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("failed to run echo: %v", err)
		}
		got := strings.TrimSpace(string(output))
		if got != "hello-ctx" {
			t.Errorf("expected 'hello-ctx', got %q", got)
		}
	})

	t.Run("Setters and Getters", func(t *testing.T) {
		cmd := runner.Command("echo")
		cmd.SetDir("/tmp")
		cmd.SetEnv([]string{"A=1"})
		var in bytes.Buffer
		var out bytes.Buffer
		var serr bytes.Buffer
		cmd.SetStdin(&in)
		cmd.SetStdout(&out)
		cmd.SetStderr(&serr)

		if cmd.Dir() != "/tmp" {
			t.Errorf("expected dir /tmp, got %q", cmd.Dir())
		}
		if len(cmd.Env()) != 1 || cmd.Env()[0] != "A=1" {
			t.Errorf("expected env [A=1], got %v", cmd.Env())
		}
		if cmd.Stdin() != &in {
			t.Errorf("expected stdin buffer pointer")
		}
		if cmd.Stdout() != &out {
			t.Errorf("expected stdout buffer pointer")
		}
		if cmd.Stderr() != &serr {
			t.Errorf("expected stderr buffer pointer")
		}
	})

	t.Run("Run Start and Wait", func(t *testing.T) {
		cmd := runner.Command("sleep", "0.1")
		err := cmd.Start()
		if err != nil {
			t.Fatalf("failed to start sleep: %v", err)
		}
		err = cmd.Wait()
		if err != nil {
			t.Fatalf("failed to wait sleep: %v", err)
		}
	})

	t.Run("Run directly", func(t *testing.T) {
		cmd := runner.Command("echo", "direct")
		var out bytes.Buffer
		cmd.SetStdout(&out)
		err := cmd.Run()
		if err != nil {
			t.Fatalf("failed to run echo direct: %v", err)
		}
		got := strings.TrimSpace(out.String())
		if got != "direct" {
			t.Errorf("expected 'direct', got %q", got)
		}
	})
}

func TestMockRunner(t *testing.T) {
	runner := NewMockRunner()

	t.Run("Static Register", func(t *testing.T) {
		runner.Clear()
		runner.Register("ls", []byte("file1\nfile2"), nil)

		cmd := runner.Command("ls", "-la")
		output, err := cmd.Output()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if string(output) != "file1\nfile2" {
			t.Errorf("expected 'file1\\nfile2', got %q", string(output))
		}

		if len(runner.History) != 1 {
			t.Errorf("expected history length 1, got %d", len(runner.History))
		}
		if runner.History[0].Name != "ls" || runner.History[0].Args[0] != "-la" {
			t.Errorf("unexpected history entry: %+v", runner.History[0])
		}
	})

	t.Run("Register Func", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("git", func(c *MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "status" {
				c.output = []byte("on branch main")
				return nil
			}
			return errors.New("unknown git command")
		})

		cmd1 := runner.CommandContext(context.Background(), "git", "status")
		out1, err1 := cmd1.CombinedOutput()
		if err1 != nil {
			t.Fatalf("unexpected error: %v", err1)
		}
		if string(out1) != "on branch main" {
			t.Errorf("expected 'on branch main', got %q", string(out1))
		}

		cmd2 := runner.Command("git", "push")
		_, err2 := cmd2.Output()
		if err2 == nil {
			t.Fatal("expected error, got nil")
		}

		// Test Run setting output
		var outBuf bytes.Buffer
		cmd3 := runner.Command("git", "status")
		cmd3.SetStdout(&outBuf)
		err3 := cmd3.Run()
		if err3 != nil {
			t.Fatalf("unexpected error: %v", err3)
		}
		if outBuf.String() != "on branch main" {
			t.Errorf("expected 'on branch main' written to stdout, got %q", outBuf.String())
		}
	})

	t.Run("Setters and Getters", func(t *testing.T) {
		runner.Clear()
		cmd := runner.Command("dummy")
		cmd.SetDir("/home")
		cmd.SetEnv([]string{"ENV=test"})
		var r bytes.Buffer
		var w1 bytes.Buffer
		var w2 bytes.Buffer
		cmd.SetStdin(&r)
		cmd.SetStdout(&w1)
		cmd.SetStderr(&w2)

		if cmd.Dir() != "/home" {
			t.Errorf("expected /home, got %q", cmd.Dir())
		}
		if len(cmd.Env()) != 1 || cmd.Env()[0] != "ENV=test" {
			t.Errorf("expected [ENV=test], got %v", cmd.Env())
		}
		if cmd.Stdin() != &r {
			t.Errorf("expected standard input matching")
		}
		if cmd.Stdout() != &w1 {
			t.Errorf("expected standard output matching")
		}
		if cmd.Stderr() != &w2 {
			t.Errorf("expected standard error matching")
		}

		// Start and Wait on mock
		if err := cmd.Start(); err != nil {
			t.Errorf("unexpected Start error: %v", err)
		}
		if err := cmd.Wait(); err != nil {
			t.Errorf("unexpected Wait error: %v", err)
		}
	})
}

func TestSudoPreflightCheck(t *testing.T) {
	// Save the original pre-flight command and restore after the test
	origPreflight := SudoPreflightCommand
	defer func() {
		SudoPreflightCommand = origPreflight
	}()

	runner := NewOSRunner()

	t.Run("headless missing passwordless sudo", func(t *testing.T) {
		// Simulate headless environment (stdin is a buffer, not a terminal)
		// and passwordless sudo missing (preflight command 'false' fails)
		SudoPreflightCommand = []string{"false"}

		cmd := runner.Command("sudo", "echo", "hello")
		var stdinBuf bytes.Buffer
		cmd.SetStdin(&stdinBuf)

		err := cmd.Run()
		if err == nil {
			t.Fatal("expected error in headless env with failing sudo check, got nil")
		}
		if !strings.Contains(err.Error(), "headless environment requires passwordless sudo access") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("headless with active passwordless sudo", func(t *testing.T) {
		// Create a temporary directory and write a mock "sudo" script
		tmpDir := t.TempDir()
		mockSudoPath := filepath.Join(tmpDir, "sudo")

		// The mock "sudo" script simply executes whatever arguments are passed to it
		scriptContent := "#!/bin/sh\nexec \"$@\"\n"
		if err := os.WriteFile(mockSudoPath, []byte(scriptContent), 0755); err != nil {
			t.Fatalf("failed to write mock sudo: %v", err)
		}

		// Prepend the temp directory containing mock "sudo" to PATH
		origPath := os.Getenv("PATH")
		defer os.Setenv("PATH", origPath)
		os.Setenv("PATH", tmpDir+string(filepath.ListSeparator)+origPath)

		// Simulate headless environment but passwordless sudo is active
		SudoPreflightCommand = []string{"true"}

		// Run a simple echo command prepended with sudo
		cmd := runner.Command("sudo", "echo", "hello-sudo")
		var stdinBuf bytes.Buffer
		cmd.SetStdin(&stdinBuf)

		output, err := cmd.Output()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		got := strings.TrimSpace(string(output))
		if got != "hello-sudo" {
			t.Errorf("expected 'hello-sudo', got %q", got)
		}
	})
}
