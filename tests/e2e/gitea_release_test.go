package e2e

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EGiteaRelease(t *testing.T) {
	t.Parallel()

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

	// First run generate
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	t.Run("generate validations", func(t *testing.T) {
		h.AssertShimExistsAndExecutable("gitea-release-tool")
		h.AssertShellInitContains("zsh", "gitea-release-tool")
		h.AssertShellInitContains("bash", "export PATH=")

		h.AssertEnvironmentVariable("gitea-release-tool", "GITEA_RELEASE_TOOL_OPTS", "--color=auto")
		h.AssertAlias("gitea-release-tool", "grt2", "gitea-release-tool --verbose")
	})

	t.Run("install validations", func(t *testing.T) {
		// Reset mock server tool versions
		resp, err := http.Get(fmt.Sprintf("%s/reset-versions", ms.Server.URL))
		if err != nil {
			t.Fatalf("failed to reset mock server versions: %v", err)
		}
		resp.Body.Close()

		// Run install
		stdout, stderr, exitCode, err = h.Install([]string{"gitea-release-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "gitea-release-tool", "current", "gitea-release-tool")
		if _, err := os.Stat(binaryPath); err != nil {
			t.Fatalf("expected installed binary to exist: %v", err)
		}

		// Execute shim to check version
		shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "gitea-release-tool")
		cmd := exec.Command(shimPath, "--version")
		cmd.Env = os.Environ()
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("failed to run shim: %v\noutput: %s", err, string(out))
		}
		if strings.TrimSpace(string(out)) != "1.0.0" {
			t.Errorf("expected version 1.0.0, got %q", strings.TrimSpace(string(out)))
		}
	})

	t.Run("update validations", func(t *testing.T) {
		// Set mock server tool version to 2.0.0
		resp, err := http.Get(fmt.Sprintf("%s/set-tool-version/repo/gitea-release-tool/2.0.0", ms.Server.URL))
		if err != nil {
			t.Fatalf("failed to set mock server tool version: %v", err)
		}
		resp.Body.Close()

		// Run update
		stdout, stderr, exitCode, err = h.Update("gitea-release-tool")
		if err != nil || exitCode != 0 {
			t.Fatalf("update failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Execute shim to check updated version
		shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "gitea-release-tool")
		cmd := exec.Command(shimPath, "--version")
		cmd.Env = os.Environ()
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("failed to run shim after update: %v\noutput: %s", err, string(out))
		}
		if strings.TrimSpace(string(out)) != "2.0.0" {
			t.Errorf("expected version 2.0.0, got %q", strings.TrimSpace(string(out)))
		}
	})
}

// writeGiteaReleaseTool replaces the copied fixture's gitea-release-tool config with
// one whose install parameters are exactly installParams (a TypeScript object body).
// mockServerHost is in scope for the parameters, as in the fixture itself.
func writeGiteaReleaseTool(t *testing.T, h *TestHarness, installParams string) {
	t.Helper()
	content := strings.Join([]string{
		`import { defineTool } from "@dotfiles/cli";`,
		``,
		`const mockServerHost = process.env["MOCK_SERVER_PORT"]`,
		`  ? ` + "`http://127.0.0.1:${process.env[\"MOCK_SERVER_PORT\"]}`",
		`  : "http://127.0.0.1:8765";`,
		``,
		`export default defineTool((install) =>`,
		`  install("gitea-release", { ` + installParams + ` }).bin("gitea-release-tool"),`,
		`);`,
		``,
	}, "\n")
	toolPath := filepath.Join(h.TempDir, "tools", "gitea-release-tool", "gitea-release-tool.tool.ts")
	if err := os.WriteFile(toolPath, []byte(content), 0o644); err != nil {
		t.Fatalf("writing %s: %v", toolPath, err)
	}
}

func newGiteaReleaseHarness(t *testing.T) (*TestHarness, *MockServer) {
	t.Helper()
	ms := NewMockServer(t, "main")
	t.Cleanup(ms.Close)

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})
	h.MockServerURL = ms.Server.URL
	h.CopyFixture("main")
	return h, ms
}

// TestE2EGiteaReleasePinnedVersion pins `version` in the install parameters while the
// mock instance's latest release stays at 1.0.0 (issue #32): the pinned release, not
// the latest one, must be installed.
func TestE2EGiteaReleasePinnedVersion(t *testing.T) {
	t.Parallel()

	h, _ := newGiteaReleaseHarness(t)
	writeGiteaReleaseTool(t, h, `instanceUrl: mockServerHost, repo: "repo/gitea-release-tool", version: "2.0.0"`)

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	stdout, stderr, exitCode, err = h.Install([]string{"gitea-release-tool"})
	if err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	h.AssertDBToolInstalled("gitea-release-tool", "2.0.0")

	shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "gitea-release-tool")
	cmd := exec.Command(shimPath, "--version")
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to run shim: %v\noutput: %s", err, string(out))
	}
	if got := strings.TrimSpace(string(out)); got != "2.0.0" {
		t.Errorf("expected the pinned version 2.0.0, got %q", got)
	}
}

// TestE2EGiteaReleaseMissingInstanceURL: a gitea-release tool without instanceUrl is
// rejected, as it was by v1's schema, instead of being looked up on codeberg.org.
func TestE2EGiteaReleaseMissingInstanceURL(t *testing.T) {
	t.Parallel()

	h, _ := newGiteaReleaseHarness(t)
	writeGiteaReleaseTool(t, h, `repo: "repo/gitea-release-tool"`)

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	stdout, stderr, exitCode, err = h.Install([]string{"gitea-release-tool"})
	if err == nil && exitCode == 0 {
		t.Fatalf("expected install to fail without instanceUrl\nstdout: %s\nstderr: %s", stdout, stderr)
	}
	output := stdout + stderr
	if !strings.Contains(output, "'instanceUrl' is required in installParams") {
		t.Fatalf("expected output to name the missing instanceUrl, got:\n%s", output)
	}
	if _, err := os.Stat(filepath.Join(h.TempDir, ".generated", "binaries", "gitea-release-tool", "current", "gitea-release-tool")); err == nil {
		t.Error("binary was installed although instanceUrl was missing")
	}
}
