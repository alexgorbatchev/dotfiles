package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const pkgTestToolName = "pkg-test-tool"

// newPkgHarness prepares a sandbox whose pkg installer is allowed to run on any
// platform, so the fake installer script stands in for macOS `installer`.
func newPkgHarness(t *testing.T) (*TestHarness, *MockServer) {
	t.Helper()

	ms := NewMockServer(t, "pkg")
	t.Cleanup(ms.Close)

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS":  "true",
			"DOTFILES_TEST_PKG_ALLOW_NON_MACOS": "1",
		},
	})
	h.MockServerURL = ms.Server.URL
	h.CopyFixture("pkg")

	return h, ms
}

// writePkgProject writes a self-contained project and tool configuration for the
// pkg fixture and returns where the fake installer will place the binary.
func writePkgProject(t *testing.T, h *TestHarness, ms *MockServer, generatedDir string) (installedBinaryPath string) {
	t.Helper()

	configContent := `export default {
  paths: {
    generatedDir: "` + generatedDir + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
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
	if err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	installRootDir := filepath.Join(h.TempDir, ".generated", "pkg-install-root")
	installedBinaryPath = filepath.Join(installRootDir, "bin", pkgTestToolName)

	toolConfigContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

const binaryPath = process.env["DOTFILES_TEST_PKG_BINARY_PATH"] || "` + pkgTestToolName + `";

export default defineTool((install) =>
  install("pkg", {
    source: {
      type: "url",
      url: "` + ms.Server.URL + `/` + pkgTestToolName + `.pkg",
    },
    binaryPath,
  })
    .bin("` + pkgTestToolName + `")
    .version("1.0.0"),
);`
	toolDir := filepath.Join(h.TempDir, "tools", pkgTestToolName)
	if err := os.MkdirAll(toolDir, 0755); err != nil {
		t.Fatalf("failed to create tool directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolDir, pkgTestToolName+".tool.ts"), []byte(toolConfigContent), 0644); err != nil {
		t.Fatalf("failed to write tool config: %v", err)
	}

	return installedBinaryPath
}

// writeFakePkgInstaller writes the mock .pkg asset served by the mock server and a
// fake `installer` that copies it to DOTFILES_TEST_PKG_BINARY_PATH. It returns the
// installer path and the log it writes on every run.
func writeFakePkgInstaller(t *testing.T, h *TestHarness) (fakeInstallerPath, fakeInstallerLogPath string) {
	t.Helper()

	fakeInstallerPath = filepath.Join(h.TempDir, "build", "fake-installer.sh")
	fakeInstallerLogPath = filepath.Join(h.TempDir, "build", "fake-installer.log")
	pkgAssetPath := filepath.Join(h.TempDir, "assets", pkgTestToolName+".pkg")

	if err := os.MkdirAll(filepath.Dir(fakeInstallerPath), 0755); err != nil {
		t.Fatalf("failed to create fake installer dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(pkgAssetPath), 0755); err != nil {
		t.Fatalf("failed to create assets dir: %v", err)
	}

	pkgContent := `#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  echo "1.0.0"
  exit 0
fi
echo "` + pkgTestToolName + `"
`
	if err := os.WriteFile(pkgAssetPath, []byte(pkgContent), 0755); err != nil {
		t.Fatalf("failed to write mock pkg: %v", err)
	}

	fakeInstallerContent := `#!/usr/bin/env bash
set -euo pipefail
pkg_path=''
target=''
while [ $# -gt 0 ]; do
  case "$1" in
    -pkg)
      pkg_path="$2"
      shift 2
      ;;
    -target)
      target="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
