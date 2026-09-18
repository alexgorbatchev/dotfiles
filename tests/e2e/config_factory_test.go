package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// An asynchronous configuration is a form the documentation shows, so the settings it
// resolves to have to reach the run. A promise that is never settled serializes as an
// empty object, which is a valid configuration: the run would succeed with every
// setting the file wrote replaced by its default, writing its output somewhere the
// author never named.
func TestE2EAsyncConfigurationTakesEffect(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})

	generatedDir := filepath.Join(h.TempDir, "from-async")
	configContent := "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n\n" +
		"async function chooseGeneratedDir(): Promise<string> {\n" +
		"  return " + jsString(filepath.ToSlash(generatedDir)) + ";\n" +
		"}\n\n" +
		"export default defineConfig(async () => ({\n" +
		"  paths: {\n" +
		"    generatedDir: await chooseGeneratedDir(),\n" +
		"    homeDir: \"{paths.generatedDir}/user-home\",\n" +
		"    targetDir: \"{paths.generatedDir}/user-bin\",\n" +
		"  },\n" +
		"}));\n"
	if err := os.WriteFile(h.ConfigPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing the configuration: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("expected generate to succeed, got exit code %d, err %v\nstdout: %s\nstderr: %s", exitCode, err, stdout, stderr)
	}

	if _, err := os.Stat(generatedDir); err != nil {
		t.Fatalf("expected generate to write into the directory the configuration resolved to: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
}

// jsString quotes a path for embedding in a TypeScript source.
func jsString(value string) string {
	return "\"" + strings.ReplaceAll(value, "\"", "\\\"") + "\""
}
