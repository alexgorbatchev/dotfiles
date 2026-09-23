package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// runMainEnv makes the test binary run main() instead of the tests, so
// TestMainProcess can observe main's exit status and stderr.
const runMainEnv = "DEV_BOOTSTRAP_TEST_RUN_MAIN"

// minimalConfig is the smallest configuration the CLI loads without a
// generated declaration package in the target directory.
const minimalConfig = `export default { paths: { generatedDir: "./.generated" } };`

// sharedDevBinDir holds the dev binary shared by every test. TestMain owns
// it and removes it once the tests have run. It lives in the OS temp
// directory, like t.TempDir, rather than the repository's .tmp: packages that
// load a TypeScript configuration record the repository root's entries as
// test inputs, so writing under .tmp would invalidate their cached results.
var sharedDevBinDir string

// realRepoRoot is the repository under test, resolved by TestMain before any
// test can change the working directory (TestRunCompilesDevBinary does).
var realRepoRoot string

// buildSharedDevBin compiles ./cmd/dotfiles once per test binary run. It is
// built lazily so tests that never deploy (such as TestParseArgs) skip it.
var buildSharedDevBin = sync.OnceValues(func() (string, error) {
	dir, err := os.MkdirTemp("", "dev-bootstrap-test-")
	if err != nil {
		return "", fmt.Errorf("creating shared dev binary directory: %w", err)
	}
	sharedDevBinDir = dir
	devBin := filepath.Join(dir, binName("dotfiles-dev"))
	cmd := exec.Command("go", "build", "-o", devBin, "./cmd/dotfiles")
	cmd.Dir = realRepoRoot
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("building shared dev binary: %w\n%s", err, out)
	}
	return devBin, nil
})

func TestMain(m *testing.M) {
	if os.Getenv(runMainEnv) == "1" {
		main()
		os.Exit(0)
	}
	root, err := getRepoRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolving repo root: %v\n", err)
		os.Exit(1)
	}
	realRepoRoot = root
	code := m.Run()
	if sharedDevBinDir != "" {
		if err := os.RemoveAll(sharedDevBinDir); err != nil {
			fmt.Fprintf(os.Stderr, "removing shared dev binary directory: %v\n", err)
		}
	}
	os.Exit(code)
}

func sharedDevBin(t *testing.T) string {
	t.Helper()
	devBin, err := buildSharedDevBin()
	if err != nil {
		t.Fatal(err)
	}
	return devBin
}

func writeTestFile(t *testing.T, path, content string, perm os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("failed to create directory for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), perm); err != nil {
		t.Fatalf("failed to write %s: %v", path, err)
	}
}

// newConfiguredTarget returns a target directory holding a dotfiles.config.ts
// with the given content.
func newConfiguredTarget(t *testing.T, content string) string {
	t.Helper()
	target := t.TempDir()
	writeTestFile(t, filepath.Join(target, "dotfiles.config.ts"), content, 0644)
	return target
}

// writeMockCLI writes a shell script standing in for the dotfiles CLI.
func writeMockCLI(t *testing.T, script string) string {
	t.Helper()
	mockBin := filepath.Join(t.TempDir(), "mock-dotfiles")
	writeTestFile(t, mockBin, "#!/bin/sh\n"+script, 0755)
	return mockBin
}

// newFakeRepoRoot returns a module holding a single Go program at relPath, so
// the step of Run that executes it (scripts/build/main.go for the asset
// refresh, cmd/dotfiles/main.go for the compile) runs a stub instead of the
// real repository's code.
func newFakeRepoRoot(t *testing.T, relPath, source string) string {
	t.Helper()
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "go.mod"), "module example.com/fakerepo\n", 0644)
	writeTestFile(t, filepath.Join(root, relPath), source, 0644)
	return root
}

func deployedBinPath(target string) string {
	return filepath.Join(target, ".generated", "binaries", "dotfiles", "current", binName("dotfiles"))
}