test -n "$pkg_path"
test "$target" = "/"
dest="${DOTFILES_TEST_PKG_BINARY_PATH:-}"
test -n "$dest"
log_path="` + filepath.ToSlash(fakeInstallerLogPath) + `"
mkdir -p "$(dirname "$log_path")"
printf "pkg_path=%s\ntarget=%s\ndest=%s\n" "$pkg_path" "$target" "$dest" > "$log_path"
mkdir -p "$(dirname "$dest")"
cp "$pkg_path" "$dest"
chmod +x "$dest"
`
	if err := os.WriteFile(fakeInstallerPath, []byte(fakeInstallerContent), 0755); err != nil {
		t.Fatalf("failed to write fake installer: %v", err)
	}

	return fakeInstallerPath, fakeInstallerLogPath
}

func assertFakePkgInstallerRan(t *testing.T, fakeInstallerLogPath, installedBinaryPath string) {
	t.Helper()

	logBytes, err := os.ReadFile(fakeInstallerLogPath)
	if err != nil {
		t.Fatalf("expected fake installer to run and log, but got error: %v", err)
	}
	logStr := string(logBytes)
	if !strings.Contains(logStr, "pkg_path=") || !strings.Contains(logStr, "target=/") {
		t.Errorf("invalid fake installer log output:\n%s", logStr)
	}

	fi, err := os.Stat(installedBinaryPath)
	if err != nil {
		t.Fatalf("expected binary to be installed at %s: %v", installedBinaryPath, err)
	}
	if fi.Mode()&0111 == 0 {
		t.Errorf("expected installed binary to be executable")
	}
}

func TestE2EPkg(t *testing.T) {
	t.Parallel()

	h, ms := newPkgHarness(t)
	installedBinaryPath := writePkgProject(t, h, ms, "./.generated")

	// Run generate command
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	if runtime.GOOS == "darwin" || os.Getenv("DOTFILES_TEST_PKG_ALLOW_NON_MACOS") == "1" {
		fakeInstallerPath, fakeInstallerLogPath := writeFakePkgInstaller(t, h)

		// Execute installer
		h.Env["DOTFILES_TEST_PKG_BINARY_PATH"] = installedBinaryPath
		h.Env["DOTFILES_TEST_PKG_INSTALLER_PATH"] = fakeInstallerPath
		stdout, stderr, exitCode, err = h.Install([]string{pkgTestToolName})
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed on macOS/allow_non_macos: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		assertFakePkgInstallerRan(t, fakeInstallerLogPath, installedBinaryPath)

		// Run the current entrypoint binary to check its stdout
		currentBinaryPath := filepath.Join(h.TempDir, ".generated", "binaries", pkgTestToolName, "current", pkgTestToolName)
		cmd := exec.Command(currentBinaryPath, "--version")
		cmd.Env = os.Environ()
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("failed to execute installed binary: %v\noutput: %s", err, string(out))
		}
		if strings.TrimSpace(string(out)) != "1.0.0" {
			t.Errorf("expected installed binary to output '1.0.0', got %q", string(out))
		}

	} else {
		// On standard Linux without bypass, the installer skips installation without failure
		delete(h.Env, "DOTFILES_TEST_PKG_ALLOW_NON_MACOS")
		delete(h.Env, "DOTFILES_TEST_PKG_INSTALLER_PATH")
		h.Env["DOTFILES_TEST_PKG_BINARY_PATH"] = installedBinaryPath
		stdout, stderr, exitCode, err = h.Install([]string{pkgTestToolName})
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Ensure nothing was installed
		if _, err := os.Stat(installedBinaryPath); !os.IsNotExist(err) {
			t.Errorf("expected installed binary to NOT exist on standard non-macOS")
		}
	}
}

// TestE2EPkgBootstrapShim covers the first invocation of a shim for an
// externally-managed tool that is not installed yet: the shim must trigger the
// install and then exec the freshly installed binary, wherever the package
// manager put it (issue #26).
func TestE2EPkgBootstrapShim(t *testing.T) {
	t.Parallel()

	h, ms := newPkgHarness(t)
	generatedDir := filepath.Join(h.TempDir, ".generated")
	installedBinaryPath := writePkgProject(t, h, ms, filepath.ToSlash(generatedDir))

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	shimPath := filepath.Join(generatedDir, "user-bin", pkgTestToolName)
	shimBytes, err := os.ReadFile(shimPath)
	if err != nil {
		t.Fatalf("expected bootstrap shim at %s: %v", shimPath, err)
	}
	shim := string(shimBytes)

	// Nothing is installed yet, so the only defensible target is the
	// dotfiles-managed entrypoint that the install pipeline links to the real binary.
	currentEntrypoint := filepath.Join(generatedDir, "binaries", pkgTestToolName, "current", pkgTestToolName)
	wantExecutable := `TOOL_EXECUTABLE="` + currentEntrypoint + `"`
	if !strings.Contains(shim, wantExecutable) {
		t.Errorf("bootstrap shim must target the current entrypoint, want %s in:\n%s", wantExecutable, shim)
	}
	if strings.Contains(shim, "/usr/bin/"+pkgTestToolName) {
		t.Errorf("bootstrap shim must never guess a system path:\n%s", shim)
	}

	fakeInstallerPath, fakeInstallerLogPath := writeFakePkgInstaller(t, h)
	h.Env["DOTFILES_TEST_PKG_BINARY_PATH"] = installedBinaryPath
	h.Env["DOTFILES_TEST_PKG_INSTALLER_PATH"] = fakeInstallerPath

	// The installed binary lives outside PATH on purpose: the shim has to reach it
	// through the recorded location, not by guessing.
	shimStdout, shimStderr, shimExitCode, err := runShim(h, shimPath, "--version")
	if err != nil || shimExitCode != 0 {
		t.Fatalf("first shim invocation failed: %v\nexitCode: %d\nstdout: %s\nstderr: %s", err, shimExitCode, shimStdout, shimStderr)
	}

	assertFakePkgInstallerRan(t, fakeInstallerLogPath, installedBinaryPath)

	if strings.TrimSpace(shimStdout) != "1.0.0" {
		t.Errorf("expected the shim to exec the freshly installed binary and print 1.0.0, got stdout %q, stderr:\n%s", shimStdout, shimStderr)
	}
}
