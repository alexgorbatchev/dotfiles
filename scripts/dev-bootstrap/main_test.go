package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func buildSharedDevBin(t *testing.T, repoRoot string) string {
	t.Helper()
	tmpDir := t.TempDir()
	binName := "dotfiles-dev"
	if runtime.GOOS == "windows" {
		binName = "dotfiles-dev.exe"
	}
	devBin := filepath.Join(tmpDir, binName)
	cmd := exec.Command("go", "build", "-o", devBin, "./cmd/dotfiles")
	cmd.Dir = repoRoot
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("failed to build test binary: %v\n%s", err, string(out))
	}
	return devBin
}

func TestDevBootstrap(t *testing.T) {
	repoRoot, err := getRepoRoot()
	if err != nil {
		t.Fatalf("failed to get repo root: %v", err)
	}

	devBin := buildSharedDevBin(t, repoRoot)

	t.Run("bootstraps directory with existing config", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		configContent := `import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    toolConfigsDir: configFileDir + "/tools",
    generatedDir: configFileDir + "/.generated",
    targetDir: configFileDir + "/target",
  },
}));
`
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("failed to write config: %v", err)
		}
		if err := os.MkdirAll(filepath.Join(tmpTarget, "tools"), 0755); err != nil {
			t.Fatalf("failed to create tools dir: %v", err)
		}

		var stdout bytes.Buffer
		var stderr bytes.Buffer

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
			Verbose:    true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}

		err = Run(opts)
		if err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		binName := "dotfiles"
		if runtime.GOOS == "windows" {
			binName = "dotfiles.exe"
		}
		deployedBin := filepath.Join(tmpTarget, ".generated", "binaries", "dotfiles", "current", binName)

		info, err := os.Stat(deployedBin)
		if err != nil {
			t.Fatalf("expected deployed binary at %s, but stat failed: %v", deployedBin, err)
		}
		if runtime.GOOS != "windows" && (info.Mode()&0111 == 0) {
			t.Errorf("expected deployed binary to be executable, got mode: %v", info.Mode())
		}

		outStr := stdout.String()
		expectedPhrases := []string{
			"[dev-bootstrap] Resolving target paths for " + tmpTarget,
			"[dev-bootstrap] Deploying binary to " + deployedBin,
			"[dev-bootstrap] Running state generate...",
			"[dev-bootstrap] Successfully bootstrapped " + tmpTarget + " with local development build.",
		}
		for _, phrase := range expectedPhrases {
			if !strings.Contains(outStr, phrase) {
				t.Errorf("expected output to contain %q, but got:\n%s", phrase, outStr)
			}
		}
	})

	t.Run("bootstraps directory with existing js config", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.js")
		configContent := `export default {
  paths: {
    dotfilesDir: "./",
    toolConfigsDir: "./tools",
    generatedDir: "./.generated",
    targetDir: "./target",
  },
};
`
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("failed to write js config: %v", err)
		}
		if err := os.MkdirAll(filepath.Join(tmpTarget, "tools"), 0755); err != nil {
			t.Fatalf("failed to create tools dir: %v", err)
		}

		var stdout bytes.Buffer
		var stderr bytes.Buffer

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}

		err = Run(opts)
		if err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		binName := "dotfiles"
		if runtime.GOOS == "windows" {
			binName = "dotfiles.exe"
		}
		deployedBin := filepath.Join(tmpTarget, ".generated", "binaries", "dotfiles", "current", binName)
		if _, err := os.Stat(deployedBin); err != nil {
			t.Fatalf("expected deployed binary at %s: %v", deployedBin, err)
		}
	})

	t.Run("bootstraps fresh empty directory without config", func(t *testing.T) {
		tmpTarget := t.TempDir()

		var stdout bytes.Buffer
		var stderr bytes.Buffer

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}

		err = Run(opts)
		if err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		if _, err := os.Stat(configPath); err != nil {
			t.Errorf("expected starter config at %s, but stat failed: %v", configPath, err)
		}

		binName := "dotfiles"
		if runtime.GOOS == "windows" {
			binName = "dotfiles.exe"
		}
		deployedBin := filepath.Join(tmpTarget, ".generated", "binaries", "dotfiles", "current", binName)
		if _, err := os.Stat(deployedBin); err != nil {
			t.Errorf("expected deployed binary at %s, but stat failed: %v", deployedBin, err)
		}
	})

	t.Run("compiles dev binary and resolves repoRoot if empty", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		configContent := `export default {
  paths: {
    generatedDir: "./.generated",
  },
};
`
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("failed to write config: %v", err)
		}

		var stdout bytes.Buffer
		var stderr bytes.Buffer

		opts := Options{
			TargetDir:  tmpTarget,
			SkipAssets: true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}

		err = Run(opts)
		if err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		outStr := stdout.String()
		if !strings.Contains(outStr, "[dev-bootstrap] Compiling dev binary for") {
			t.Errorf("expected output to mention compiling dev binary, got: %s", outStr)
		}
	})
}