func TestDevBootstrap(t *testing.T) {
	repoRoot := realRepoRoot
	devBin := sharedDevBin(t)

	t.Run("bootstraps directory with existing config", func(t *testing.T) {
		tmpTarget := newConfiguredTarget(t, `import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    toolConfigsDir: configFileDir + "/tools",
    generatedDir: configFileDir + "/.generated",
    targetDir: configFileDir + "/target",
  },
}));
`)
		if err := os.MkdirAll(filepath.Join(tmpTarget, "tools"), 0755); err != nil {
			t.Fatalf("failed to create tools dir: %v", err)
		}

		var stdout, stderr bytes.Buffer
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
			Verbose:    true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}
		if err := Run(opts); err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		deployedBin := deployedBinPath(tmpTarget)
		info, err := os.Stat(deployedBin)
		if err != nil {
			t.Fatalf("expected deployed binary at %s, but stat failed: %v", deployedBin, err)
		}
		if !info.Mode().IsRegular() {
			t.Errorf("expected deployed binary to be a regular file, got mode: %v", info.Mode())
		}
		// Executing the copy proves it is runnable on any platform and umask.
		if out, err := exec.Command(deployedBin, "self", "version").CombinedOutput(); err != nil {
			t.Errorf("failed to run the deployed binary: %v\n%s", err, out)
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
		writeTestFile(t, filepath.Join(tmpTarget, "dotfiles.config.js"), `export default {
  paths: {
    dotfilesDir: "./",
    toolConfigsDir: "./tools",
    generatedDir: "./.generated",
    targetDir: "./target",
  },
};
`, 0644)
		if err := os.MkdirAll(filepath.Join(tmpTarget, "tools"), 0755); err != nil {
			t.Fatalf("failed to create tools dir: %v", err)
		}

		var stdout, stderr bytes.Buffer
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}
		if err := Run(opts); err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		if _, err := os.Stat(deployedBinPath(tmpTarget)); err != nil {
			t.Fatalf("expected deployed binary: %v", err)
		}
	})

	t.Run("bootstraps fresh empty directory without config", func(t *testing.T) {
		tmpTarget := t.TempDir()

		var stdout, stderr bytes.Buffer
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     devBin,
			SkipAssets: true,
			Stdout:     &stdout,
			Stderr:     &stderr,
		}
		if err := Run(opts); err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		configPath := filepath.Join(tmpTarget, "dotfiles.config.ts")
		if _, err := os.Stat(configPath); err != nil {
			t.Errorf("expected starter config at %s, but stat failed: %v", configPath, err)
		}
		if _, err := os.Stat(deployedBinPath(tmpTarget)); err != nil {
			t.Errorf("expected deployed binary: %v", err)
		}
	})

}

// TestRunCompilesDevBinary exercises the compile step against a fake
// repository root whose ./cmd/dotfiles is a stub, so the test neither builds
// the real CLI a second time nor overwrites the repository's .tmp/dotfiles-dev.
func TestRunCompilesDevBinary(t *testing.T) {
	repoRoot := newFakeRepoRoot(t, filepath.Join("cmd", "dotfiles", "main.go"), `package main

import (
	"fmt"
	"os"
	"strings"
)

var Version = "unstamped"

// Prints nothing for "path get binaries", so Run deploys to its fallback
// directory, and succeeds for "state generate".
func main() {
	if strings.HasSuffix(strings.Join(os.Args[1:], " "), "self version") {
		fmt.Println(Version)
	}
}
`)
	// An empty RepoRoot is resolved from the working directory.
	t.Chdir(repoRoot)
	tmpTarget := newConfiguredTarget(t, minimalConfig)

	var stdout, stderr bytes.Buffer
	opts := Options{
		TargetDir:  tmpTarget,
		SkipAssets: true,
		Stdout:     &stdout,
		Stderr:     &stderr,
	}
	if err := Run(opts); err != nil {
		t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
	}

	if !strings.Contains(stdout.String(), "[dev-bootstrap] Compiling dev binary for") {
		t.Errorf("expected output to mention compiling dev binary, got: %s", stdout.String())
	}
	devBin := filepath.Join(repoRoot, ".tmp", binName("dotfiles-dev"))
	if _, err := os.Stat(devBin); err != nil {
		t.Errorf("expected the dev binary in the repository root's .tmp: %v", err)
	}

	verOut, err := exec.Command(deployedBinPath(tmpTarget), "self", "version").Output()
	if err != nil {
		t.Fatalf("failed to run self version on deployed binary: %v", err)
	}
	// Whatever git reports for the fake root (usually "unknown", but a
	// GIT_DIR in the environment points it elsewhere) must be stamped in.
	if got, want := strings.TrimSpace(string(verOut)), "999.0.0-dev."+getGitShortSHA(repoRoot); got != want {
		t.Errorf("deployed binary version = %q, want %q", got, want)
	}
}

