//go:build linux || darwin

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

var runnerBinary string

type fixtureState struct {
	PID     int
	Group   int
	Scratch string
}

func TestMain(m *testing.M) {
	if mode := os.Getenv("RUNNER_TEST_HELPER"); mode != "" {
		os.Exit(fixtureProcess(mode))
	}
	if err := enableSubreaper(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	root, err := os.MkdirTemp("", "dotfiles-runner-binary.")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	runnerBinary = filepath.Join(root, "test-runner")
	cmd := exec.Command("go", "build", "-o", runnerBinary, ".")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err = cmd.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.RemoveAll(root)
		os.Exit(1)
	}
	status := m.Run()
	if err := os.RemoveAll(root); err != nil {
		fmt.Fprintln(os.Stderr, err)
		status = 1
	}
	os.Exit(status)
}

func fixtureProcess(mode string) int {
	root := os.Getenv("RUNNER_TEST_DIR")
	if mode == "descendant" && os.Getenv("RUNNER_TEST_IGNORE_TERM") == "1" {
		signal.Ignore(syscall.SIGTERM)
	}
	group, err := syscall.Getpgid(0)
	if err != nil {
		panic(err)
	}
	state := fixtureState{os.Getpid(), group, os.Getenv("TMPDIR")}
	data, err := json.Marshal(state)
	if err != nil {
		panic(err)
	}
	statePath := filepath.Join(root, mode+".json")
	if err := os.WriteFile(statePath+".tmp", data, 0600); err != nil {
		panic(err)
	}
	if err := os.Rename(statePath+".tmp", statePath); err != nil {
		panic(err)
	}
	if mode == "leader" {
		exe, err := os.Executable()
		if err != nil {
			panic(err)
		}
		cmd := exec.Command(exe)
		cmd.Env = append(os.Environ(), "RUNNER_TEST_HELPER=descendant")
		if err := cmd.Start(); err != nil {
			panic(err)
		}
		deadline := time.Now().Add(5 * time.Second)
		for {
			if _, err := os.Stat(filepath.Join(root, "descendant.json")); err == nil {
				break
			}
			if time.Now().After(deadline) {
				panic("descendant did not start")
			}
			time.Sleep(time.Millisecond)
		}
		if os.Getenv("RUNNER_TEST_LEADER_WAITS") != "1" {
			return 0
		}
	}
	if mode == "exit" {
		status, _ := strconv.Atoi(os.Getenv("RUNNER_TEST_EXIT"))
		return status
	}
	for {
		time.Sleep(time.Hour)
	}
}

func readFixtureState(t *testing.T, root, mode string) fixtureState {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		data, err := os.ReadFile(filepath.Join(root, mode+".json"))
		var state fixtureState
		if err == nil && json.Unmarshal(data, &state) == nil {
			return state
		}
		if time.Now().After(deadline) {
			t.Fatalf("%s did not publish state: %v", mode, err)
		}
		time.Sleep(time.Millisecond)
	}
}

func fixtureCommand(t *testing.T, root, mode string) *exec.Cmd {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(exe)
	cmd.Env = append(os.Environ(), "RUNNER_TEST_HELPER="+mode, "RUNNER_TEST_DIR="+root)
	return cmd
}

