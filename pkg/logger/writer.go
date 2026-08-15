package logger

import (
	"bytes"
	"fmt"
	"strings"
)

// LineWriter wraps a Logger and buffer to process output line-by-line.
type LineWriter struct {
	logger *Logger
	prefix string
	buf    bytes.Buffer
}

// NewLineWriter creates a new LineWriter wrapping the provided Logger and line prefix.
func NewLineWriter(log *Logger, prefix string) *LineWriter {
	return &LineWriter{
		logger: log,
		prefix: prefix,
	}
}

func (l *LineWriter) Write(p []byte) (n int, err error) {
	if l.logger == nil {
		return len(p), nil
	}
	n = len(p)
	l.buf.Write(p)
	for {
		line, err := l.buf.ReadString('\n')
		if err != nil {
			l.buf.Write([]byte(line))
			break
		}
		trimmed := strings.TrimSuffix(line, "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		l.logger.Info(Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
	}
	return n, nil
}

func (l *LineWriter) Flush() {
	if l.logger == nil {
		return
	}
	if l.buf.Len() > 0 {
		trimmed := strings.TrimSuffix(l.buf.String(), "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		if trimmed != "" {
			l.logger.Info(Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
		}
		l.buf.Reset()
	}
}