// TestRunRefreshesAssets exercises the SkipAssets: false branch against a fake
// repository root. Running the real scripts/build/main.go here would rewrite
// pkg/embedded/dist and pkg/dashboard/dist while other packages compile
// against them (issue #180).
func TestRunRefreshesAssets(t *testing.T) {
	const recordFile = "build-args.txt"
	buildScript := filepath.Join("scripts", "build", "main.go")

	t.Run("runs the asset build from the repository root", func(t *testing.T) {
		repoRoot := newFakeRepoRoot(t, buildScript, `package main

import (
	"os"
	"strings"
)

// The relative path proves the build runs from the repository root.
func main() {
	if err := os.WriteFile("`+recordFile+`", []byte(strings.Join(os.Args[1:], " ")), 0o644); err != nil {
		os.Exit(2)
	}
}
`)
		var stdout, stderr bytes.Buffer
		opts := Options{
			RepoRoot:  repoRoot,
			TargetDir: newConfiguredTarget(t, minimalConfig),
			DevBin:    sharedDevBin(t),
			Stdout:    &stdout,
			Stderr:    &stderr,
		}
		if err := Run(opts); err != nil {
			t.Fatalf("Run failed: %v\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
		}

		recorded, err := os.ReadFile(filepath.Join(repoRoot, recordFile))
		if err != nil {
			t.Fatalf("expected the asset build to run in the repository root: %v", err)
		}
		if got := string(recorded); got != "--assets-only" {
			t.Errorf("asset build arguments = %q, want %q", got, "--assets-only")
		}
		if !strings.Contains(stdout.String(), "[dev-bootstrap] Refreshing embedded declaration assets...") {
			t.Errorf("expected output to mention refreshing assets, got: %s", stdout.String())
		}
	})

	t.Run("reports a failing asset build with its output", func(t *testing.T) {
		repoRoot := newFakeRepoRoot(t, buildScript, `package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "stub asset build failed")
	os.Exit(1)
}
`)
		opts := Options{
			RepoRoot:  repoRoot,
			TargetDir: t.TempDir(),
			Stdout:    &bytes.Buffer{},
		}
		err := Run(opts)
		if err == nil {
			t.Fatal("expected an error when the asset build fails")
		}
		for _, want := range []string{"refreshing embedded assets", "stub asset build failed"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("expected error to contain %q, got: %v", want, err)
			}
		}
	})

	t.Run("fails on a nonexistent repository root", func(t *testing.T) {
		opts := Options{
			RepoRoot:  filepath.Join(t.TempDir(), "missing"),
			TargetDir: t.TempDir(),
			Stdout:    &bytes.Buffer{},
		}
		if err := Run(opts); err == nil || !strings.Contains(err.Error(), "refreshing embedded assets") {
			t.Errorf("expected an asset refresh error, got: %v", err)
		}
	})
}

func TestGetGitShortSHA(t *testing.T) {
	sha := getGitShortSHA(realRepoRoot)
	if sha == "" || sha == "unknown" {
		t.Errorf("expected valid git SHA from repoRoot, got: %q", sha)
	}

	shaNonGit := getGitShortSHA(t.TempDir())
	if shaNonGit != "unknown" {
		t.Errorf("expected 'unknown' from non-git dir, got: %q", shaNonGit)
	}
}

// TestParseArgs covers the command line on its own. Running the pipeline from
// here would compile the CLI and refresh the embedded assets of the real
// repository (issues #171 and #180).
func TestParseArgs(t *testing.T) {
	tests := []struct {
		name        string
		args        []string
		wantTarget  string
		wantVerbose bool
	}{
		{name: "no arguments leaves the target to Run", args: nil, wantTarget: ""},
		{name: "empty target leaves the target to Run", args: []string{""}, wantTarget: ""},
		{name: "positional target", args: []string{"/srv/dotfiles"}, wantTarget: "/srv/dotfiles"},
		{name: "short verbose flag", args: []string{"-v"}, wantTarget: "", wantVerbose: true},
		{name: "long verbose flag with target", args: []string{"-verbose", "~/dots"}, wantTarget: "~/dots", wantVerbose: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			opts, err := parseArgs(tt.args, &stdout, &stderr)
			if err != nil {
				t.Fatalf("parseArgs(%q) error = %v, stderr: %s", tt.args, err, stderr.String())
			}
			want := Options{TargetDir: tt.wantTarget, Verbose: tt.wantVerbose, Stdout: &stdout, Stderr: &stderr}
			if opts != want {
				t.Errorf("parseArgs(%q) = %+v, want %+v", tt.args, opts, want)
			}
		})
	}
}

