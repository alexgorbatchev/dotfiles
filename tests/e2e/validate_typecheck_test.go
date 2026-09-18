package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
)

// installCompilerInSandbox makes the fixture's typescript tool look installed by placing
// the repository's native TypeScript compiler where `dotfiles install` would: under the
// tool's current directory, the way PromoteBinaries links a nested `package/lib/tsc`.
func installCompilerInSandbox(t *testing.T, h *TestHarness) {
	t.Helper()
	compiler, err := testutil.FindTypeScriptCompiler(h.ProjectRoot)
	if err != nil {
		t.Fatalf("locating the TypeScript compiler: %v", err)
	}
	currentDir := filepath.Join(h.TempDir, ".generated", "binaries", "typescript", "current")
	if err := os.MkdirAll(currentDir, 0755); err != nil {
		t.Fatalf("creating %s: %v", currentDir, err)
	}
	if err := os.Symlink(compiler, filepath.Join(currentDir, "tsc")); err != nil {
		t.Fatalf("linking compiler: %v", err)
	}
}

// `dotfiles validate` type-checks the tool configurations with the compiler the
// scaffolded typescript tool provides, reports the compiler's absence as an error rather
// than skipping, and maps each diagnostic onto the tool whose file it is in.
func TestE2EValidateTypeChecks(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
	h.CopyFixture("typecheck")

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed (exit %d): %v\nstdout: %s\nstderr: %s", exitCode, err, stdout, stderr)
	}

	t.Run("the compiler gets no shim", func(t *testing.T) {
		if _, err := os.Stat(filepath.Join(h.TempDir, ".generated", "user-bin", "tsc")); !os.IsNotExist(err) {
			t.Fatalf("expected no tsc shim in the generated bin directory (stat err = %v)", err)
		}
	})

	t.Run("an uninstalled compiler is an actionable error", func(t *testing.T) {
		stdout, _, exitCode, err := h.RunCommand("validate", "--config", h.ConfigPath)
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if exitCode == 0 {
			t.Fatalf("expected validate to fail while the compiler is not installed:\n%s", stdout)
		}
		if !strings.Contains(stdout, "not installed") || !strings.Contains(stdout, "dotfiles install typescript") {
			t.Errorf("expected an actionable message naming `dotfiles install typescript`:\n%s", stdout)
		}
	})

	installCompilerInSandbox(t, h)

	t.Run("a valid project passes", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.RunCommand("validate", "--config", h.ConfigPath)
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if exitCode != 0 {
			t.Fatalf("expected validate to pass (exit %d):\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
		}
		if !strings.Contains(stdout, "all valid") {
			t.Errorf("expected the all-valid summary:\n%s", stdout)
		}
		if !strings.Contains(stderr, "Type-checking tool configurations with") {
			t.Errorf("expected the type-check to be announced on stderr:\n%s", stderr)
		}
	})

	t.Run("a type error is attributed to its tool", func(t *testing.T) {
		broken := filepath.Join(h.TempDir, "tools", "broken.tool.ts")
		content := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n\n" +
			"export default defineTool((install) =>\n" +
			"  install(\"github-release\", { repo: \"owner/broken\", assetSelector: \"*.tar.gz\" }).bin(\"broken\"),\n" +
			");\n"
		if err := os.WriteFile(broken, []byte(content), 0644); err != nil {
			t.Fatalf("writing broken tool: %v", err)
		}

		stdout, _, exitCode, err := h.RunCommand("validate", "--config", h.ConfigPath)
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if exitCode == 0 {
			t.Fatalf("expected validate to fail on the type error:\n%s", stdout)
		}
		if !strings.Contains(stdout, "broken.tool.ts] broken: TS2353") || !strings.Contains(stdout, "'assetSelector' does not exist") {
			t.Errorf("expected the diagnostic to be attributed to tool broken:\n%s", stdout)
		}
		if !strings.Contains(stdout, "1 validation error(s) found") {
			t.Errorf("expected exactly one error in the summary:\n%s", stdout)
		}
	})
}