func TestRunMain(t *testing.T) {
	repoRoot, err := getRepoRoot()
	if err != nil {
		t.Fatalf("failed to get repo root: %v", err)
	}

	devBin := buildSharedDevBin(t, repoRoot)

	t.Run("parses args and succeeds with target", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		// Place devBin in .tmp
		tmpDevBinDir := filepath.Join(repoRoot, ".tmp")
		_ = os.MkdirAll(tmpDevBinDir, 0755)
		devBinName := "dotfiles-dev"
		if runtime.GOOS == "windows" {
			devBinName = "dotfiles-dev.exe"
		}
		data, _ := os.ReadFile(devBin)
		_ = os.WriteFile(filepath.Join(tmpDevBinDir, devBinName), data, 0755)

		var stdout bytes.Buffer
		var stderr bytes.Buffer

		// Test invalid flag
		err := runMain([]string{"-invalid-flag-xyz"}, &stdout, &stderr)
		if err == nil {
			t.Error("expected error for invalid flag")
		}

		// Test valid flags
		stdout.Reset()
		stderr.Reset()
		// We set HOME to tmpTarget to test default target resolution
		t.Setenv("HOME", tmpTarget)
		dotfilesDir := filepath.Join(tmpTarget, ".dotfiles")
		_ = os.MkdirAll(dotfilesDir, 0755)
		_ = os.WriteFile(filepath.Join(dotfilesDir, "dotfiles.config.ts"), []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		err = runMain([]string{"-v", dotfilesDir}, &stdout, &stderr)
		if err != nil {
			t.Fatalf("runMain with -v failed: %v\nstderr: %s", err, stderr.String())
		}
	})
}

func TestMainProcess(t *testing.T) {
	if os.Getenv("TEST_MAIN") == "1" {
		main()
		return
	}

	cmd := exec.Command(os.Args[0], "-test.run=TestMainProcess", "--", "-invalid-flag-for-main")
	cmd.Env = append(os.Environ(), "TEST_MAIN=1")
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("expected main to exit with non-zero on error, output: %s", string(out))
	}
}

