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