func TestSupervisorJoinsGroupBeforeRemovingScratch(t *testing.T) {
	for _, tc := range []struct {
		name    string
		runtime string
		exit    string
		mode    string
		signal  syscall.Signal
	}{
		{"successful suite", "go", "0", "exit", 0},
		{"failed suite", "bun", "7", "exit", 0},
		{"leader exits before descendant", "go", "", "leader", 0},
		{"interrupt", "go", "", "leader", syscall.SIGINT},
		{"terminate", "bun", "", "leader", syscall.SIGTERM},
		{"hangup", "go", "", "leader", syscall.SIGHUP},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			helper := fixtureCommand(t, root, tc.mode)
			cmd := exec.Command(runnerBinary, tc.runtime, helper.Path)
			cmd.Dir = root
			cmd.Env = append(helper.Env, "RUNNER_TEST_EXIT="+tc.exit)
			if tc.signal != 0 {
				cmd.Env = append(cmd.Env, "RUNNER_TEST_LEADER_WAITS=1")
			}
			var output bytes.Buffer
			cmd.Stdout, cmd.Stderr = &output, &output
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			done := make(chan error, 1)
			go func() { done <- cmd.Wait() }()
			joined := false
			t.Cleanup(func() {
				if joined {
					return
				}
				cmd.Process.Signal(syscall.SIGTERM)
				select {
				case <-done:
				case <-time.After(12 * time.Second):
					for _, mode := range []string{"leader", "descendant", "exit"} {
						data, err := os.ReadFile(filepath.Join(root, mode+".json"))
						var state fixtureState
						if err == nil && json.Unmarshal(data, &state) == nil && state.Group > 0 {
							syscall.Kill(-state.Group, syscall.SIGKILL)
						}
					}
					cmd.Process.Kill()
					<-done
				}
			})
			state := readFixtureState(t, root, tc.mode)
			if tc.mode == "leader" {
				readFixtureState(t, root, "descendant")
			}
			if tc.signal != 0 {
				if err := cmd.Process.Signal(tc.signal); err != nil {
					t.Fatal(err)
				}
			}
			var err error
			select {
			case err = <-done:
				joined = true
			case <-time.After(12 * time.Second):
				t.Fatal("supervisor did not finish")
			}
			want, _ := strconv.Atoi(tc.exit)
			if tc.signal != 0 {
				want = 128 + int(tc.signal)
			}
			status, statusErr := suiteExit(err)
			if statusErr != nil || status != want {
				t.Fatalf("exit = %d, %v; want %d\n%s", status, statusErr, want, &output)
			}
			if err := syscall.Kill(-state.Group, 0); !errors.Is(err, syscall.ESRCH) {
				t.Fatalf("owned group survived supervisor: %v", err)
			}
			if _, err := os.Stat(state.Scratch); !os.IsNotExist(err) {
				t.Fatalf("scratch survived completed shutdown: %v", err)
			}
		})
	}
}

func TestRunSuitePreservesStatusAndHandlesCancellation(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		t.Run(fmt.Sprint("cancel=", cancel), func(t *testing.T) {
			root := t.TempDir()
			t.Chdir(root)
			mode := "exit"
			runtime := "go"
			if cancel {
				mode = "descendant"
				runtime = "bun"
			}
			cmd := fixtureCommand(t, root, mode)
			t.Setenv("RUNNER_TEST_HELPER", mode)
			t.Setenv("RUNNER_TEST_DIR", root)
			t.Setenv("RUNNER_TEST_EXIT", "9")
			signals := make(chan os.Signal, 1)
			done := make(chan int, 1)
			var output bytes.Buffer
			go func() { done <- runSuite([]string{runtime, cmd.Path}, signals, &output) }()
			joined := false
			t.Cleanup(func() {
				if !joined {
					signals <- syscall.SIGTERM
					<-done
				}
			})
			state := readFixtureState(t, root, mode)
			want := 9
			if cancel {
				signals <- syscall.SIGTERM
				want = 143
			}
			got := <-done
			joined = true
			if got != want {
				t.Fatalf("status = %d, want %d: %s", got, want, &output)
			}
			if _, err := os.Stat(state.Scratch); !os.IsNotExist(err) {
				t.Fatalf("scratch remains: %v", err)
			}
		})
	}
}

