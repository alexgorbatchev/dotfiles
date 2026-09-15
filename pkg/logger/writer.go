package logger

import (
	"bytes"
	"fmt"
	"strings"
	"sync"
)

// LineWriter wraps a Logger and buffer to process output line-by-line.
// It is thread-safe for concurrent writes (e.g. stdout and stderr from exec.Cmd).
type LineWriter struct {
	mu      sync.Mutex
	logger  *Logger
	prefix  string
	buf     bytes.Buffer
	written bool
}

// NewLineWriter creates a new LineWriter wrapping the provided Logger and line prefix.
func NewLineWriter(log *Logger, prefix string) *LineWriter {
	return &LineWriter{
		logger: log,
		prefix: prefix,
	}
}

// HasWritten reports whether any output lines have been written through this LineWriter.
func (l *LineWriter) HasWritten() bool {
	if l == nil {
		return false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.written
}

// Reset clears the buffer and resets the written state for a new command execution.
func (l *LineWriter) Reset() {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.buf.Reset()
	l.written = false
}

func (l *LineWriter) Write(p []byte) (int, error) {
	if l == nil || l.logger == nil {
		return len(p), nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	l.buf.Write(p)
	for {
		line, err := l.buf.ReadString('\n')
		if err != nil {
			l.buf.Write([]byte(line))
			break
		}
		trimmed := strings.TrimSuffix(line, "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		l.written = true
		l.logger.Info(Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
	}
	return len(p), nil
}

func (l *LineWriter) Flush() {
	if l == nil || l.logger == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.buf.Len() > 0 {
		trimmed := strings.TrimSuffix(l.buf.String(), "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		if trimmed != "" {
			l.written = true
			l.logger.Info(Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
		}
		l.buf.Reset()
	}
}

// PrintError prints the error formatted with the line prefix if no lines were written yet.
func (l *LineWriter) PrintError(err error) {
	if l == nil || l.logger == nil || err == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.buf.Len() > 0 {
		trimmed := strings.TrimSuffix(l.buf.String(), "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		if trimmed != "" {
			l.written = true
			l.logger.Info(Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
		}
		l.buf.Reset()
	}

	if !l.written {
		l.written = true
		l.logger.Info(Message(fmt.Sprintf("%s %v", l.prefix, err)))
	}
}
