package e2e

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestE2EInstall(t *testing.T) {
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

	// Run generate first
	stdout, stderr, exitCode, err := h.Generate("-d")
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	binaryPath := filepath.Join(h.TempDir, ".generated", "binaries", "github-release-tool", "current", "github-release-tool")

	t.Run("should install github-release-tool", func(t *testing.T) {
		// Verify binary does not exist yet
		if _, err := os.Stat(binaryPath); err == nil {
			t.Fatalf("expected binary not to exist before install")
		}

		// Run install command
		stdout, stderr, exitCode, err := h.Install([]string{"github-release-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		t.Logf("github-release-tool install stderr:\n%s", stderr)
		t.Logf("github-release-tool install stdout:\n%s", stdout)

		// Verify binary exists and is executable
		info, err := os.Stat(binaryPath)
		if err != nil {
			var files []string
			_ = filepath.Walk(h.TempDir, func(p string, info os.FileInfo, err error) error {
				if err == nil && !info.IsDir() {
					rel, _ := filepath.Rel(h.TempDir, p)
					files = append(files, rel)
				}
				return nil
			})
			t.Fatalf("expected binary to exist after install: %v\nExisting files in sandbox:\n%s", err, strings.Join(files, "\n"))
		}
		if info.Mode()&0111 == 0 {
			t.Fatalf("expected binary to be executable")
		}

		// Verify SQLite database update
		h.AssertDBToolInstalled("github-release-tool", "1.0.0")
		h.AssertDBOperationLogged("github-release-tool", "writeFile", "github-release-tool")
	})

	t.Run("should install by binary name my-custom-binary", func(t *testing.T) {
		customBinPath := filepath.Join(h.TempDir, ".generated", "binaries", "install-by-binary-tool", "current", "my-custom-binary")

		// Run install command with binary name
		stdout, stderr, exitCode, err := h.Install([]string{"my-custom-binary"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install by binary name failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr

		// Verify binary was installed
		if _, err := os.Stat(customBinPath); err != nil {
			t.Fatalf("expected custom binary to exist: %v", err)
		}

		if !strings.Contains(output, "install-by-binary-tool") {
			t.Fatalf("expected output to mention install-by-binary-tool, but got:\n%s", output)
		}

		h.AssertDBToolInstalled("install-by-binary-tool", "1.0.0")
	})

	t.Run("should run after-install hooks and prefix logs", func(t *testing.T) {
		hookBinPath := filepath.Join(h.TempDir, ".generated", "binaries", "hook-test-tool", "current", "hook-test-tool")

		// Run install command for hook-test-tool
		stdout, stderr, exitCode, err := h.Install([]string{"hook-test-tool"})
		if err != nil || exitCode != 0 {
			t.Fatalf("install hook-test-tool failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		output := stdout + stderr

		// Verify binary was installed
		if _, err := os.Stat(hookBinPath); err != nil {
			t.Fatalf("expected hook-test-tool binary to exist: %v", err)
		}

		// Verify hook output logging format and prefixes
		if !strings.Contains(output, "shell-output-for-hook-test-tool") {
			t.Fatalf("expected output to contain hook command output, but got:\n%s", output)
		}
	})

	// The fixture configuration points the cargo section's hosts at the mock server, so
	// the latest version comes from its crates.io API and the prebuilt archive from its
	// cargo-quickinstall releases, never from crates.io or github.com.
	t.Run("should install cargo-quickinstall-tool through the configured cargo hosts", func(t *testing.T) {
		cargoBinPath := filepath.Join(h.TempDir, ".generated", "binaries", "cargo-quickinstall-tool", "current", "cargo-quickinstall-tool")

		stdout, stderr, exitCode, err := h.Install([]string{"cargo-quickinstall-tool"}, "--platform", "linux", "--arch", "amd64")
		if err != nil || exitCode != 0 {
			t.Fatalf("install cargo-quickinstall-tool failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if strings.Contains(stderr, "falling back to local compilation") {
			t.Fatalf("expected the prebuilt quickinstall archive, but the install fell back to cargo:\n%s", stderr)
		}
		if _, err := os.Stat(cargoBinPath); err != nil {
			t.Fatalf("expected cargo-quickinstall-tool binary to exist: %v", err)
		}
		h.AssertDBToolInstalled("cargo-quickinstall-tool", "1.0.0")

		want := []string{
			"/api/v1/crates/cargo-quickinstall-tool",
			"/cargo-bins/cargo-quickinstall/releases/download/cargo-quickinstall-tool-1.0.0/cargo-quickinstall-tool-1.0.0-x86_64-unknown-linux-gnu.tar.gz",
		}
		var cargoRequests []string
		for _, d := range ms.Downloads() {
			if strings.Contains(d, "cargo-quickinstall-tool") {
				cargoRequests = append(cargoRequests, d)
			}
		}
		if !slices.Equal(cargoRequests, want) {
			t.Fatalf("mock server cargo requests = %v, want exactly %v", cargoRequests, want)
		}
	})
}

func TestE2EAptInstall(t *testing.T) {
	t.Parallel()

	// Use "apt" fixture
	ms := NewMockServer(t, "apt")
	defer ms.Close()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})
	h.MockServerURL = ms.Server.URL

	h.CopyFixture("apt")

	fakeBinDir := filepath.Join(h.TempDir, "fake-bin")
	fakeAptLog := filepath.Join(h.TempDir, "fake-apt.log")

	// Set custom PATH to include fake-bin and pass FAKE_APT_LOG env var
	h.Env = map[string]string{
		"PATH":                             fakeBinDir + string(filepath.ListSeparator) + os.Getenv("PATH"),
		"FAKE_APT_LOG":                     fakeAptLog,
		"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
	}

	// Run install command
	stdout, stderr, exitCode, err := h.Install([]string{"apt-tool"})
	if err != nil || exitCode != 0 {
		t.Fatalf("apt install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify the fake-apt log contains the expected commands
	logBytes, err := os.ReadFile(fakeAptLog)
	if err != nil {
		t.Fatalf("failed to read fake apt log: %v", err)
	}
	logStr := string(logBytes)

	if !strings.Contains(logStr, "apt-get update") || !strings.Contains(logStr, "apt-get install -y ripgrep") {
		t.Fatalf("unexpected fake apt log content:\n%s", logStr)
	}
}
