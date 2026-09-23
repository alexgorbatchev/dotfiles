package e2e

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// A configuration file that exports no configuration is a configuration error: every
// command goes through the same bootstrap, so the one that reports it has to name the
// file and exit non-zero rather than dereference a configuration that is not there.
func TestE2EConfigurationFileExportsNoConfiguration(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigContent: "export default undefined;\n"})

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	if strings.Contains(output, "panic:") || strings.Contains(output, "goroutine 1 [running]") {
		t.Fatalf("expected a configuration error rather than a stack trace:\n%s", output)
	}
	if !strings.Contains(output, h.ConfigPath) {
		t.Errorf("expected the failure to name %q:\n%s", h.ConfigPath, output)
	}
	if !strings.Contains(output, "must export a configuration object") {
		t.Errorf("expected the failure to say what the file must export:\n%s", output)
	}
}

// An asynchronous configuration factory that fails has to fail the load, naming the
// configuration file: the settings it never produced would otherwise be replaced by
// their defaults and the run would carry on against a configuration nobody wrote.
func TestE2EAsyncConfigurationFailureFailsTheLoad(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n" +
			"export default defineConfig(async () => {\n  throw new Error(\"config exploded\");\n});\n",
	})

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	if !strings.Contains(output, h.ConfigPath) {
		t.Errorf("expected the failure to name %q:\n%s", h.ConfigPath, output)
	}
	if !strings.Contains(output, "config exploded") {
		t.Errorf("expected the failure to carry the error the factory threw:\n%s", output)
	}
}

// An asynchronous tool factory that fails is reported the way the synchronous one is.
// Dropping the tool from the configuration and exiting successfully would leave nothing
// in the output to search for, and the tool would be missing from every later command.
func TestE2EAsyncToolFactoryFailureFailsTheLoad(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: "export default { paths: { generatedDir: \"./.generated\" } };\n",
	})

	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating the tools directory: %v", err)
	}
	toolPath := filepath.Join(toolsDir, "boom.tool.ts")
	toolSource := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"export default defineTool(async () => {\n  throw new Error(\"factory exploded\");\n});\n"
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	if !strings.Contains(output, toolPath) {
		t.Errorf("expected the failure to name %q:\n%s", toolPath, output)
	}
	if !strings.Contains(output, "factory exploded") {
		t.Errorf("expected the failure to carry the error the factory threw:\n%s", output)
	}
}

// A misspelled conflict policy fails the load before anything is written. Falling back
// to the default would back up and replace a user-owned file that the author asked to
// keep.
func TestE2EInvalidBlockDeclarationFailsBeforeTouchingTheTarget(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: "export default { paths: { generatedDir: \"./.generated\" } };\n",
	})

	targetPath := filepath.Join(h.TempDir, "home", ".ssh", "config")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0700); err != nil {
		t.Fatalf("creating the target directory: %v", err)
	}
	const userContent = "Host personal\n  User me\n"
	if err := os.WriteFile(targetPath, []byte(userContent), 0600); err != nil {
		t.Fatalf("writing the user-owned target: %v", err)
	}

	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating the tools directory: %v", err)
	}
	toolPath := filepath.Join(toolsDir, "ssh.tool.ts")
	toolSource := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"export default defineTool((install) =>\n" +
		"  install(\"manual\").block(" + strconv.Quote(targetPath) + ", {\n" +
		"    id: \"main\",\n    content: \"Include managed\",\n    conflict: \"keep-locl\",\n  }),\n);\n"
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	// The loader records the tool file with forward slashes on every platform.
	for _, want := range []string{filepath.ToSlash(toolPath), `conflict "keep-locl"`} {
		if !strings.Contains(output, want) {
			t.Errorf("expected the failure to mention %q:\n%s", want, output)
		}
	}

	got, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("reading the target: %v", err)
	}
	if string(got) != userContent {
		t.Errorf("expected the target to be left untouched, got:\n%s", got)
	}
	siblings, err := os.ReadDir(filepath.Dir(targetPath))
	if err != nil {
		t.Fatalf("listing the target directory: %v", err)
	}
	if len(siblings) != 1 {
		t.Errorf("expected nothing but the user's file next to the target, found %d entries", len(siblings))
	}
}

// An installation method no installer registers fails the load, naming the tool file,
// the value and the methods that exist. Letting it through would give the tool a shim
// on PATH that fails on every run, and only running the binary would reveal the typo.
func TestE2EUnknownInstallationMethodFailsBeforeWritingAShim(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: "export default { paths: { generatedDir: \"./.generated\" } };\n",
	})

	toolsDir := filepath.Join(h.TempDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating the tools directory: %v", err)
	}
	toolPath := filepath.Join(toolsDir, "bogus.tool.ts")
	toolSource := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"export default defineTool((install) =>\n" +
		"  // @ts-expect-error an installation method no installer registers\n" +
		"  install(\"no-such-method\", {}).bin(\"bogus\"),\n);\n"
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if exitCode == 0 {
		t.Fatalf("expected generate to fail:\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	output := stdout + stderr
	// The loader records the tool file with forward slashes on every platform.
	for _, want := range []string{filepath.ToSlash(toolPath), `unknown installation method "no-such-method"`, "github-release"} {
		if !strings.Contains(output, want) {
			t.Errorf("expected the failure to mention %q:\n%s", want, output)
		}
	}

	shimPath := filepath.Join(h.TempDir, ".generated", "user-bin", "bogus")
	if _, err := os.Lstat(shimPath); !os.IsNotExist(err) {
		t.Errorf("expected no shim at %s, got err=%v", shimPath, err)
	}
}