func TestParseArgsRejectsInvalidArguments(t *testing.T) {
	tests := []struct {
		name       string
		args       []string
		wantErr    string
		wantStderr string
	}{
		{
			name:       "unknown flag",
			args:       []string{"-invalid-flag-xyz"},
			wantErr:    "flag provided but not defined: -invalid-flag-xyz",
			wantStderr: "flag provided but not defined: -invalid-flag-xyz",
		},
		{
			name:       "more than one target",
			args:       []string{"a", "b"},
			wantErr:    `expected at most one target directory, got 2: "a" "b"`,
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
		{
			name:       "extra target after verbose flag",
			args:       []string{"-v", "a", "b", "c"},
			wantErr:    `expected at most one target directory, got 3: "a" "b" "c"`,
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
		{
			name:       "flag after the target",
			args:       []string{"a", "-v"},
			wantErr:    "flag -v must come before the target directory",
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
		{
			name:       "long flag with a value after the target",
			args:       []string{"a", "--verbose=true"},
			wantErr:    "flag --verbose=true must come before the target directory",
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
		{
			name:       "flag-like arguments after -- are targets",
			args:       []string{"--", "a", "-v"},
			wantErr:    `expected at most one target directory, got 2: "a" "-v"`,
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
		{
			name:       "undefined dash argument after the target",
			args:       []string{"a", "-x"},
			wantErr:    `expected at most one target directory, got 2: "a" "-x"`,
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
		{
			name:       "bare dash after the target",
			args:       []string{"a", "-"},
			wantErr:    `expected at most one target directory, got 2: "a" "-"`,
			wantStderr: "Usage: dev-bootstrap [-v] [target]",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			_, err := parseArgs(tt.args, &stdout, &stderr)
			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("parseArgs(%q) error = %v, want %q", tt.args, err, tt.wantErr)
			}
			if !strings.Contains(stderr.String(), tt.wantStderr) {
				t.Errorf("expected stderr to contain %q, got: %q", tt.wantStderr, stderr.String())
			}
		})
	}
}

func TestRunMainStopsOnInvalidArguments(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if err := runMain([]string{"-invalid-flag-xyz"}, &stdout, &stderr); err == nil {
		t.Fatal("expected an error for an unknown flag")
	}
	if stdout.Len() != 0 {
		t.Errorf("expected the pipeline not to start, got stdout: %q", stdout.String())
	}
}

func TestMainProcess(t *testing.T) {
	cmd := exec.Command(os.Args[0], "-invalid-flag-for-main")
	cmd.Env = append(os.Environ(), runMainEnv+"=1")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 1 {
		t.Fatalf("expected main to exit with status 1, got: %v\nstderr: %s", err, stderr.String())
	}
	if want := "Error: flag provided but not defined: -invalid-flag-for-main\n"; !strings.HasSuffix(stderr.String(), want) {
		t.Errorf("expected stderr to end with %q, got: %q", want, stderr.String())
	}
	if stdout.Len() != 0 {
		t.Errorf("expected no stdout, got: %q", stdout.String())
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
	opts := Options{
		RepoRoot:   realRepoRoot,
		TargetDir:  newConfiguredTarget(t, minimalConfig),
		DevBin:     sharedDevBin(t),
		SkipAssets: true,
		Stdout:     nil,
		Stderr:     nil,
	}
	if err := Run(opts); err != nil {
		t.Fatalf("unexpected error with nil outputs: %v", err)
	}
}

func TestDevBootstrapErrors(t *testing.T) {
	repoRoot := realRepoRoot

	t.Run("fails on invalid target directory", func(t *testing.T) {
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  filepath.Join(t.TempDir(), "invalid\x00path"),
			DevBin:     sharedDevBin(t),
			SkipAssets: true,
		}
		if err := Run(opts); err == nil {
			t.Error("expected error for invalid target path")
		}
	})

	t.Run("fails on broken config in verbose and non-verbose", func(t *testing.T) {
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  newConfiguredTarget(t, `invalid typescript syntax !!!`),
			DevBin:     sharedDevBin(t),
			SkipAssets: true,
		}
		if err := Run(opts); err == nil {
			t.Error("expected error for broken config")
		}

		opts.Verbose = true
		if err := Run(opts); err == nil {
			t.Error("expected error for broken config in verbose mode")
		}
	})

	t.Run("fails when state generate fails in verbose and non-verbose mode", func(t *testing.T) {
		// The path reaches the mock through the environment so the shell never parses it.
		t.Setenv("MOCK_BINARIES_DIR", filepath.Join(t.TempDir(), "binaries"))
		// Answers "path get binaries", fails "state generate".
		mockBin := writeMockCLI(t, "for arg in \"$@\"; do\n  if [ \"$arg\" = \"binaries\" ]; then\n    printf '%s\\n' \"$MOCK_BINARIES_DIR\"\n    exit 0\n  fi\ndone\nexit 1\n")

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  newConfiguredTarget(t, minimalConfig),
			DevBin:     mockBin,
			SkipAssets: true,
			Verbose:    false,
		}
		if err := Run(opts); err == nil {
			t.Error("expected error when state generate fails in non-verbose mode")
		}

		opts.Verbose = true
		if err := Run(opts); err == nil {
			t.Error("expected error when state generate fails in verbose mode")
		}
	})

	t.Run("fails when tool scaffold fails in starter directory", func(t *testing.T) {
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  t.TempDir(),
			DevBin:     writeMockCLI(t, "exit 1\n"),
			SkipAssets: true,
		}
		if err := Run(opts); err == nil {
			t.Error("expected error when tool scaffold fails")
		}
	})

	t.Run("falls back to default binaries directory when path get returns empty", func(t *testing.T) {
		tmpTarget := newConfiguredTarget(t, minimalConfig)
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  tmpTarget,
			DevBin:     writeMockCLI(t, "exit 0\n"),
			SkipAssets: true,
		}
		if err := Run(opts); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, err := os.Stat(deployedBinPath(tmpTarget)); err != nil {
			t.Errorf("expected binary at fallback path: %v", err)
		}
	})

	t.Run("fails when the deployment directory cannot be created", func(t *testing.T) {
		// A regular file where the binaries directory should be makes MkdirAll fail.
		blocker := filepath.Join(t.TempDir(), "blocker")
		writeTestFile(t, blocker, "", 0644)
		t.Setenv("BLOCKED_BINARIES_DIR", filepath.Join(blocker, "binaries"))

		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  newConfiguredTarget(t, minimalConfig),
			DevBin:     writeMockCLI(t, "printf '%s\\n' \"$BLOCKED_BINARIES_DIR\"\n"),
			SkipAssets: true,
		}
		err := Run(opts)
		if err == nil || !strings.Contains(err.Error(), "creating destination directory") {
			t.Errorf("expected a destination directory error, got: %v", err)
		}
	})

	t.Run("fails when dev binary cannot be read", func(t *testing.T) {
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  newConfiguredTarget(t, minimalConfig),
			DevBin:     filepath.Join(t.TempDir(), "nonexistent-bin"),
			SkipAssets: true,
		}
		if err := Run(opts); err == nil {
			t.Error("expected error when dev binary cannot be read")
		}
	})

	t.Run("fails when compilation of dev binary fails", func(t *testing.T) {
		tmpRoot := t.TempDir()
		// A module without ./cmd/dotfiles makes go build fail.
		writeTestFile(t, filepath.Join(tmpRoot, "go.mod"), "module example.com/fake\n", 0644)

		opts := Options{
			RepoRoot:   tmpRoot,
			TargetDir:  t.TempDir(),
			SkipAssets: true,
		}
		if err := Run(opts); err == nil || !strings.Contains(err.Error(), "compiling dev binary") {
			t.Errorf("expected a compile error, got: %v", err)
		}
	})

	t.Run("defaults target to home dotfiles when empty", func(t *testing.T) {
		// Build before HOME changes: the Go toolchain must never run under a
		// test-overridden HOME (issue #171).
		devBin := sharedDevBin(t)
		tmpHome := t.TempDir()
		t.Setenv("HOME", tmpHome)
		dotfilesDir := filepath.Join(tmpHome, ".dotfiles")
		writeTestFile(t, filepath.Join(dotfilesDir, "dotfiles.config.ts"), minimalConfig, 0644)

		var stdout bytes.Buffer
		opts := Options{
			RepoRoot:   repoRoot,
			TargetDir:  "",
			DevBin:     devBin,
			SkipAssets: true,
			Stdout:     &stdout,
		}
		if err := Run(opts); err != nil {
			t.Fatalf("expected Run with empty target to succeed, got: %v", err)
		}
		if !strings.Contains(stdout.String(), "[dev-bootstrap] Resolving target paths for "+dotfilesDir) {
			t.Errorf("expected the default target %s, got: %s", dotfilesDir, stdout.String())
		}
	})
}
