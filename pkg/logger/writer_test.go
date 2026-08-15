package logger

import (
	"bytes"
	"strings"
	"testing"
)

func TestLineWriter(t *testing.T) {
	var buf bytes.Buffer
	log := New(Config{
		Name:   "test",
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

func TestLineWriterQuietMode(t *testing.T) {
	var buf bytes.Buffer
	log := New(Config{
		Name:   "test",
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
}
