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

// TestE2EConfigurationEvaluatedOnlyOnce proves the configuration file is evaluated
// exactly once during an end-to-end command run.
func TestE2EConfigurationEvaluatedOnlyOnce(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{ConfigPath: "config.ts"})

	counterFile := filepath.Join(h.TempDir, "e2e-eval-count.txt")
	configContent := "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n\n" +
		"export default defineConfig(async (ctx) => {\n" +
		"  const file = " + jsString(filepath.ToSlash(counterFile)) + ";\n" +
		"  let count = 0;\n" +
		"  if (fsExists(file)) {\n" +
		"    count = parseInt(fsReadFile(file), 10) || 0;\n" +
		"  }\n" +
		"  fsWriteFile(file, String(count + 1));\n" +
		"  return {\n" +
		"    paths: {\n" +
		"      dotfilesDir: ctx.configFileDir,\n" +
		"      generatedDir: ctx.configFileDir + \"/.generated\",\n" +
		"      homeDir: ctx.configFileDir + \"/.generated/home\",\n" +
		"      targetDir: ctx.configFileDir + \"/.generated/bin\",\n" +
		"    },\n" +
		"  };\n" +
		"});\n"
	if err := os.WriteFile(h.ConfigPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing the configuration: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("expected generate to succeed, got exit code %d, err %v\nstdout: %s\nstderr: %s", exitCode, err, stdout, stderr)
	}

	data, err := os.ReadFile(counterFile)
	if err != nil {
		t.Fatalf("reading counter file: %v", err)
	}
	if got := strings.TrimSpace(string(data)); got != "1" {
		t.Errorf("configuration was evaluated %s times in E2E generate, want 1", got)
	}
}
