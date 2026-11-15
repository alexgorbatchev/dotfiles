package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnvCreateAndDelete(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")
	createTempConfigDir(t)

	out1, err := executeCommand("venv", "create", "testenv")
	if err != nil || !strings.Contains(out1, "Virtual environment created at:") {
		t.Fatalf("venv create failed: %v, out: %s", err, out1)
	}

	out2, err := executeCommand("venv", "delete", "testenv", "--force")
	if err != nil || !strings.Contains(out2, "Deleted virtual environment at") {
		t.Fatalf("venv delete failed: %v, out: %s", err, out2)
	}
}

func TestEnvCommand_Lifecycle(t *testing.T) {
	p := newE2EProject(t, tsTools{"bat": `install()`})
	enterTempDir(t)
	// The command reports the working directory as the OS resolves it, which may
	// differ from the temp dir path when it sits behind a symlink.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getting working dir: %v", err)
	}

	out, err := p.run("venv", "create", "venv")
	if err != nil {
		t.Fatalf("venv create venv: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stdout", out.Stdout, "Virtual environment created at: "+filepath.Join(cwd, "venv"))

	_, err = p.run("venv", "create", "venv")
	if err == nil || !strings.Contains(err.Error(), "failed to create virtual environment") {
		t.Fatalf("error = %v, want creation failure for an existing environment", err)
	}

	_, err = p.run("venv", "delete", "missing")
	if err == nil || !strings.Contains(err.Error(), `virtual environment "missing" not found in `+cwd) {
		t.Fatalf("error = %v, want not-found failure", err)
	}

	// An absolute environment path is accepted as-is.
	envDir := filepath.Join(cwd, "venv")
	out, err = p.run("venv", "delete", "--force", envDir)
	if err != nil {
		t.Fatalf("venv delete %s: %v\n%s", envDir, err, out.Combined)
	}
	if out.Stdout != "Deleted virtual environment at "+envDir+"\n" {
		t.Fatalf("stdout = %q, want the deletion confirmation", out.Stdout)
	}
	if _, err := os.Stat(envDir); !os.IsNotExist(err) {
		t.Fatalf("expected %s to be removed (stat err = %v)", envDir, err)
	}
}
