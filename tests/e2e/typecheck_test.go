package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
)

// runGeneratedTypeCheck runs the repository's native TypeScript compiler over the
// tsconfig `dotfiles generate` wrote under the sandbox's generated directory.
func runGeneratedTypeCheck(t *testing.T, h *TestHarness) (string, int) {
	t.Helper()
	compiler, err := testutil.FindTypeScriptCompiler(h.ProjectRoot)
	if err != nil {
		t.Fatalf("locating the TypeScript compiler: %v", err)
	}
	cmd := exec.Command(compiler, "--pretty", "false", "-p", filepath.Join(h.TempDir, ".generated", "tsconfig.json"))
	cmd.Dir = h.TempDir
	output, runErr := cmd.CombinedOutput()
	exitCode := 0
	if exitError, ok := runErr.(*exec.ExitError); ok {
		exitCode = exitError.ExitCode()
	} else if runErr != nil {
		t.Fatalf("running %s: %v\n%s", compiler, runErr, output)
	}
	return string(output), exitCode
}

// `dotfiles generate` writes a tsconfig the CLI owns, and the bin-name registry it
// writes is a module that augments the package, so type-checking with that tsconfig
// accepts every configured binary name (a disabled tool's included) and rejects a name
// no tool declares.
func TestE2EGenerateWritesTypeCheckProgram(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})
	h.CopyFixture("typecheck")

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed (exit %d): %v\nstdout: %s\nstderr: %s", exitCode, err, stdout, stderr)
	}

	t.Run("registry is a module listing the disabled tool", func(t *testing.T) {
		registry, err := os.ReadFile(filepath.Join(h.TempDir, ".generated", "tool-types.d.ts"))
		if err != nil {
			t.Fatalf("reading registry: %v", err)
		}
		if !strings.Contains(string(registry), "import \"@alexgorbatchev/dotfiles\";") {
			t.Errorf("registry is not a module:\n%s", registry)
		}
		if !strings.Contains(string(registry), `"helper": never;`) {
			t.Errorf("registry omits the disabled tool's binary:\n%s", registry)
		}
	})

	t.Run("project tsconfig extends the generated one", func(t *testing.T) {
		h.AssertFileContentContains("tsconfig.json", `"extends": "./.generated/tsconfig.json"`)
		h.AssertFileContentContains(".generated/tsconfig.json", `"../tools/**/*.ts"`)
		h.AssertFileContentContains(".generated/tsconfig.json", `"../config.ts"`)
		h.AssertFileContentContains(".generated/tsconfig.json", `globals.d.ts`)
	})

	t.Run("configured binaries type-check", func(t *testing.T) {
		output, code := runGeneratedTypeCheck(t, h)
		if code != 0 {
			t.Fatalf("expected the fixture to type-check, got exit %d:\n%s", code, output)
		}
	})

	t.Run("an unregistered binary name is rejected", func(t *testing.T) {
		stray := filepath.Join(h.TempDir, "tools", "stray.tool.ts")
		content := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n\nexport default defineTool((install) => install(\"manual\").bin(\"stray\").dependsOn(\"nobody-provides-this\"));\n"
		if err := os.WriteFile(stray, []byte(content), 0644); err != nil {
			t.Fatalf("writing stray tool: %v", err)
		}
		output, code := runGeneratedTypeCheck(t, h)
		if code == 0 {
			t.Fatalf("expected a type error for the unregistered name, got a clean run:\n%s", output)
		}
		if !strings.Contains(output, "stray.tool.ts") || !strings.Contains(output, "nobody-provides-this") {
			t.Errorf("expected the error to name stray.tool.ts and the unregistered binary:\n%s", output)
		}
		if strings.Contains(output, "consumer.tool.ts") || strings.Contains(output, "helper.tool.ts") {
			t.Errorf("the valid tools must not be reported:\n%s", output)
		}
	})
}
