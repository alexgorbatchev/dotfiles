package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// `__dirname` in a tool file names the directory of the configuration file, and a tool
// file is evaluated twice -- once while the configuration loads, once again when a hook
// fires -- so both readings have to be the same directory. The project here points
// paths.dotfilesDir somewhere else, which is the case that tells them apart: a tool file
// locating a neighbouring script used to find it while the configuration loaded and then
// resolve against paths.dotfilesDir once its own hook ran.
func TestE2EHookDirnameIsTheConfigurationFilesDirectory(t *testing.T) {
	t.Parallel()

	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
		Env: map[string]string{
			"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
		},
	})

	configContent := `export default {
  paths: {
    dotfilesDir: "./elsewhere",
    generatedDir: "{configFileDir}/.generated",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "{configFileDir}/tools",
  },
};`
	if err := os.WriteFile(h.ConfigPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("writing config.ts: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(h.TempDir, "elsewhere"), 0755); err != nil {
		t.Fatalf("creating the dotfiles directory: %v", err)
	}

	toolDir := filepath.Join(h.TempDir, "tools", "dirname-probe")
	if err := os.MkdirAll(toolDir, 0755); err != nil {
		t.Fatalf("creating the tool directory: %v", err)
	}
	// The file's top level runs again on every re-evaluation, so both readings are taken
	// during the installation: the point is that they name the configuration file's
	// directory rather than the one paths.dotfilesDir was moved to.
	toolContent := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"\n" +
		"const atTopLevel = __dirname;\n" +
		"\n" +
		"export default defineTool((install) =>\n" +
		"  install(\"manual\")\n" +
		"    .hook(\"before-install\", async ({ $, stagingDir }) => {\n" +
		"      await $`echo staged > ${stagingDir}/payload.txt`;\n" +
		"    })\n" +
		"    .hook(\"after-install\", async ({ log }) => {\n" +
		"      log.info(\"dirname in the handler: \" + __dirname);\n" +
		"      log.info(\"dirname at the top level: \" + atTopLevel);\n" +
		"    }),\n" +
		");\n"
	if err := os.WriteFile(filepath.Join(toolDir, "dirname-probe.tool.ts"), []byte(toolContent), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	stdout, stderr, exitCode, err := h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	stdout, stderr, exitCode, err = h.Install([]string{"dirname-probe"})
	output := stdout + stderr
	if err != nil || exitCode != 0 {
		t.Fatalf("install failed: %v\noutput: %s", err, output)
	}

	for _, where := range []string{"dirname in the handler: ", "dirname at the top level: "} {
		want := where + h.TempDir
		if !strings.Contains(output, want) {
			t.Errorf("expected output to contain %q, got:\n%s", want, output)
		}
	}
	if strings.Contains(output, filepath.Join(h.TempDir, "elsewhere")) {
		t.Errorf("__dirname resolved to paths.dotfilesDir instead of the configuration file's directory:\n%s", output)
	}
}