func TestShutdownEscalatesAndPreservesUnrelatedResources(t *testing.T) {
	if err := enableSubreaper(); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	unrelated := fixtureCommand(t, root, "unrelated")
	if err := unrelated.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { unrelated.Process.Kill(); unrelated.Wait() })
	cmd := fixtureCommand(t, root, "leader")
	cmd.Env = append(cmd.Env, "RUNNER_TEST_IGNORE_TERM=1")
	g, err := startGroup(cmd)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { syscall.Kill(-g.pid, syscall.SIGKILL); g.shutdown(time.Second) })
	readFixtureState(t, root, "descendant")
	g.err = <-g.done
	g.waited = true
	scratch := t.TempDir()
	if err := os.WriteFile(filepath.Join(scratch, "owned"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	var signals []syscall.Signal
	g.kill = func(pid int, sig syscall.Signal) error {
		signals = append(signals, sig)
		return syscall.Kill(pid, sig)
	}
	status, err := finishSuite(g, scratch, 30*time.Millisecond)
	if err != nil || status != 0 {
		t.Fatalf("finishing early leader: %d, %v", status, err)
	}
	sawKill := false
	for _, sig := range signals {
		sawKill = sawKill || sig == syscall.SIGKILL
	}
	if !sawKill {
		t.Fatal("TERM-resistant descendant did not require KILL")
	}
	if err := syscall.Kill(unrelated.Process.Pid, 0); err != nil {
		t.Fatalf("unrelated process was touched: %v", err)
	}
	if _, err := os.Stat(root); err != nil {
		t.Fatalf("unrelated scratch was touched: %v", err)
	}
}

func TestShutdownFailurePreservesScratch(t *testing.T) {
	for _, tc := range []struct {
		name string
		kill func(int, syscall.Signal) error
		reap func(int) error
		wait error
		want string
	}{
		{"signal permission", func(int, syscall.Signal) error { return syscall.EPERM }, nil, nil, "sending"},
		{"probe failure", func(_ int, sig syscall.Signal) error {
			if sig == 0 {
				return syscall.EIO
			}
			return nil
		}, nil, nil, "checking process group"},
		{"post kill group survives", func(int, syscall.Signal) error { return nil }, nil, nil, "did not finish after TERM and KILL"},
		{"reap failure", func(int, syscall.Signal) error { return nil }, func(int) error { return syscall.EIO }, nil, "input/output error"},
		{"wait failure", func(int, syscall.Signal) error { return syscall.ESRCH }, nil, syscall.ECHILD, "waiting for test command"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scratch := t.TempDir()
			marker := filepath.Join(scratch, "diagnostics.txt")
			if err := os.WriteFile(marker, []byte("retain me"), 0600); err != nil {
				t.Fatal(err)
			}
			g := &processGroup{pid: 123, waited: true, err: tc.wait, kill: tc.kill, reap: func(int) error { return nil }}
			if tc.reap != nil {
				g.reap = tc.reap
			}
			status, err := finishSuite(g, scratch, time.Millisecond)
			if status == 0 || err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), scratch) {
				t.Fatalf("shutdown result = %d, %v", status, err)
			}
			content, err := os.ReadFile(marker)
			if err != nil || string(content) != "retain me" {
				t.Fatalf("failure discarded diagnostics: %q, %v", content, err)
			}
		})
	}
}

func TestRunnerRejectsInvalidInvocation(t *testing.T) {
	for _, args := range [][]string{nil, {"go"}, {"other", "unused"}, {"go", "nonexistent-test-command-dotfiles"}} {
		var output bytes.Buffer
		if status := runMain(args, &output); status == 0 || output.Len() == 0 {
			t.Fatalf("invalid invocation %q: status %d, output %q", args, status, &output)
		}
	}
}

func TestRunnerReportsScratchCreationFailure(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.WriteFile(".tmp", []byte("unrelated file"), 0600); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if status := runMain([]string{"bun", "unused"}, &output); status == 0 || !strings.Contains(output.String(), "creating scratch") {
		t.Fatalf("scratch failure = %d, %s", status, &output)
	}
	data, err := os.ReadFile(".tmp")
	if err != nil || string(data) != "unrelated file" {
		t.Fatalf("unrelated file changed: %q, %v", data, err)
	}
}
