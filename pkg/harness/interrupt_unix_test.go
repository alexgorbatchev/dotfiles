//go:build !windows

package harness

import (
	"bufio"
	"context"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// An interrupt typed at the terminal reaches the harness directly. The CLI must survive
// it and keep waiting, or the harness is left running without the process that started
// it. Without the handling in Run, the interrupt sent below would end the test binary.
func TestRunSurvivesAnInterruptWhileTheHarnessRuns(t *testing.T) {
	argv, err := Argv(helperCommand(t, Placeholder), "prompt")
	if err != nil {
		t.Fatal(err)
	}
	stdinReader, stdinWriter := io.Pipe()
	stdoutReader, stdoutWriter := io.Pipe()

	done := make(chan error, 1)
	go func() {
		done <- Run(context.Background(), exec.NewOSRunner(), argv, "", Streams{Stdin: stdinReader, Stdout: stdoutWriter, Stderr: io.Discard})
		_ = stdoutWriter.Close()
	}()

	lines := bufio.NewScanner(stdoutReader)
	for lines.Scan() && lines.Text() != "ready" {
	}
	self, err := os.FindProcess(os.Getpid())
	if err != nil {
		t.Fatal(err)
	}
	if err := self.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}

	if _, err := io.Copy(stdinWriter, strings.NewReader("still here\n")); err != nil {
		t.Fatal(err)
	}
	_ = stdinWriter.Close()
	var rest []string
	for lines.Scan() {
		rest = append(rest, lines.Text())
	}
	if err := <-done; err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Join(rest, "\n") != "echo still here" {
		t.Fatalf("harness output after the interrupt = %q", rest)
	}
}
