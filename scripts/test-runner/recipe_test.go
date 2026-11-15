//go:build linux || darwin

package main

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func recipeFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	copyFile := func(source, target string, mode os.FileMode) {
		t.Helper()
		data, err := os.ReadFile(source)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, data, mode); err != nil {
			t.Fatal(err)
		}
	}
	copyFile("../../Justfile", filepath.Join(root, "Justfile"), 0600)
	copyFile("../../go.mod", filepath.Join(root, "go.mod"), 0600)
	for _, file := range []string{"main.go", "subreaper_linux.go", "subreaper_darwin.go"} {
		copyFile(file, filepath.Join(root, "scripts/test-runner", file), 0600)
	}
	copyFile(runnerBinary, filepath.Join(root, ".cache/test-runner/runner"), 0700)
	return root
}

func recipeCommand(t *testing.T, root, fixture string, status int) *exec.Cmd {
	t.Helper()
	helper := fixtureCommand(t, fixture, "exit")
	cmd := exec.Command("just", "_test", "go", helper.Path)
	cmd.Dir = root
	cmd.Env = append(helper.Env, "BASH_ENV=", fmt.Sprintf("RUNNER_TEST_EXIT=%d", status))
	return cmd
}

func assertRecipeResult(t *testing.T, cmd *exec.Cmd, fixture string, want int, output *bytes.Buffer) {
	t.Helper()
	status, err := suiteExit(cmd.Wait())
	if err != nil || status != want {
		t.Fatalf("recipe status = %d, %v; want %d\n%s", status, err, want, output)
	}
	state := readFixtureState(t, fixture, "exit")
	if _, err := os.Stat(state.Scratch); !os.IsNotExist(err) {
		t.Fatalf("recipe scratch survived: %v", err)
	}
	if err := syscall.Kill(-state.Group, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("recipe process group survived: %v", err)
	}
}

func TestConcurrentRecipesPublishCompleteExecutables(t *testing.T) {
	root := recipeFixture(t)
	cacheBefore, err := os.Stat(filepath.Join(root, ".cache"))
	if err != nil {
		t.Fatal(err)
	}
	type invocation struct {
		cmd     *exec.Cmd
		fixture string
		status  int
		output  bytes.Buffer
	}
	invocations := make([]invocation, 4)
	for i := range invocations {
		inv := &invocations[i]
		inv.fixture, inv.status = t.TempDir(), i
		inv.cmd = recipeCommand(t, root, inv.fixture, inv.status)
		inv.cmd.Stdout, inv.cmd.Stderr = &inv.output, &inv.output
		if err := inv.cmd.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if inv.cmd.ProcessState == nil {
				inv.cmd.Process.Signal(syscall.SIGTERM)
				inv.cmd.Wait()
			}
		})
	}
	for i := range invocations {
		inv := &invocations[i]
		assertRecipeResult(t, inv.cmd, inv.fixture, inv.status, &inv.output)
	}
	entries, err := os.ReadDir(filepath.Join(root, ".cache/test-runner"))
	if err != nil || len(entries) != 1 || entries[0].Name() != "runner" {
		t.Fatalf("candidate outputs survived: %v, %v", entries, err)
	}
	cacheAfter, err := os.Stat(filepath.Join(root, ".cache"))
	if err != nil || !cacheBefore.ModTime().Equal(cacheAfter.ModTime()) {
		t.Fatalf("runner rebuild changed repository cache-directory metadata: %v", err)
	}
}

func TestRecipeDoesNotExposePartiallyBuiltExecutable(t *testing.T) {
	root := recipeFixture(t)
	fixture := t.TempDir()
	mockBin := filepath.Join(root, "mock-bin")
	if err := os.Mkdir(mockBin, 0755); err != nil {
		t.Fatal(err)
	}
	// Hold the compiler after writing an invalid prefix to its output. The
	// previously published executable must remain runnable throughout the build.
	mockGo := `#!/bin/sh
set -eu
printf incomplete > "$3"
printf '%s\n' "$3" > "$RUNNER_TEST_DIR/candidate"
while [ ! -f "$RUNNER_TEST_DIR/release" ]; do sleep 0.01; done
cp "$RUNNER_TEST_BINARY" "$3"
chmod +x "$3"
`
	if err := os.WriteFile(filepath.Join(mockBin, "go"), []byte(mockGo), 0700); err != nil {
		t.Fatal(err)
	}
	cmd := recipeCommand(t, root, fixture, 7)
	cmd.Env = append(cmd.Env, "PATH="+mockBin+string(os.PathListSeparator)+os.Getenv("PATH"), "RUNNER_TEST_BINARY="+runnerBinary)
	var output bytes.Buffer
	cmd.Stdout, cmd.Stderr = &output, &output
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	release := func() { os.WriteFile(filepath.Join(fixture, "release"), nil, 0600) }
	t.Cleanup(func() {
		release()
		if cmd.ProcessState == nil {
			cmd.Process.Signal(syscall.SIGTERM)
			cmd.Wait()
		}
	})
	deadline := time.Now().Add(5 * time.Second)
	var candidate string
	for {
		data, err := os.ReadFile(filepath.Join(fixture, "candidate"))
		if err == nil && len(data) != 0 {
			candidate = strings.TrimSpace(string(data))
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("compiler did not publish candidate")
		}
		time.Sleep(time.Millisecond)
	}
	if candidate == filepath.Join(root, ".cache/test-runner/runner") {
		t.Fatal("build is overwriting the published executable")
	}
	probe := exec.Command(filepath.Join(root, ".cache/test-runner/runner"))
	probeOutput, err := probe.CombinedOutput()
	status, statusErr := suiteExit(err)
	if statusErr != nil || status != 2 || !bytes.Contains(probeOutput, []byte("usage: test-runner")) {
		t.Fatalf("cached executable was damaged during build: %d, %v, %s", status, statusErr, probeOutput)
	}
	release()
	assertRecipeResult(t, cmd, fixture, 7, &output)
	if _, err := os.Stat(candidate); !os.IsNotExist(err) {
		t.Fatalf("published candidate was not removed: %v", err)
	}
}

func TestRecipeBuildFailurePreservesPublishedExecutable(t *testing.T) {
	root := recipeFixture(t)
	mockBin := filepath.Join(root, "mock-bin")
	if err := os.Mkdir(mockBin, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mockBin, "go"), []byte("#!/bin/sh\nprintf incomplete > \"$3\"\nexit 23\n"), 0700); err != nil {
		t.Fatal(err)
	}
	cmd := recipeCommand(t, root, t.TempDir(), 0)
	cmd.Env = append(cmd.Env, "PATH="+mockBin+string(os.PathListSeparator)+os.Getenv("PATH"))
	output, err := cmd.CombinedOutput()
	status, statusErr := suiteExit(err)
	if statusErr != nil || status != 23 {
		t.Fatalf("compiler failure = %d, %v, %s", status, statusErr, output)
	}
	entries, err := os.ReadDir(filepath.Join(root, ".cache/test-runner"))
	if err != nil || len(entries) != 1 || entries[0].Name() != "runner" {
		t.Fatalf("failed build left candidates: %v, %v", entries, err)
	}
	probe := exec.Command(filepath.Join(root, ".cache/test-runner/runner"))
	output, err = probe.CombinedOutput()
	status, statusErr = suiteExit(err)
	if statusErr != nil || status != 2 || !bytes.Contains(output, []byte("usage: test-runner")) {
		t.Fatalf("compiler failure damaged cached executable: %d, %v, %s", status, statusErr, output)
	}
}
