//go:build linux || darwin

// test-runner owns a suite's scratch until every member of its process group exits.
package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

const shutdownGrace = 5 * time.Second

type processGroup struct {
	pid    int
	done   <-chan error
	waited bool
	err    error
	kill   func(int, syscall.Signal) error
	reap   func(int) error
	// denied holds the last EPERM a signal or probe returned. On macOS a group whose
	// last member is exiting answers EPERM until it is gone, so EPERM means "not
	// finished yet"; it is reported only if the group never finishes.
	denied error
}

func startGroup(cmd *exec.Cmd) (*processGroup, error) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	return &processGroup{pid: cmd.Process.Pid, done: done, kill: syscall.Kill, reap: reapGroup}, nil
}

func reapGroup(pgid int) error {
	for {
		pid, err := syscall.Wait4(-pgid, nil, syscall.WNOHANG, nil)
		if errors.Is(err, syscall.EINTR) {
			continue
		}
		if errors.Is(err, syscall.ECHILD) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("reaping process group %d: %w", pgid, err)
		}
		if pid == 0 {
			return nil
		}
	}
}

func (g *processGroup) completed() (bool, error) {
	if !g.waited {
		select {
		case g.err = <-g.done:
			g.waited = true
		default:
			return false, nil
		}
	}
	// Cmd.Wait must reap the direct child first; otherwise Wait4 could steal its
	// exit status. Linux orphan descendants are adopted by our subreaper.
	if err := g.reap(g.pid); err != nil {
		return false, err
	}
	err := g.kill(-g.pid, 0)
	if errors.Is(err, syscall.ESRCH) {
		return true, nil
	}
	if errors.Is(err, syscall.EPERM) {
		g.denied = err
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("checking process group %d: %w", g.pid, err)
	}
	g.denied = nil
	return false, nil
}

func (g *processGroup) shutdown(grace time.Duration) error {
	for _, sig := range []syscall.Signal{syscall.SIGTERM, syscall.SIGKILL} {
		if err := g.kill(-g.pid, sig); errors.Is(err, syscall.EPERM) {
			g.denied = err
		} else if err != nil && !errors.Is(err, syscall.ESRCH) {
			return fmt.Errorf("sending %s to process group %d: %w", sig, g.pid, err)
		}
		deadline := time.Now().Add(grace)
		for {
			complete, err := g.completed()
			if err != nil {
				return err
			}
			if complete {
				return nil
			}
			if !time.Now().Before(deadline) {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
	if g.denied != nil {
		return fmt.Errorf("process group %d did not finish after TERM and KILL: %w", g.pid, g.denied)
	}
	return fmt.Errorf("process group %d did not finish after TERM and KILL", g.pid)
}

func suiteExit(err error) (int, error) {
	if err == nil {
		return 0, nil
	}
	var exited *exec.ExitError
	if errors.As(err, &exited) {
		if status, ok := exited.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			return 128 + int(status.Signal()), nil
		}
		return exited.ExitCode(), nil
	}
	return 1, fmt.Errorf("waiting for test command: %w", err)
}

func createScratch(runtime string) (string, error) {
	if runtime == "go" {
		return os.MkdirTemp("", "dotfiles-tests.")
	}
	if runtime != "bun" {
		return "", fmt.Errorf("unknown test runtime %q (expected go or bun)", runtime)
	}
	root, err := filepath.Abs(".tmp")
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(root, 0755); err != nil {
		return "", err
	}
	return os.MkdirTemp(root, "test-run.")
}

func finishSuite(g *processGroup, scratch string, grace time.Duration) (int, error) {
	if err := g.shutdown(grace); err != nil {
		return 1, fmt.Errorf("shutdown failed: %w; scratch preserved at %s", err, scratch)
	}
	status, err := suiteExit(g.err)
	if err != nil {
		return 1, fmt.Errorf("%w; scratch preserved at %s", err, scratch)
	}
	if err := os.RemoveAll(scratch); err != nil {
		return 1, fmt.Errorf("removing scratch %s: %w", scratch, err)
	}
	return status, nil
}

func runSuite(args []string, signals <-chan os.Signal, stderr io.Writer) int {
	if len(args) < 2 {
		fmt.Fprintln(stderr, "usage: test-runner <go|bun> <command> [args...]")
		return 2
	}
	if err := enableSubreaper(); err != nil {
		fmt.Fprintf(stderr, "test-runner: %v\n", err)
		return 1
	}
	scratch, err := createScratch(args[0])
	if err != nil {
		fmt.Fprintf(stderr, "test-runner: creating scratch: %v\n", err)
		return 1
	}
	cmd := exec.Command(args[1], args[2:]...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = append(os.Environ(), "TMPDIR="+scratch, "GOTMPDIR="+scratch, "NODE_COMPILE_CACHE="+filepath.Join(scratch, "node-compile-cache"))
	g, err := startGroup(cmd)
	if err != nil {
		fmt.Fprintf(stderr, "test-runner: starting command: %v\n", err)
		if cleanupErr := os.RemoveAll(scratch); cleanupErr != nil {
			fmt.Fprintf(stderr, "test-runner: removing scratch %s: %v\n", scratch, cleanupErr)
		}
		return 1
	}
	interrupted := 0
	select {
	case g.err = <-g.done:
		g.waited = true
	case sig := <-signals:
		interrupted = 128 + int(sig.(syscall.Signal))
	}
	status, err := finishSuite(g, scratch, shutdownGrace)
	if err != nil {
		fmt.Fprintf(stderr, "test-runner: %v\n", err)
		return 1
	}
	if interrupted != 0 {
		return interrupted
	}
	return status
}

func runMain(args []string, stderr io.Writer) int {
	signals := make(chan os.Signal, 8)
	signal.Notify(signals, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM)
	status := runSuite(args, signals, stderr)
	signal.Stop(signals)
	return status
}

func main() { os.Exit(runMain(os.Args[1:], os.Stderr)) }