func TestFindRepoRootFrom(t *testing.T) {
	tmpDir := t.TempDir()
	// No go.mod in tmpDir or its parents until /
	root, err := findRepoRootFrom(tmpDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if root != tmpDir {
		t.Errorf("expected fallback to %s, got %s", tmpDir, root)
	}
}

func TestNilOutputs(t *testing.T) {
	repoRoot, err := getRepoRoot()
	if err != nil {
		t.Fatalf("failed to get repo root: %v", err)
	}
	devBin := buildSharedDevBin(t, repoRoot)

	tmpTarget := t.TempDir()
	configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
	_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

	opts := Options{
		RepoRoot:   repoRoot,
		TargetDir:  tmpTarget,
		DevBin:     devBin,
		SkipAssets: true,
		Stdout:     nil,
		Stderr:     nil,
	}
	err = Run(opts)
	if err != nil {
		t.Fatalf("unexpected error with nil outputs: %v", err)
	}
}

func TestDevBootstrapErrors(t *testing.T) {
	repoRoot, err := getRepoRoot()
	if err != nil {
		t.Fatalf("failed to get repo root: %v", err)
	}

	devBin := buildSharedDevBin(t, repoRoot)

	t.Run("fails on invalid target directory", func(t *testing.T) {
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  filepath.Join(t.TempDir(), "invalid\x00path"),
			DevBin:     devBin,
			SkipAssets: true,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error for invalid target path")
		}
	})

	t.Run("fails on invalid repo root", func(t *testing.T) {
		opts := Options{
			RepoRoot:  "/nonexistent/directory/for/repo",
			TargetDir: t.TempDir(),
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error for invalid repo root")
		}
	})

	t.Run("fails on broken config in verbose and non-verbose", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`invalid typescript syntax !!!`), 0644)

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error for broken config")
		}

		opts.Verbose = true
		err = Run(opts)
		if err == nil {
			t.Error("expected error for broken config in verbose mode")
		}
	})

	t.Run("fails when refreshing assets fails", func(t *testing.T) {
		tmpRoot := t.TempDir()
		// create scripts/build/main.go that fails
		scriptDir := filepath.Join(tmpRoot, "scripts", "build")
		_ = os.MkdirAll(scriptDir, 0755)
		_ = os.WriteFile(filepath.Join(scriptDir, "main.go"), []byte("package main\nimport \"os\"\nfunc main() { os.Exit(1) }\n"), 0644)
		_ = os.WriteFile(filepath.Join(tmpRoot, "go.mod"), []byte("module example.com/fake\n"), 0644)

		opts := Options{
			RepoRoot:   tmpRoot,
			TargetDir:  t.TempDir(),
			SkipAssets: false,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error when refreshing assets fails")
		}
	})

	t.Run("fails when state generate fails in verbose and non-verbose mode", func(t *testing.T) {
		tmpDir := t.TempDir()
		binDir := filepath.Join(tmpDir, "binaries")
		_ = os.MkdirAll(binDir, 0755)

		// Create mock devBin script: returns binDir for "path get binaries", fails on "state generate"
		mockBin := filepath.Join(tmpDir, "mock-dotfiles")
		mockScript := "#!/bin/sh\nfor arg in \"$@\"; do\n  if [ \"$arg\" = \"binaries\" ]; then\n    echo \"" + binDir + "\"\n    exit 0\n  fi\ndone\nexit 1\n"
		if err := os.WriteFile(mockBin, []byte(mockScript), 0755); err != nil {
			t.Fatalf("failed to write mock script: %v", err)
		}

		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		// Non-verbose
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     mockBin,
			SkipAssets: true,
			Verbose:    false,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error when state generate fails in non-verbose mode")
		}

		// Verbose
		opts.Verbose = true
		err = Run(opts)
		if err == nil {
			t.Error("expected error when state generate fails in verbose mode")
		}
	})

	t.Run("fails when tool scaffold fails in starter directory", func(t *testing.T) {
		tmpDir := t.TempDir()
		mockBin := filepath.Join(tmpDir, "mock-fail-scaffold")
		mockScript := "#!/bin/sh\nexit 1\n"
		if err := os.WriteFile(mockBin, []byte(mockScript), 0755); err != nil {
			t.Fatalf("failed to write mock script: %v", err)
		}

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  t.TempDir(),
			DevBin:     mockBin,
			SkipAssets: true,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error when tool scaffold fails")
		}
	})

	t.Run("falls back to default binaries directory when path get returns empty", func(t *testing.T) {
		tmpDir := t.TempDir()
		mockBin := filepath.Join(tmpDir, "mock-empty-binaries")
		mockScript := "#!/bin/sh\nexit 0\n"
		if err := os.WriteFile(mockBin, []byte(mockScript), 0755); err != nil {
			t.Fatalf("failed to write mock script: %v", err)
		}

		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     mockBin,
			SkipAssets: true,
		}
		err := Run(opts)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		expectedBin := filepath.Join(tmpTarget, ".generated", "binaries", "dotfiles", "current", "dotfiles")
		if runtime.GOOS == "windows" {
			expectedBin += ".exe"
		}
		if _, err := os.Stat(expectedBin); err != nil {
			t.Errorf("expected binary at fallback path %s: %v", expectedBin, err)
		}
	})

	t.Run("fails when dev binary cannot be read", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     filepath.Join(t.TempDir(), "nonexistent-bin"),
			SkipAssets: true,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error when dev binary cannot be read")
		}
	})

	t.Run("fails when compilation of dev binary fails", func(t *testing.T) {
		tmpRoot := t.TempDir()
		// Fake go.mod so getRepoRoot finds it
		_ = os.WriteFile(filepath.Join(tmpRoot, "go.mod"), []byte("module example.com/fake\n"), 0644)

		opts := Options{
			RepoRoot:   tmpRoot,
			TargetDir:  t.TempDir(),
			SkipAssets: true,
		}
		err := Run(opts)
		if err == nil {
			t.Error("expected error when compiling dev binary fails")
		}
	})

	t.Run("runs with SkipAssets false", func(t *testing.T) {
		tmpTarget := t.TempDir()
		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		_ = os.WriteFile(configPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		var stdout bytes.Buffer
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: false,
			Stdout:     &stdout,
		}
		err := Run(opts)
		if err != nil {
			t.Fatalf("expected Run with SkipAssets false to succeed, got: %v", err)
		}
		if !strings.Contains(stdout.String(), "Refreshing embedded declaration assets...") {
			t.Errorf("expected output to mention refreshing assets, got: %s", stdout.String())
		}
	})

	t.Run("defaults target to home dotfiles when empty", func(t *testing.T) {
		tmpHome := t.TempDir()
		t.Setenv("HOME", tmpHome)
		dotfilesDir := filepath.Join(tmpHome, ".dotfiles")
		_ = os.MkdirAll(dotfilesDir, 0755)
		_ = os.WriteFile(filepath.Join(dotfilesDir, "dotfiles.config.ts"), []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0644)

		var stdout bytes.Buffer
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  "",
			DevBin:     devBin,
			SkipAssets: true,
			Stdout:     &stdout,
		}
		err := Run(opts)
		if err != nil {
			t.Fatalf("expected Run with empty target to succeed, got: %v", err)
		}
	})
}
