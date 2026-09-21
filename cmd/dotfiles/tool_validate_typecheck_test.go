package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
)

// typeScriptProject is an on-disk project configured in TypeScript, the only kind
// validate type-checks.
type typeScriptProject struct {
	Root       string
	ConfigPath string
	ToolsDir   string
}

const compilerToolContent = `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "microsoft/typescript-go", version: "typescript/v7.0.2" }).bin("tsc", { shim: false }),
);
`

const validToolContent = `import { defineTool, type IHookContext } from "@alexgorbatchev/dotfiles";

async function announce({ log, version }: IHookContext): Promise<void> {
  log.info(version ?? "unknown");
}

export default defineTool((install, ctx) =>
  install("github-release", { repo: "owner/good", auto: false })
    .bin("good")
    .hook("after-install", announce)
    .zsh((shell) => shell.env({ GOOD_HOME: ctx.toolDir })),
);
`

// brokenToolContent has two mistakes the runtime cannot see: a parameter no installer
// reads and a shell method that does not exist.
const brokenToolContent = `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("github-release", { repo: "owner/broken", notAParameter: "*.tar.gz" })
    .bin("broken")
    .hook("after-install", async ({ $ }) => {
      await $` + "`broken --version`" + `.nothrow();
    }),
);
`

func newTypeScriptProject(t *testing.T) typeScriptProject {
	t.Helper()
	t.Setenv("DOTFILES_E2E_TEST", "true")
	root := t.TempDir()
	p := typeScriptProject{
		Root:       root,
		ConfigPath: filepath.Join(root, "dotfiles.config.ts"),
		ToolsDir:   filepath.Join(root, "tools"),
	}
	if err := os.MkdirAll(p.ToolsDir, 0755); err != nil {
		t.Fatalf("creating tools dir: %v", err)
	}
	config := "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n\n" +
		"export default defineConfig(({ configFileDir }) => ({\n" +
		"  paths: {\n" +
		"    homeDir: `${configFileDir}/home`,\n" +
		"    targetDir: `${configFileDir}/target`,\n" +
		"    generatedDir: `${configFileDir}/generated`,\n" +
		"    toolConfigsDir: `${configFileDir}/tools`,\n" +
		"  },\n" +
		"}));\n"
	if err := os.WriteFile(p.ConfigPath, []byte(config), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}
	return p
}

func (p typeScriptProject) writeTool(t *testing.T, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(p.ToolsDir, name+".tool.ts"), []byte(content), 0644); err != nil {
		t.Fatalf("writing %s: %v", name, err)
	}
}

// installCompiler places the repository's native TypeScript compiler where `dotfiles
// install` puts the typescript tool's binary: under its current directory.
func (p typeScriptProject) installCompiler(t *testing.T, toolName string) {
	t.Helper()
	repoRoot, err := testutil.RepoRoot()
	if err != nil {
		t.Fatalf("locating repository root: %v", err)
	}
	compiler, err := testutil.FindTypeScriptCompiler(repoRoot)
	if err != nil {
		t.Fatalf("locating the TypeScript compiler: %v", err)
	}
	currentDir := filepath.Join(p.Root, "generated", "binaries", toolName, "current")
	if err := os.MkdirAll(currentDir, 0755); err != nil {
		t.Fatalf("creating %s: %v", currentDir, err)
	}
	if err := os.Symlink(compiler, filepath.Join(currentDir, "tsc")); err != nil {
		t.Fatalf("linking compiler: %v", err)
	}
}

func (p typeScriptProject) run(args ...string) (commandOutput, error) {
	return runCommand(append([]string{"-c", p.ConfigPath}, args...)...)
}

func TestValidateTypeCheck_CompilerNotConfigured(t *testing.T) {
	p := newTypeScriptProject(t)
	p.writeTool(t, "good", validToolContent)

	out, err := p.run("tool", "validate")
	if err == nil {
		t.Fatalf("expected validate to fail without a compiler tool:\n%s", out.Combined)
	}
	for _, want := range []string{"No configured tool provides the TypeScript compiler", "dotfiles tool scaffold", "dotfiles tool install typescript"} {
		if !strings.Contains(out.Stdout, want) {
			t.Errorf("stdout lacks %q:\n%s", want, out.Stdout)
		}
	}

	t.Run("json reports it as an error", func(t *testing.T) {
		out, err := p.run("tool", "validate", "--json")
		if err == nil {
			t.Fatalf("expected validate --json to fail:\n%s", out.Combined)
		}
		// RenderJSON escapes angle brackets, as encoding/json does by default.
		if !strings.Contains(out.Stdout, `"valid": false`) || !strings.Contains(out.Stdout, `"tool": "\u003ctypecheck\u003e"`) {
			t.Errorf("json lacks the type-check error:\n%s", out.Stdout)
		}
	})
}

