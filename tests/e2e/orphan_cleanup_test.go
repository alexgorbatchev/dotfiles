package e2e

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const orphanedToolConfig = `import { defineTool } from "@dotfiles/cli";

export default defineTool((install) =>
  install("github-release", {
    repo: "repo/github-release-tool",
  })
    .bin("github-release-tool")
    .version("latest")
    .symlink("./config", "~/.config/github-release-tool"),
);
`

// TestE2EOrphanedToolCleanup removes a tool's whole directory from the repository, as
// deleting a tool does, which leaves the configuration link it created pointing at a
// directory that is gone. The next generate has to remove the link, the shim and the
// downloaded binary, and record each removal.
func TestE2EOrphanedToolCleanup(t *testing.T) {
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

	toolDir := filepath.Join(h.TempDir, "tools", "github-release-tool")
	if err := os.WriteFile(filepath.Join(toolDir, "github-release-tool.tool.ts"), []byte(orphanedToolConfig), 0o644); err != nil {
		t.Fatalf("writing the tool configuration: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(toolDir, "config"), 0o755); err != nil {
		t.Fatalf("creating the configuration directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolDir, "config", "settings.toml"), []byte("theme = dark\n"), 0o644); err != nil {
		t.Fatalf("writing the configuration file: %v", err)
	}

	generated := filepath.Join(h.TempDir, ".generated")
	link := filepath.Join(generated, "user-home", ".config", "github-release-tool")
	shim := filepath.Join(generated, "user-bin", "github-release-tool")
	installDir := filepath.Join(generated, "binaries", "github-release-tool")

	if stdout, stderr, exitCode, err := h.Install([]string{"github-release-tool"}); err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	for _, path := range []string{link, shim, filepath.Join(installDir, "current", "github-release-tool")} {
		if _, err := os.Lstat(path); err != nil {
			t.Fatalf("install did not create %s: %v", path, err)
		}
	}

	if err := os.RemoveAll(toolDir); err != nil {
		t.Fatalf("removing the tool directory: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	for _, path := range []string{link, shim, installDir} {
		if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s survived the orphaned tool's cleanup (lstat error %v)", path, err)
		}
	}
	h.AssertDBOperationLogged("github-release-tool", "rm", filepath.Join(".config", "github-release-tool"))
	h.AssertDBOperationLogged("github-release-tool", "rm", filepath.Join("user-bin", "github-release-tool"))
	assertNoInstallationRecord(t, h, "github-release-tool")

	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("repeated generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if strings.Contains(stdout+stderr, "[github-release-tool]") {
		t.Errorf("the repeated generate cleaned the tool up again:\n%s%s", stdout, stderr)
	}

	// An install directory an earlier version left behind after deleting the tool's
	// records is found by its layout instead.
	leftover := filepath.Join(generated, "binaries", "long-gone-tool")
	if err := os.MkdirAll(filepath.Join(leftover, "current"), 0o755); err != nil {
		t.Fatalf("creating the leftover install: %v", err)
	}
	if err := os.WriteFile(filepath.Join(leftover, "current", "long-gone-tool"), []byte("binary"), 0o755); err != nil {
		t.Fatalf("writing the leftover binary: %v", err)
	}
	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate with a leftover install failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	if _, err := os.Lstat(leftover); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the leftover install directory survived generate (lstat error %v)", err)
	}
}

func assertNoInstallationRecord(t *testing.T, h *TestHarness, toolName string) {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(h.TempDir, ".generated", "registry.db"))
	if err != nil {
		t.Fatalf("opening the registry: %v", err)
	}
	defer db.Close()
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM tool_installations WHERE tool_name = ?", toolName).Scan(&count); err != nil {
		t.Fatalf("querying the registry: %v", err)
	}
	if count != 0 {
		t.Errorf("the registry still records an installation of %s", toolName)
	}
}

