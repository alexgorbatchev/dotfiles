package main

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEnvDeleteCommand_Confirmation covers the gate in front of the recursive
// removal: a [y/N] prompt on an interactive terminal, a refusal anywhere the
// prompt cannot be answered, and --force skipping both.
func TestEnvDeleteCommand_Confirmation(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install()`})
	enterTempDir(t)
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getting working dir: %v", err)
	}
	envDir := filepath.Join(cwd, "venv")
	prompt := "Delete environment at '" + envDir + "'? [y/N] "

	createEnv := func(t *testing.T) {
		t.Helper()
		if out, err := p.run("venv", "create", "venv"); err != nil {
			t.Fatalf("venv create venv: %v\n%s", err, out.Combined)
		}
	}
	mustExist := func(t *testing.T) {
		t.Helper()
		if _, err := os.Stat(envDir); err != nil {
			t.Fatalf("expected %s to still exist (stat err = %v)", envDir, err)
		}
	}
	mustBeGone := func(t *testing.T) {
		t.Helper()
		if _, err := os.Stat(envDir); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be removed (stat err = %v)", envDir, err)
		}
	}
	// deleteWith runs venv delete with stdin replaced by answer. go test never runs
	// on a terminal, so terminal is what stdioIsTerminal reports for this run.
	deleteWith := func(t *testing.T, terminal bool, answer string, extra ...string) (commandOutput, error) {
		t.Helper()
		orig := stdioIsTerminal
		stdioIsTerminal = func(io.Reader, io.Writer) bool { return terminal }
		rootCmd.SetIn(strings.NewReader(answer))
		t.Cleanup(func() {
			stdioIsTerminal = orig
			rootCmd.SetIn(nil)
		})
		return p.run(append([]string{"venv", "delete", "venv"}, extra...)...)
	}

	t.Run("a terminal is asked and y deletes", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, true, "y\n")
		if err != nil {
			t.Fatalf("venv delete: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, prompt)
		if out.Stdout != "Deleted virtual environment at "+envDir+"\n" {
			t.Fatalf("stdout = %q, want only the deletion confirmation", out.Stdout)
		}
		mustBeGone(t)
	})

	t.Run("a terminal is asked and n cancels", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, true, "n\n")
		if err != nil {
			t.Fatalf("env delete: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, prompt, "Deletion cancelled")
		mustNotContain(t, "stderr", out.Stderr, "Deleted virtual environment")
		if out.Stdout != "" {
			t.Fatalf("stdout = %q, want nothing on cancel", out.Stdout)
		}
		mustExist(t)
	})

	t.Run("a terminal is asked and end of input cancels", func(t *testing.T) {
		out, err := deleteWith(t, true, "")
		if err != nil {
			t.Fatalf("env delete: %v\n%s", err, out.Combined)
		}
		mustContain(t, "stderr", out.Stderr, prompt, "Deletion cancelled")
		mustExist(t)
	})

	t.Run("a terminal is not asked with --force", func(t *testing.T) {
		out, err := deleteWith(t, true, "n\n", "--force")
		if err != nil {
			t.Fatalf("env delete --force: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustBeGone(t)
	})

	t.Run("no terminal refuses without --force even when stdin says y", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, false, "y\n")
		if err == nil || !strings.Contains(err.Error(), "--force") {
			t.Fatalf("error = %v, want a refusal that points at --force\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustExist(t)
	})

	t.Run("agent mode refuses without --force even on a terminal", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := deleteWith(t, true, "y\n")
		if err == nil || !strings.Contains(err.Error(), "--force") {
			t.Fatalf("error = %v, want a refusal that points at --force\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustExist(t)
	})

	t.Run("no terminal deletes with --force", func(t *testing.T) {
		out, err := deleteWith(t, false, "", "--force")
		if err != nil {
			t.Fatalf("venv delete --force: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustBeGone(t)
	})

	t.Run("no terminal deletes with -f shorthand", func(t *testing.T) {
		createEnv(t)
		out, err := deleteWith(t, false, "", "-f")
		if err != nil {
			t.Fatalf("venv delete -f: %v\n%s", err, out.Combined)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
		mustBeGone(t)
	})

	t.Run("the real terminal check sees no terminal under go test", func(t *testing.T) {
		if stdioIsTerminal(strings.NewReader(""), &bytes.Buffer{}) {
			t.Fatal("in-memory stdin and stderr were reported as a terminal")
		}
	})

	t.Run("a missing environment is reported before any prompt", func(t *testing.T) {
		out, err := deleteWith(t, true, "y\n")
		if err == nil || !strings.Contains(err.Error(), `virtual environment "venv" not found in `+cwd) {
			t.Fatalf("error = %v, want not-found failure", err)
		}
		mustNotContain(t, "stderr", out.Stderr, "[y/N]")
	})
}
