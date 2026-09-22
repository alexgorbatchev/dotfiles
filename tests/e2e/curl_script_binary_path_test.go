package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// A curl-script whose script installs itself outside the staging directory is followed
// there through binaryPath. The managed binary is a link to the launcher the script
// created, not a copy of what the launcher pointed at, so when the tool updates itself
// and repoints its launcher the shim runs the new version.
func TestE2ECurlScriptBinaryPath(t *testing.T) {
	t.Parallel()

	const toolName = "curl-script--binary-path"

	ms := NewMockServer(t, "main")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})
	h.MockServerURL = ms.Server.URL
	h.CopyFixture("main")

	if stdout, stderr, exitCode, err := h.Generate(); err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if stdout, stderr, exitCode, err := h.Install([]string{toolName}, "--log=verbose"); err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	homeDir := filepath.Join(h.TempDir, ".generated", "user-home")
	launcher := filepath.Join(homeDir, ".local", "bin", toolName)
	managed := filepath.Join(h.TempDir, ".generated", "binaries", toolName, "current", toolName)

	target, err := os.Readlink(managed)
	if err != nil {
		t.Fatalf("expected %s to be a symlink: %v", managed, err)
	}
	if target != launcher {
		t.Errorf("managed binary links to %q, want the launcher as written, %q", target, launcher)
	}

	if version := getInstalledToolVersion(t, h.TempDir, toolName); version != "3.1.4" {
		t.Errorf("installed version = %q, want 3.1.4 detected through the link", version)
	}

	runShim := func() string {
		t.Helper()
		cmd := exec.Command(filepath.Join(h.TempDir, ".generated", "user-bin", toolName))
		cmd.Env = os.Environ()
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("running the shim: %v\noutput: %s", err, out)
		}
		return strings.TrimSpace(string(out))
	}

	if got := runShim(); got != toolName+" 3.1.4" {
		t.Errorf("shim output = %q, want %q", got, toolName+" 3.1.4")
	}

	// The tool updates itself the way claude does: a new version beside the old one,
	// and the launcher repointed at it.
	newVersion := filepath.Join(homeDir, ".local", "share", toolName, "versions", "3.2.0")
	if err := os.WriteFile(newVersion, []byte("#!/bin/sh\necho \""+toolName+" 3.2.0\"\n"), 0755); err != nil {
		t.Fatalf("writing the updated version: %v", err)
	}
	if err := os.Remove(launcher); err != nil {
		t.Fatalf("removing the launcher: %v", err)
	}
	if err := os.Symlink(newVersion, launcher); err != nil {
		t.Fatalf("repointing the launcher: %v", err)
	}

	if got := runShim(); got != toolName+" 3.2.0" {
		t.Errorf("shim output after the tool updated itself = %q, want %q", got, toolName+" 3.2.0")
	}
}
