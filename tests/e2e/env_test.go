package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/venv"
)

func TestE2EVenv(t *testing.T) {
	t.Parallel()

	t.Run("venv manager operations", func(t *testing.T) {
		tempDir := t.TempDir()
		osFS := fs.NewOSFS()
		mgr := venv.NewManager(osFS)

		testEnvName := "test-env"
		testEnvDir := filepath.Join(tempDir, testEnvName)

		// Create
		info, err := mgr.Create(tempDir, testEnvName, false)
		if err != nil {
			t.Fatalf("failed to create env: %v", err)
		}
		if info.EnvDir != testEnvDir {
			t.Errorf("expected env dir %q, got %q", testEnvDir, info.EnvDir)
		}

		// Verify files
		configPath := filepath.Join(testEnvDir, "dotfiles.config.ts")
		sourcePath := filepath.Join(testEnvDir, "source")
		psPath := filepath.Join(testEnvDir, "source.ps1")
		toolsDir := filepath.Join(testEnvDir, "tools")

		if _, err := os.Stat(configPath); err != nil {
			t.Errorf("config file does not exist: %v", err)
		}
		if _, err := os.Stat(sourcePath); err != nil {
			t.Errorf("POSIX source script does not exist: %v", err)
		}
		if _, err := os.Stat(psPath); err != nil {
			t.Errorf("PowerShell source script does not exist: %v", err)
		}
		fi, err := os.Stat(toolsDir)
		if err != nil || !fi.IsDir() {
			t.Errorf("tools directory does not exist or is not a directory")
		}

		// Verify script permissions
		sfi, err := os.Stat(sourcePath)
		if err != nil {
			t.Fatalf("failed to stat source path: %v", err)
		}
		if sfi.Mode()&0111 == 0 {
			t.Errorf("expected POSIX source script to be executable")
		}

		// Check POSIX source content
		srcContentBytes, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("failed to read source path: %v", err)
		}
		srcContent := string(srcContentBytes)
		if !strings.HasPrefix(srcContent, "#!/bin/sh") {
			t.Errorf("expected POSIX source to start with shebang")
		}
		if !strings.Contains(srcContent, "export XDG_CONFIG_HOME=\"${_dotfiles_script_dir}/.config\"") {
			t.Errorf("expected POSIX source to export XDG_CONFIG_HOME")
		}

		// Check PowerShell source content
		psContentBytes, err := os.ReadFile(psPath)
		if err != nil {
			t.Fatalf("failed to read ps path: %v", err)
		}
		psContent := string(psContentBytes)
		if !strings.Contains(psContent, "Dotfiles Virtual Environment Activation Script (PowerShell)") {
			t.Errorf("expected PS source to have PS comment header")
		}
		if !strings.Contains(psContent, "$env:XDG_CONFIG_HOME = \"$targetDir\\.config\"") {
			t.Errorf("expected PS source to export XDG_CONFIG_HOME")
		}

		// IsValidEnv check
		isValid, err := mgr.IsValidEnv(testEnvDir)
		if err != nil || !isValid {
			t.Errorf("IsValidEnv returned %v, err: %v, expected true", isValid, err)
		}

		// Create when already exists error
		_, err = mgr.Create(tempDir, testEnvName, false)
		if err == nil {
			t.Error("expected error creating already existing env without force")
		}

		// Create when already exists with force success
		_, err = mgr.Create(tempDir, testEnvName, true)
		if err != nil {
			t.Errorf("expected success creating already existing env with force: %v", err)
		}

		// Delete
		err = mgr.Delete(testEnvDir)
		if err != nil {
			t.Fatalf("failed to delete env: %v", err)
		}

		if _, err := os.Stat(testEnvDir); !os.IsNotExist(err) {
			t.Error("expected env directory to be removed")
		}

		// Delete non-existent
		err = mgr.Delete(filepath.Join(tempDir, "non-existent-env"))
		if err == nil {
			t.Error("expected error when deleting non-existent env")
		}
	})

	t.Run("activated environment with tool generation", func(t *testing.T) {
		h := NewTestHarness(t, HarnessOptions{})

		// Create virtual environment under temp dir
		osFS := fs.NewOSFS()
		mgr := venv.NewManager(osFS)
		envName := "activated-env-temp"
		info, err := mgr.Create(h.TempDir, envName, true)
		if err != nil {
			t.Fatalf("failed to create virtual environment: %v", err)
		}

		// Customize config.ts inside the virtual-env to define paths
		// Import from @alexgorbatchev/dotfiles directly so esbuild resolves it properly
		venvConfigContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(info.EnvDir) + `/.generated",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(info.EnvDir) + `/tools",
  },
};
`
		err = os.WriteFile(filepath.Join(info.EnvDir, "config.ts"), []byte(venvConfigContent), 0644)
		if err != nil {
			t.Fatalf("failed to write config.ts: %v", err)
		}

		// Add a shell-only tool that doesn't require network
		shellOnlyToolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install()
    .zsh((shell) =>
      shell.aliases({ 'env-test-alias': 'echo "env tool works"' })
    )
    .bash((shell) =>
      shell.aliases({ 'env-test-alias': 'echo "env tool works"' })
    )
);
`
		err = os.WriteFile(filepath.Join(info.EnvDir, "tools", "test-tool.tool.ts"), []byte(shellOnlyToolContent), 0644)
		if err != nil {
			t.Fatalf("failed to write tool config: %v", err)
		}

		// Run generate with harness targeting this env's config
		h.ConfigPath = filepath.Join(info.EnvDir, "config.ts")
		stdout, stderr, exitCode, err := h.Generate()
		if err != nil {
			t.Fatalf("generate failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}
		if exitCode != 0 {
			t.Fatalf("generate returned exit code %d, stdout: %s\nstderr: %s", exitCode, stdout, stderr)
		}

		// Assert .generated directory exists
		generatedDir := filepath.Join(info.EnvDir, ".generated")
		if _, err := os.Stat(generatedDir); err != nil {
			t.Errorf("expected .generated directory to exist in env")
		}

		// Assert shell-scripts exists
		shellScriptsDir := filepath.Join(generatedDir, "shell-scripts")
		if _, err := os.Stat(shellScriptsDir); err != nil {
			t.Errorf("expected shell-scripts directory to exist in env .generated")
		}

		// Assert aliases in generated scripts
		zshScript := filepath.Join(shellScriptsDir, "main.zsh")
		zshContent, err := os.ReadFile(zshScript)
		if err != nil {
			t.Fatalf("failed to read main.zsh: %v", err)
		}
		if !strings.Contains(string(zshContent), "alias env-test-alias='echo \"env tool works\"'") &&
			!strings.Contains(string(zshContent), `alias env-test-alias="echo 'env tool works'"`) &&
			!strings.Contains(string(zshContent), `alias env-test-alias="echo \"env tool works\""`) {
			t.Errorf("expected main.zsh to contain env-test-alias, but got:\n%s", string(zshContent))
		}

		bashScript := filepath.Join(shellScriptsDir, "main.bash")
		bashContent, err := os.ReadFile(bashScript)
		if err != nil {
			t.Fatalf("failed to read main.bash: %v", err)
		}
		if !strings.Contains(string(bashContent), "alias env-test-alias='echo \"env tool works\"'") &&
			!strings.Contains(string(bashContent), `alias env-test-alias="echo 'env tool works'"`) &&
			!strings.Contains(string(bashContent), `alias env-test-alias="echo \"env tool works\""`) {
			t.Errorf("expected main.bash to contain env-test-alias, but got:\n%s", string(bashContent))
		}
	})
}
