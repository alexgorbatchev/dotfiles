package e2e

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func getInstalledToolVersion(t *testing.T, tempDir string, toolName string) string {
	t.Helper()
	dbPath := filepath.Join(tempDir, ".generated", "registry.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	var version string
	err = db.QueryRow("SELECT version FROM tool_installations WHERE tool_name = ?", toolName).Scan(&version)
	if err != nil {
		t.Fatalf("failed to query version for %s: %v", toolName, err)
	}
	return version
}

func TestE2EVersionDetection(t *testing.T) {
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

	// Run generate command
	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	verifyVersionDetection := func(t *testing.T, toolName, expectedVersion string) {
		t.Helper()
		stdout, stderr, exitCode, err := h.Install([]string{toolName}, "--log=verbose", "--trace")
		if err != nil || exitCode != 0 {
			t.Fatalf("install for %s failed: %v\nstdout: %s\nstderr: %s", toolName, err, stdout, stderr)
		}

		version := getInstalledToolVersion(t, h.TempDir, toolName)
		if expectedVersion != "" {
			if version != expectedVersion {
				t.Errorf("expected tool %q version %q, got %q", toolName, expectedVersion, version)
			}
		} else if version == "" || version == "latest" || version == "unknown" {
			t.Errorf("expected tool %q to have a valid detected or timestamped version, got %q", toolName, version)
		}
	}

	t.Run("should install curl-script with custom args successfully", func(t *testing.T) {
		verifyVersionDetection(t, "version-detection--curl-script--with-args", "2.3.4")
	})

	t.Run("should install curl-script with default args successfully", func(t *testing.T) {
		verifyVersionDetection(t, "version-detection--curl-script--default-args", "")
	})

	t.Run("should install curl-tar with custom args successfully", func(t *testing.T) {
		verifyVersionDetection(t, "version-detection--curl-tar--with-args", "version-detection--curl-tar--with-args 3.4.5")
	})

	t.Run("should install curl-tar with default args successfully", func(t *testing.T) {
		verifyVersionDetection(t, "version-detection--curl-tar--default-args", "")
	})

	t.Run("should install curl-binary with custom args successfully", func(t *testing.T) {
		verifyVersionDetection(t, "version-detection--curl-binary--with-args", "5.6.7")
	})

	t.Run("should install curl-binary with default args successfully", func(t *testing.T) {
		verifyVersionDetection(t, "version-detection--curl-binary--default-args", "")
	})

	t.Run("should fall back to fallback version when version detection fails", func(t *testing.T) {
		toolName := "version-detection--curl-script--no-version"
		stdout, stderr, exitCode, err := h.Install([]string{toolName}, "--log=verbose", "--trace")
		if err != nil || exitCode != 0 {
			t.Fatalf("install for %s failed: %v\nstdout: %s\nstderr: %s", toolName, err, stdout, stderr)
		}

		binPath := filepath.Join(h.TempDir, ".generated", "binaries", toolName, "current", toolName)
		if _, err := os.Stat(binPath); err != nil {
			t.Fatalf("expected binary to exist at %s: %v", binPath, err)
		}

		version := getInstalledToolVersion(t, h.TempDir, toolName)
		if version == "" || version == "latest" || version == "unknown" {
			t.Errorf("expected valid timestamp fallback version, got %q", version)
		}
	})
}
