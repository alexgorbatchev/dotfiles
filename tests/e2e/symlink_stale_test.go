package e2e

import (
	"os"
	"path/filepath"
	"testing"
)

const toolConfigOneSymlink = `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) => install().symlink("./my-config.yml", "~/.config/symlink-tool/config.yml"));
`

const toolConfigTwoSymlinks = `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install()
    .symlink("./my-config.yml", "~/.config/symlink-tool/config.yml")
    .symlink("./extra-config.yml", "~/.config/symlink-tool/extra.yml"),
);
`

func TestE2ESymlinkStale(t *testing.T) {
	h := NewTestHarness(t, HarnessOptions{
		ConfigPath: "config.ts",
	})

	h.CopyFixture("symlink-stale")

	// Write clean self-contained config.ts with absolute paths
	configContent := `export default {
  paths: {
    generatedDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, ".generated")) + `",
    homeDir: "{paths.generatedDir}/user-home",
    targetDir: "{paths.generatedDir}/user-bin",
    toolConfigsDir: "` + filepath.ToSlash(filepath.Join(h.TempDir, "tools")) + `",
  },
};`
	err := os.WriteFile(filepath.Join(h.TempDir, "config.ts"), []byte(configContent), 0644)
	if err != nil {
		t.Fatalf("failed to write config.ts: %v", err)
	}

	// Ensure the source files are placed in the root of TempDir where the CLI resolves relative paths
	err = os.WriteFile(filepath.Join(h.TempDir, "my-config.yml"), []byte("my-config content\n"), 0644)
	if err != nil {
		t.Fatalf("failed to write my-config source file: %v", err)
	}

	toolConfigPath := filepath.Join(h.TempDir, "tools", "symlink-tool", "symlink-tool.tool.ts")
	extraSourcePath := filepath.Join(h.TempDir, "extra-config.yml")

	// Phase 1: single symlink, generate twice - no stale warnings
	err = os.WriteFile(toolConfigPath, []byte(toolConfigOneSymlink), 0644)
	if err != nil {
		t.Fatalf("failed to write tool config: %v", err)
	}

	// Symlink is created under dynamic "~" subdirectory due to literal tilde handling in Go port
	symlinkDir := filepath.Join(h.TempDir, "~", ".config", "symlink-tool")
	configPath := filepath.Join(symlinkDir, "config.yml")
	extraPath := filepath.Join(symlinkDir, "extra.yml")

	stdout, stderr, exitCode, err := h.Generate()
	t.Logf("GENERATE STDOUT: %s", stdout)
	t.Logf("GENERATE STDERR: %s", stderr)
	if err != nil || exitCode != 0 {
		t.Fatalf("generate run 1 failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Verify symlink config.yml exists and is symlink
	fi, err := os.Lstat(configPath)
	if err != nil {
		t.Fatalf("config.yml symlink was not created: %v", err)
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("expected config.yml to be a symlink")
	}

	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate run 2 failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Phase 2: add second symlink, generate twice - no stale warnings
	err = os.WriteFile(toolConfigPath, []byte(toolConfigTwoSymlinks), 0644)
	if err != nil {
		t.Fatalf("failed to write two-symlink tool config: %v", err)
	}
	err = os.WriteFile(extraSourcePath, []byte("extra: true\n"), 0644)
	if err != nil {
		t.Fatalf("failed to write extra source: %v", err)
	}

	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate run 3 failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	fi, err = os.Lstat(configPath)
	if err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("expected config.yml to still be a symlink")
	}
	fi, err = os.Lstat(extraPath)
	if err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("expected extra.yml to be a symlink")
	}

	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate run 4 failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	// Phase 3: remove second symlink from config, also delete its source file
	// to create a broken symlink - tests that lstat (not exists) is used for cleanup
	err = os.WriteFile(toolConfigPath, []byte(toolConfigOneSymlink), 0644)
	if err != nil {
		t.Fatalf("failed to restore one-symlink tool config: %v", err)
	}
	err = os.Remove(extraSourcePath)
	if err != nil {
		t.Fatalf("failed to remove extra-config source: %v", err)
	}

	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate run 5 failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}

	fi, err = os.Lstat(configPath)
	if err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("expected config.yml to still be a symlink")
	}

	// Phase 4: generate again
	stdout, stderr, exitCode, err = h.Generate()
	if err != nil || exitCode != 0 {
		t.Fatalf("generate run 6 failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
	}
	fi, err = os.Lstat(configPath)
	if err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("expected config.yml to still be a symlink")
	}
}