// The CLI uses real installers here, but every reachable application is inside the
// harness. Canonical /Applications receipts lack identity or target Linux, so these
// cases exercise refusal before any native command or host bundle access.
func TestE2EAppBundleCleanupPreservesUnverifiedApplications(t *testing.T) {
	for _, route := range []string{"generate", "cleanup", "uninstall"} {
		for _, kind := range []string{"legacy", "unsafe", "linux"} {
			t.Run(route+"/"+kind, func(t *testing.T) {
				h := NewTestHarness(t, HarnessOptions{ConfigContent: `export default { paths: { generatedDir: "{configFileDir}/.generated", homeDir: "{paths.generatedDir}/home", targetDir: "{paths.generatedDir}/bin", toolConfigsDir: "{configFileDir}/tools" } };`, Env: map[string]string{"DOTFILES_E2E_USE_REAL_INSTALLERS": "true"}})
				if err := os.MkdirAll(filepath.Join(h.TempDir, "tools"), 0755); err != nil {
					t.Fatal(err)
				}
				if out, stderr, code, err := h.Generate(); err != nil || code != 0 {
					t.Fatalf("generate: %v %d %s%s", err, code, out, stderr)
				}
				if route == "uninstall" {
					source := `import { defineTool } from "@dotfiles/cli"; export default defineTool(install => install("dmg", { source: {type:"url",url:"https://example.com/app.dmg"} }));`
					if err := os.WriteFile(filepath.Join(h.TempDir, "tools", "recorded-app.tool.ts"), []byte(source), 0644); err != nil {
						t.Fatal(err)
					}
				}
				ownApp := filepath.Join(h.TempDir, "Recorded.app")
				if err := os.MkdirAll(ownApp, 0755); err != nil {
					t.Fatal(err)
				}
				marker := filepath.Join(ownApp, "unrelated")
				if err := os.WriteFile(marker, []byte("keep"), 0644); err != nil {
					t.Fatal(err)
				}
				bundle, platform, want := "/Applications/Recorded.app", "macos", "no identity was recorded"
				var id, hash any
				switch kind {
				case "unsafe":
					bundle = ownApp
					id, hash = "example.recorded", "hash"
					want = "not an app bundle directly"
				case "linux":
					platform = "linux"
					id, hash = "example.recorded", "hash"
					want = "target is not macOS"
				}
				installDir := filepath.Join(h.TempDir, ".generated", "binaries", "recorded-app")
				if err := os.MkdirAll(filepath.Join(installDir, "current"), 0755); err != nil {
					t.Fatal(err)
				}
				database, err := sql.Open("sqlite", filepath.Join(h.TempDir, ".generated", "registry.db"))
				if err != nil {
					t.Fatal(err)
				}
				_, err = database.Exec("INSERT INTO tool_installations(tool_name,version,install_path,timestamp,installed_at,binary_paths,install_method,app_bundle_path,app_bundle_identifier,app_bundle_info_plist_hash) VALUES('recorded-app','1',?,'now',0,'[]','dmg',?,?,?)", installDir, bundle, id, hash)
				if closeErr := database.Close(); err == nil {
					err = closeErr
				}
				if err != nil {
					t.Fatal(err)
				}
				args := []string{"state", route, "--config", h.ConfigPath, "--platform", platform}
				if route == "uninstall" {
					args = []string{"tool", "uninstall", "recorded-app", "--config", h.ConfigPath, "--platform", platform}
				}
				out, stderr, code, err := h.RunCommand(args...)
				if err != nil || code != 0 || !strings.Contains(out+stderr, want) {
					t.Fatalf("cleanup: %v %d, want %q in %s%s", err, code, want, out, stderr)
				}
				if data, err := os.ReadFile(marker); err != nil || string(data) != "keep" {
					t.Fatalf("unverified app changed: %q %v", data, err)
				}
				if _, err := os.Lstat(installDir); !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("owned install directory survived: %v", err)
				}
				assertNoInstallationRecord(t, h, "recorded-app")
			})
		}
	}
}
