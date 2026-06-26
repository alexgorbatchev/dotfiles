package e2e

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2EAutoInstall(t *testing.T) {
	ms := NewMockServer(t, "auto-install")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("auto-install")

	// Write clean, self-contained config.ts with absolute paths
	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
  github: {
    host: "` + ms.Server.URL + `",
    cache: {
      enabled: false,
    },
  },
  downloader: {
    cache: {
      enabled: false,
    },
  },
};`
	err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "auto-install-tool", "current", "auto-install-tool")

	// Verify the binary does NOT exist before generate
	if _, err := os.Stat(binaryPath); err == nil || !os.IsNotExist(err) {
		t.Fatalf("expected binary to NOT exist before generate")
	}

	// Run generate command - this should auto-install the tool
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify stdout/stderr contains auto-install message (real installers log to stderr)
	combinedOutput := stdout + stderr
	if !strings.Contains(combinedOutput, "auto-install-tool") {
		t.Errorf("expected output to mention auto-install of auto-install-tool, but got:\n%s", combinedOutput)
	}

	// Verify the binary was installed and is executable
	fi, err := os.Stat(binaryPath)
	if err != nil {
		t.Fatalf("expected binary to exist at %s after generate: %v", binaryPath, err)
	}
	if fi.Mode()&0111 == 0 {
		t.Errorf("expected installed binary to be executable")
	}

	// Verify shim exists and is executable
	h.AssertShimExistsAndExecutable("auto-install-tool")

	// Verify execution of auto-installed tool binary directly
	cmd := exec.Command(binaryPath, "--version")
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to execute binary: %v\noutput: %s", err, string(out))
	}
	if !strings.Contains(string(out), "auto-install-tool version 1.0.0") {
		t.Errorf("expected version output to contain 'auto-install-tool version 1.0.0', got %q", string(out))
	}

	// Verify environment variable is set
	h.AssertEnvironmentVariable("auto-install-tool", "AUTO_INSTALL_TOOL_HOME", "~/.auto-install-tool")

	// Run generate again and verify it does NOT reinstall when already installed
	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("subsequent generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Since it is already installed, the "Auto-installed" message should not appear on re-run
	combinedOutput = stdout + stderr
	if strings.Contains(combinedOutput, "Auto-installed: auto-install-tool") {
		t.Errorf("expected subsequent generate to skip auto-install logs, but got:\n%s", combinedOutput)
	}
}

func runShim(h *TestHarness, shimPath string, args ...string) (stdout, stderr string, exitCode int, err error) {
	cmd := exec.Command(shimPath, args...)
	cmd.Dir = h.TempDir

	// Build environment variables map, starting with existing environment
	envMap := make(map[string]string)
	for _, kv := range os.Environ() {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}

	// Override specific variables to target sandbox to prevent global mutation
	sandboxHome := filepath.Join(h.TempDir, "home")
	sandboxConfig := filepath.Join(h.TempDir, "home", ".config")
	envMap["HOME"] = sandboxHome
	envMap["XDG_CONFIG_HOME"] = sandboxConfig
	envMap["NO_COLOR"] = "1"
	envMap["TERM"] = "dumb"
	envMap["DOTFILES_REPO_ROOT"] = h.ProjectRoot
	envMap["DOTFILES_E2E_TEST"] = "true"

	// Setup mock server port environment variable if server URL is provided
	if h.MockServerURL != "" {
		parts := strings.Split(h.MockServerURL, ":")
		if len(parts) > 2 {
			port := parts[len(parts)-1]
			envMap["MOCK_SERVER_PORT"] = port
		}
	}

	// Merge with extra env vars provided at initialization
	for k, v := range h.Env {
		envMap[k] = v
	}

	// Convert map back to slice format for exec.Cmd
	var env []string
	for k, v := range envMap {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err = cmd.Run()
	stdout = outBuf.String()
	stderr = errBuf.String()

	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
			err = nil // Do not return exit code error as a Go error
		} else {
			exitCode = -1
		}
	} else {
		exitCode = 0
	}

	return stdout, stderr, exitCode, err
}

func TestE2EShimOnDemandInstall(t *testing.T) {
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

	// Run generate only (does not install tools, as they are not marked with auto: true)
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "github-release-tool", "current", "github-release-tool")

	// Verify binary does NOT exist yet on disk
	if _, err := os.Stat(binaryPath); err == nil {
		t.Fatalf("expected binary not to exist yet on disk")
	}

	// Verify the shim exists
	shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "github-release-tool")
	if _, err := os.Stat(shimPath); err != nil {
		t.Fatalf("expected shim to exist at %s: %v", shimPath, err)
	}

	// Execute the shim. Since the binary does not exist, the shim should run
	// GENERATOR_CLI_EXECUTABLE (our test dotfiles binary) to install it, and then execute it.
	shimStdout, shimStderr, shimExitCode, err := runShim(h, shimPath, "--version")
	if err != nil || shimExitCode != 0 {
		t.Fatalf("shim execution failed: %v\nexitCode: %d\nstdout: %s\nstderr: %s", err, shimExitCode, shimStdout, shimStderr)
	}

	t.Logf("shim stdout:\n%s", shimStdout)
	t.Logf("shim stderr:\n%s", shimStderr)

	// Verify that the binary now exists and was successfully run (returning version 1.0.0)
	if _, err := os.Stat(binaryPath); err != nil {
		t.Fatalf("expected binary to be installed after shim run: %v", err)
	}

	if !strings.Contains(shimStdout, "1.0.0") {
		t.Errorf("expected shim output to contain version 1.0.0, got:\n%s", shimStdout)
	}
}
