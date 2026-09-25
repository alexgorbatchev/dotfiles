package e2e

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestE2EUv(t *testing.T) {
	t.Parallel()

	var pypiVersion atomic.Value
	pypiVersion.Store("0.26.0")

	// Mock PyPI server
	pypiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/claude-swap/json") {
			w.Header().Set("Content-Type", "application/json")
			ver := pypiVersion.Load().(string)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"info": map[string]interface{}{
					"version": ver,
					"name":    "claude-swap",
				},
			})
			return
		}
		if strings.HasSuffix(r.URL.Path, "/claude-swap-pinned/json") {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"info": map[string]interface{}{
					"version": "0.27.0",
					"name":    "claude-swap-pinned",
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(pypiServer.Close)

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
			"DOTFILES_PYPI_URL":                pypiServer.URL,
		},
	})

	h.CopyFixture("uv")

	fixtureDir := filepath.Join(h.ProjectRoot, "tests", "e2e", "fixtures", "uv")
	fakeBinDir := filepath.Join(fixtureDir, "fake-bin")
	fakeUvLog := filepath.Join(h.TempDir, ".generated", "fake-uv.log")

	err := os.MkdirAll(filepath.Dir(fakeUvLog), 0755)
	if err != nil {
		t.Fatalf("failed to create log dir: %v", err)
	}

	h.Env["PATH"] = fakeBinDir + string(filepath.ListSeparator) + os.Getenv("PATH")
	h.Env["FAKE_UV_LOG"] = fakeUvLog
	h.Env["FAKE_UV_VERSION"] = "0.26.0"

	// 1. Install tool
	t.Run("installs tool with isolated staging bin dir", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.Install([]string{"claude-swap"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install claude-swap failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify fake-uv log
		logBytes, err := os.ReadFile(fakeUvLog)
		if err != nil {
			t.Fatalf("failed to read fake uv log: %v", err)
		}
		logStr := string(logBytes)

		// Assert command args
		if !strings.Contains(logStr, "uv tool install --python >=3.12 claude-swap") {
			t.Errorf("expected command invocation in log, got:\n%s", logStr)
		}

		// Assert UV_TOOL_BIN_DIR points to staging directory
		if !strings.Contains(logStr, "UV_TOOL_BIN_DIR=") || !strings.Contains(logStr, ".staging") {
			t.Errorf("expected UV_TOOL_BIN_DIR with .staging in log, got:\n%s", logStr)
		}

		// Assert binaries exist in current directory
		bin1 := filepath.Join(h.TempDir, ".generated", "binaries", "claude-swap", "current", "claude-swap")
		bin2 := filepath.Join(h.TempDir, ".generated", "binaries", "claude-swap", "current", "cswap")
		h.AssertFileExists(bin1)
		h.AssertFileExists(bin2)

		// Assert shims exist and are executable
		h.AssertShimExistsAndExecutable("claude-swap")
		h.AssertShimExistsAndExecutable("cswap")

		// Execute shim directly and verify it runs the mock target binary
		shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "claude-swap")
		cmd := exec.Command(shimPath)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("failed to execute shim %s: %v\noutput: %s", shimPath, err, string(out))
		}
		if !strings.Contains(string(out), "claude-swap 0.26.0 (mock)") {
			t.Errorf("expected shim output to contain 'claude-swap 0.26.0 (mock)', got: %s", string(out))
		}

		// Verify tool list reports version 0.26.0
		stdout, stderr, exitCode, err = h.RunCommand("tool", "list", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("tool list failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if !strings.Contains(stdout, "claude-swap") || !strings.Contains(stdout, "0.26.0") {
			t.Errorf("expected tool list to contain claude-swap 0.26.0, got:\n%s", stdout)
		}
	})

	// 2. Install pinned tool and verify version pin prevents updates
	t.Run("installs pinned tool and respects version pin", func(t *testing.T) {
		_ = os.WriteFile(fakeUvLog, []byte(""), 0644)

		stdout, stderr, exitCode, err := h.Install([]string{"claude-swap-pinned"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install claude-swap-pinned failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify invocation passed the version constraint
		logBytes, _ := os.ReadFile(fakeUvLog)
		if !strings.Contains(string(logBytes), "claude-swap-pinned>=0.26.0") {
			t.Errorf("expected claude-swap-pinned>=0.26.0 in log, got:\n%s", string(logBytes))
		}

		// Verify update refuses pinned tool
		stdout, stderr, exitCode, err = h.Update("claude-swap-pinned")
		if !strings.Contains(stderr, "is pinned to version") || !strings.Contains(stderr, "to enable updates") {
			t.Errorf("expected update refusal message in stderr, got:\nstdout: %s\nstderr: %s", stdout, stderr)
		}
	})

	// 3. Check update and perform update on unpinned tool
	t.Run("detects and applies update to newer version", func(t *testing.T) {
		// Advance PyPI version and mock uv version
		pypiVersion.Store("0.27.0")
		h.Env["FAKE_UV_VERSION"] = "0.27.0"

		// Clear log
		_ = os.WriteFile(fakeUvLog, []byte(""), 0644)

		// Check updates via tool check
		stdout, stderr, exitCode, err := h.RunCommand("tool", "check", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("tool check failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if !strings.Contains(stdout, "claude-swap") || !strings.Contains(stdout, "0.27.0") {
			t.Errorf("expected tool check to report 0.27.0 available for claude-swap, got:\n%s", stdout)
		}

		// Update tool
		stdout, stderr, exitCode, err = h.Update("claude-swap")
		if err != nil || exitCode != 0 {
			t.Fatalf("update claude-swap failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify tool list now reports 0.27.0
		stdout, stderr, exitCode, err = h.RunCommand("tool", "list", "--config", h.ConfigPath)
		if err != nil || exitCode != 0 {
			t.Fatalf("tool list after update failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if !strings.Contains(stdout, "0.27.0") {
			t.Errorf("expected tool list to report 0.27.0, got:\n%s", stdout)
		}

		// Verify executed shim now outputs 0.27.0
		shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "claude-swap")
		cmd := exec.Command(shimPath)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("failed to execute shim %s: %v\noutput: %s", shimPath, err, string(out))
		}
		if !strings.Contains(string(out), "claude-swap 0.27.0 (mock)") {
			t.Errorf("expected shim output to contain 'claude-swap 0.27.0 (mock)', got: %s", string(out))
		}

		// Verify fake uv log contains --force during update
		logBytes, _ := os.ReadFile(fakeUvLog)
		if !strings.Contains(string(logBytes), "--force") {
			t.Errorf("expected update to pass --force to uv tool install, got log:\n%s", string(logBytes))
		}

		// Verify install --force also passes --force and succeeds when already installed
		_ = os.WriteFile(fakeUvLog, []byte(""), 0644)
		stdout, stderr, exitCode, err = h.RunCommand("install", "--force", "--config", h.ConfigPath, "claude-swap")
		if err != nil || exitCode != 0 {
			t.Fatalf("forced install claude-swap failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		logBytes, _ = os.ReadFile(fakeUvLog)
		if !strings.Contains(string(logBytes), "--force") {
			t.Errorf("expected forced install to pass --force to uv tool install, got log:\n%s", string(logBytes))
		}
	})

	// 4. Uninstall tool
	t.Run("uninstalls tool and cleans up shims", func(t *testing.T) {
		_ = os.WriteFile(fakeUvLog, []byte(""), 0644)

		stdout, stderr, exitCode, err := h.RunCommand("tool", "uninstall", "--config", h.ConfigPath, "claude-swap")
		if err != nil || exitCode != 0 {
			t.Fatalf("uninstall claude-swap failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify uv tool uninstall command ran
		logBytes, err := os.ReadFile(fakeUvLog)
		if err != nil {
			t.Fatalf("failed to read fake uv log: %v", err)
		}
		if !strings.Contains(string(logBytes), "uv tool uninstall claude-swap") {
			t.Errorf("expected 'uv tool uninstall claude-swap' in log, got:\n%s", string(logBytes))
		}

		// Verify shims are removed
		shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "claude-swap")
		if _, err := os.Stat(shimPath); err == nil {
			t.Errorf("expected shim %s to be removed after uninstall", shimPath)
		}
	})
}
