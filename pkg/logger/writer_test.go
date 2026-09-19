package logger

import (
	"bytes"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestLineWriter(t *testing.T) {
	var buf bytes.Buffer
	log := New(Config{
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	lw := NewLineWriter(log, "|")
	_, err := lw.Write([]byte("line 1\nline 2\npartial"))
	if err != nil {
		t.Fatalf("unexpected Write error: %v", err)
	}

	lw.Flush()

	out := buf.String()
	if !strings.Contains(out, "| line 1") {
		t.Errorf("expected '| line 1' in output, got: %s", out)
	}
	if !strings.Contains(out, "| line 2") {
		t.Errorf("expected '| line 2' in output, got: %s", out)
	}
	if !strings.Contains(out, "| partial") {
		t.Errorf("expected '| partial' in output, got: %s", out)
	}
}

func TestLineWriterPrintError(t *testing.T) {
	t.Run("prints error when no output written", func(t *testing.T) {
		var buf bytes.Buffer
		log := New(Config{
			Level:  LogLevelDefault,
			Writer: &buf,
		})

		lw := NewLineWriter(log, "|")
		if lw.HasWritten() {
			t.Error("expected HasWritten = false initially")
		}
		lw.PrintError(bytes.ErrTooLarge)

		out := buf.String()
		if !strings.Contains(out, "| bytes.Buffer: too large") {
			t.Errorf("expected '| bytes.Buffer: too large' in output, got:\n%s", out)
		}
		if !lw.HasWritten() {
			t.Error("expected HasWritten = true after PrintError")
		}
	})

	t.Run("does not duplicate error if output already written", func(t *testing.T) {
		var buf bytes.Buffer
		log := New(Config{
			Level:  LogLevelDefault,
			Writer: &buf,
		})

		lw := NewLineWriter(log, "|")
		_, _ = lw.Write([]byte("some command output\n"))
		lw.PrintError(bytes.ErrTooLarge)

		out := buf.String()
		if !strings.Contains(out, "| some command output") {
			t.Errorf("expected output in stream, got:\n%s", out)
		}
		if strings.Contains(out, "bytes.Buffer: too large") {
			t.Errorf("expected error NOT to be printed when output already streamed, got:\n%s", out)
		}
	})
}

func TestLineWriterQuietMode(t *testing.T) {
	var buf bytes.Buffer
	log := New(Config{
		Level:  LogLevelQuiet,
		Writer: &buf,
	})

	lw := NewLineWriter(log, "|")
	_, err := lw.Write([]byte("line 1\nline 2\n"))
	if err != nil {
		t.Fatalf("unexpected Write error: %v", err)
	}
	lw.Flush()

	if buf.Len() > 0 {
		t.Errorf("expected no output in quiet mode, got: %s", buf.String())
	}
}

func TestLineWriterNilLogger(t *testing.T) {
	lw := NewLineWriter(nil, "|")
	n, err := lw.Write([]byte("test\n"))
	if err != nil {
		t.Fatalf("unexpected error with nil logger: %v", err)
	}
	if n != 5 {
		t.Errorf("expected 5 bytes written, got %d", n)
	}
	lw.Flush() // should not panic
	lw.Reset()
	if lw.HasWritten() {
		t.Error("expected HasWritten false for nil LineWriter")
	}
}

func TestLineWriterReset(t *testing.T) {
	var buf bytes.Buffer
	log := New(Config{
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	lw := NewLineWriter(log, "|")
	_, _ = lw.Write([]byte("step 1 output\n"))
	if !lw.HasWritten() {
		t.Error("expected HasWritten = true after write")
	}

	lw.Reset()
	if lw.HasWritten() {
		t.Error("expected HasWritten = false after Reset")
	}

	lw.PrintError(bytes.ErrTooLarge)
	out := buf.String()
	if !strings.Contains(out, "| bytes.Buffer: too large") {
		t.Errorf("expected error to be printed after Reset, got:\n%s", out)
	}
}

func TestLineWriterConcurrentWrites(t *testing.T) {
	var buf bytes.Buffer
	log := New(Config{
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	lw := NewLineWriter(log, "|")

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			_, _ = lw.Write([]byte(fmt.Sprintf("concurrent line from %d\n", id)))
		}(i)
	}
	wg.Wait()
	lw.Flush()

	if !lw.HasWritten() {
		t.Error("expected HasWritten = true")
	}
}
