package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestE2EPkg(t *testing.T) {
	t.Parallel()

	ms := NewMockServer(t, "pkg")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS":  "true",
			"DOTFILES_TEST_PKG_ALLOW_NON_MACOS": "1",
		},
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("pkg")

	// Write clean, self-contained config.ts to avoid esbuild compile/resolve failures
	configContent := `export default {
  paths: {
    generatedDir: "./.generated",
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
	err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	installRootDir := filepath.Join(h.TempDir, ".generated", "pkg-install-root")
	installedBinaryPath := filepath.Join(installRootDir, "bin", "pkg-test-tool")

	// Write clean self-contained tool config
	toolConfigContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

const binaryPath = process.env["DOTFILES_TEST_PKG_BINARY_PATH"] || "pkg-test-tool";

export default defineTool((install) =>
  install("pkg", {
    source: {
      type: "url",
      url: "` + ms.Server.URL + `/pkg-test-tool.pkg",
    },
    binaryPath,
  })
    .bin("pkg-test-tool")
    .version("1.0.0"),
);`
	err = os.MkdirAll(filepath.Join(h.TempDir, "tools", "pkg-test-tool"), 0755)
	if err != nil {
		t.Fatalf("failed to create tool directory: %v", err)
	}
	err = os.WriteFile(filepath.Join(h.TempDir, "tools", "pkg-test-tool", "pkg-test-tool.tool.ts"), []byte(toolConfigContent), 0644)
	if err != nil {
		t.Fatalf("failed to write tool config: %v", err)
	}

	// Run generate command
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	if runtime.GOOS == "darwin" || os.Getenv("DOTFILES_TEST_PKG_ALLOW_NON_MACOS") == "1" {
		fakeInstallerPath := filepath.Join(h.TempDir, "build", "fake-installer.sh")
		fakeInstallerLogPath := filepath.Join(h.TempDir, "build", "fake-installer.log")
		pkgAssetPath := filepath.Join(h.TempDir, "assets", "pkg-test-tool.pkg")

		// Create directories
		err = os.MkdirAll(filepath.Dir(fakeInstallerPath), 0755)
		if err != nil {
			t.Fatalf("failed to create fake installer dir: %v", err)
		}
		err = os.MkdirAll(filepath.Dir(pkgAssetPath), 0755)
		if err != nil {
			t.Fatalf("failed to create assets dir: %v", err)
		}

		// Write mock pkg file
		pkgContent := `#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  echo "1.0.0"
  exit 0
fi
echo "pkg-test-tool"
`
		err = os.WriteFile(pkgAssetPath, []byte(pkgContent), 0755)
		if err != nil {
			t.Fatalf("failed to write mock pkg: %v", err)
		}

		// Write fake installer script
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
		err = os.WriteFile(fakeInstallerPath, []byte(fakeInstallerContent), 0755)
		if err != nil {
			t.Fatalf("failed to write fake installer: %v", err)
		}

		// Execute installer
		stdout, stderr, exitCode, err = h.Install([]string{"pkg-test-tool"},
			"DOTFILES_TEST_PKG_BINARY_PATH="+installedBinaryPath,
			"DOTFILES_TEST_PKG_INSTALLER_PATH="+fakeInstallerPath,
		)
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed on macOS/allow_non_macos: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Verify fake installer log
		logBytes, err := os.ReadFile(fakeInstallerLogPath)
		if err != nil {
			t.Fatalf("expected fake installer to run and log, but got error: %v", err)
		}
		logStr := string(logBytes)
		if !strings.Contains(logStr, "pkg_path=") || !strings.Contains(logStr, "target=/") {
			t.Errorf("invalid fake installer log output:\n%s", logStr)
		}

		// Verify target binary was copied and is executable
		fi, err := os.Stat(installedBinaryPath)
		if err != nil {
			t.Fatalf("expected binary to be installed at %s: %v", installedBinaryPath, err)
		}
		if fi.Mode()&0111 == 0 {
			t.Errorf("expected installed binary to be executable")
		}

		// Run the current entrypoint binary to check its stdout
		currentBinaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "pkg-test-tool", "current", "pkg-test-tool")
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
		stdout, stderr, exitCode, err = h.Install([]string{"pkg-test-tool"},
			"DOTFILES_TEST_PKG_BINARY_PATH="+installedBinaryPath,
		)
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		// Ensure nothing was installed
		if _, err := os.Stat(installedBinaryPath); !os.IsNotExist(err) {
			t.Errorf("expected installed binary to NOT exist on standard non-macOS")
		}
	}
}