func TestValidateTypeCheck_CompilerNotInstalled(t *testing.T) {
	p := newTypeScriptProject(t)
	p.writeTool(t, "typescript", compilerToolContent)
	p.writeTool(t, "good", validToolContent)

	out, err := p.run("tool", "validate")
	if err == nil {
		t.Fatalf("expected validate to fail while the compiler is not installed:\n%s", out.Combined)
	}
	want := fmt.Sprintf("expected at %s", filepath.Join(p.Root, "generated", "binaries", "typescript", "current", "tsc"))
	for _, s := range []string{`declared by tool "typescript" is not installed`, want, "dotfiles tool install typescript"} {
		if !strings.Contains(out.Stdout, s) {
			t.Errorf("stdout lacks %q:\n%s", s, out.Stdout)
		}
	}
}

func TestValidateTypeCheck_ReportsDiagnosticsPerTool(t *testing.T) {
	p := newTypeScriptProject(t)
	p.writeTool(t, "typescript", compilerToolContent)
	p.writeTool(t, "good", validToolContent)
	p.installCompiler(t, "typescript")

	t.Run("a valid project passes", func(t *testing.T) {
		out, err := p.run("tool", "validate")
		if err != nil {
			t.Fatalf("validate: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Stdout, "Checked 2 tool configuration(s)") || !strings.Contains(out.Stdout, "all valid") {
			t.Errorf("unexpected summary:\n%s", out.Stdout)
		}
		if !strings.Contains(out.Stderr, "Type-checking tool configurations with") {
			t.Errorf("expected the compiler run to be announced:\n%s", out.Stderr)
		}
	})

	p.writeTool(t, "broken", brokenToolContent)

	t.Run("diagnostics are attributed to the tool", func(t *testing.T) {
		out, err := p.run("tool", "validate")
		if err == nil || !strings.Contains(err.Error(), "validation failed with 2 error(s)") {
			t.Fatalf("error = %v, want two type errors\n%s", err, out.Combined)
		}
		// The diagnostic code for the excess parameter is the compiler's own choice
		// between reporting the object literal or the call that takes it, and the
		// native builds do not agree, so the assertion is on the attribution, the
		// position and the message the user reads.
		for _, want := range []string{
			"broken.tool.ts] broken: TS",
			" at line 4, column ",
			"Object literal may only specify known properties, and 'notAParameter' does not exist",
			"broken.tool.ts] broken: TS2551 at line 7, column ",
			"Property 'nothrow' does not exist on type 'IShellPromise'. Did you mean 'noThrow'?",
		} {
			if !strings.Contains(out.Stdout, want) {
				t.Errorf("stdout lacks %q:\n%s", want, out.Stdout)
			}
		}
		if strings.Contains(out.Stdout, "good.tool.ts") {
			t.Errorf("the valid tool must not be reported:\n%s", out.Stdout)
		}
	})

	t.Run("validating one tool keeps only its diagnostics", func(t *testing.T) {
		out, err := p.run("tool", "validate", "good")
		if err != nil {
			t.Fatalf("validate good: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Stdout, "Checked 1 tool configuration(s)") {
			t.Errorf("unexpected summary:\n%s", out.Stdout)
		}
		out, err = p.run("tool", "validate", "broken")
		if err == nil || !strings.Contains(err.Error(), "validation failed with 2 error(s)") {
			t.Fatalf("validate broken: error = %v\n%s", err, out.Combined)
		}
	})

	t.Run("json carries the diagnostics", func(t *testing.T) {
		out, err := p.run("tool", "validate", "--json")
		if err == nil {
			t.Fatalf("expected validate --json to fail:\n%s", out.Combined)
		}
		if !strings.Contains(out.Stdout, `"tool": "broken"`) ||
			!strings.Contains(out.Stdout, "'notAParameter' does not exist") {
			t.Errorf("json lacks the attributed diagnostic:\n%s", out.Stdout)
		}
	})

	t.Run("agent mode prefixes the diagnostic", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := p.run("tool", "validate")
		if err == nil {
			t.Fatalf("expected validate to fail:\n%s", out.Combined)
		}
		if !strings.Contains(out.Stdout, "broken.tool.ts] broken: TS") || !strings.Contains(out.Stdout, "ERR: [") {
			t.Errorf("agent output lacks the prefixed diagnostic:\n%s", out.Stdout)
		}
	})
}

// A binary declared with `shim: false` is installed and recorded but never shimmed, so
// the compiler cannot shadow another project's TypeScript through the bin directory.
func TestGenerateSkipsShimForShimlessBinary(t *testing.T) {
	p := newTypeScriptProject(t)
	p.writeTool(t, "typescript", compilerToolContent)
	p.writeTool(t, "good", validToolContent)

	out, err := p.run("state", "generate")
	if err != nil {
		t.Fatalf("generate: %v\n%s", err, out.Combined)
	}
	if _, err := os.Stat(filepath.Join(p.Root, "target", "good")); err != nil {
		t.Errorf("expected a shim for good: %v", err)
	}
	if _, err := os.Stat(filepath.Join(p.Root, "target", "tsc")); !os.IsNotExist(err) {
		t.Errorf("expected no shim for tsc (stat err = %v)", err)
	}
	registry, err := os.ReadFile(filepath.Join(p.Root, "generated", "tool-types.d.ts"))
	if err != nil {
		t.Fatalf("reading registry: %v", err)
	}
	if !strings.Contains(string(registry), `"tsc": never;`) {
		t.Errorf("a shimless binary is still a configured binary name:\n%s", registry)
	}
}
