package logger

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestParseLogLevel(t *testing.T) {
	tests := []struct {
		input   string
		want    LogLevel
		wantErr bool
	}{
		{"verbose", LogLevelVerbose, false},
		{"DEFAULT", LogLevelDefault, false},
		{" quiet ", LogLevelQuiet, false},
		{"invalid", LogLevelDefault, true},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := ParseLogLevel(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseLogLevel(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr && got != tt.want {
				t.Fatalf("ParseLogLevel(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestLoggerOutputAndLevels(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{
		Name:   "test",
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	l.Debug("should not print")
	l.Info("hello info")
	l.Warn("hello warn")
	l.Error("hello error")

	output := buf.String()
	if strings.Contains(output, "should not print") {
		t.Errorf("Debug log printed but level is DEFAULT: %q", output)
	}
	if !strings.Contains(output, "INFO\thello info\n") {
		t.Errorf("Expected INFO block, got: %q", output)
	}
	if !strings.Contains(output, "WARN\thello warn\n") {
		t.Errorf("Expected WARN block, got: %q", output)
	}
	if !strings.Contains(output, "ERROR\thello error\n") {
		t.Errorf("Expected ERROR block, got: %q", output)
	}
}

func TestLoggerTraceModeCaller(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{
		Name:   "test",
		Level:  LogLevelVerbose,
		Trace:  true,
		Writer: &buf,
	})

	l.Info("hello trace")

	output := buf.String()
	// Should contain "pkg/logger/logger_test.go" and " - hello trace"
	if !strings.Contains(output, "pkg/logger/logger_test.go:") {
		t.Errorf("Expected caller location info in trace mode, got: %q", output)
	}
	if !strings.Contains(output, " - hello trace\n") {
		t.Errorf("Expected separator ' - hello trace' in trace mode, got: %q", output)
	}
}

func TestLoggerContextAndSubLoggers(t *testing.T) {
	var buf bytes.Buffer
	parent := New(Config{
		Name:   "parent",
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	sub := parent.GetSubLogger("child", "tool-abc")
	sub.Info("running child")

	output := buf.String()
	if !strings.Contains(output, "INFO\t[tool-abc] running child\n") {
		t.Errorf("Expected context prefix, got: %q", output)
	}

	// Overwrite/SetPrefix
	sub.SetPrefix("new-prefix")
	buf.Reset()
	sub.Info("running with new prefix")
	output = buf.String()
	if !strings.Contains(output, "INFO\t[new-prefix] running with new prefix\n") {
		t.Errorf("Expected set prefix, got: %q", output)
	}
}

func TestErrorFilteringNonTraceMode(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{
		Name:   "test",
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	// Error with .tool.ts stack frame
	errWithTool := errors.New("something went wrong\n  at hook (flux.tool.ts:14)\n  at other (/path/to/some/file.ts:2)")
	l.Error("execution failed", errWithTool)

	output := buf.String()
	if !strings.Contains(output, "ERROR\texecution failed\t(flux.tool.ts:14)\n") {
		t.Errorf("Expected tool error formatting, got: %q", output)
	}

	// Error without .tool.ts stack frame (purely internal) - should be dropped
	errInternal := errors.New("internal database error\n  at query (/path/to/db.go:20)")
	buf.Reset()
	l.Error("database query failed", errInternal)
	output = buf.String()
	if strings.Contains(output, "internal database error") || strings.Contains(output, "db.go") {
		t.Errorf("Expected internal error detail to be dropped, got: %q", output)
	}
	if !strings.Contains(output, "ERROR\tdatabase query failed\n") {
		t.Errorf("Expected basic error message to be printed, got: %q", output)
	}
}

func TestErrorFilteringTraceMode(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{
		Name:   "test",
		Level:  LogLevelVerbose,
		Trace:  true,
		Writer: &buf,
	})

	errWithTool := errors.New("something went wrong\n  at hook (flux.tool.ts:14)")
	l.Error("execution failed", errWithTool)

	output := buf.String()
	// In trace mode, error object should pass through and be printed fully
	if !strings.Contains(output, "something went wrong") {
		t.Errorf("Expected full error string in trace mode, got: %q", output)
	}
}

func TestLoggerFatal(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{
		Name:   "test",
		Level:  LogLevelDefault,
		Writer: &buf,
	})

	fatalCalled := false
	l.onFatal = func() {
		fatalCalled = true
	}

	l.Fatal("system failure")

	if !fatalCalled {
		t.Errorf("Expected fatal exit callback to be invoked")
	}
	output := buf.String()
	if !strings.Contains(output, "FATAL\tsystem failure\n") {
		t.Errorf("Expected FATAL log line, got: %q", output)
	}
}

func TestExtractToolFileLocations(t *testing.T) {
	tests := []struct {
		name   string
		errStr string
		want   []string
	}{
		{
			"single match",
			"Error: failed\n  at hook (/path/to/flux.tool.ts:14:13)",
			[]string{"flux.tool.ts:14"},
		},
		{
			"multiple matches",
			"Error: failed\n  at hook (/path/to/flux.tool.ts:14:13)\n  at second (other.tool.js:20)",
			[]string{"flux.tool.ts:14", "other.tool.js:20"},
		},
		{
			"no matches",
			"Error: failed\n  at internal (/path/to/db.go:40)",
			nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExtractToolFileLocations(tt.errStr)
			if len(got) == 0 && len(tt.want) == 0 {
				return
			}
			// check equivalence
			if fmt.Sprintf("%v", got) != fmt.Sprintf("%v", tt.want) {
				t.Errorf("ExtractToolFileLocations() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCoverageFillers(t *testing.T) {
	// Test Message.String()
	msg := Message("test-message")
	if msg.String() != "test-message" {
		t.Errorf("Message.String() = %q, want %q", msg.String(), "test-message")
	}

	var buf bytes.Buffer
	l := New(Config{
		Name:   "test",
		Level:  LogLevelVerbose,
		Writer: &buf,
	})

	// Test Trace log
	l.Trace("hello trace")
	output := buf.String()
	if !strings.Contains(output, "TRACE\thello trace\n") {
		t.Errorf("Expected TRACE log, got: %q", output)
	}

	// Test handler WithAttrs/WithGroup boilerplate
	h := l.slog.Handler()
	if h.WithAttrs(nil) != h {
		t.Errorf("WithAttrs did not return the handler")
	}
	if h.WithGroup("") != h {
		t.Errorf("WithGroup did not return the handler")
	}

	// Test cleanCallerPath directly
	paths := []struct {
		input string
		want  string
	}{
		{"/home/user/workspace/pkg/fs/mem_fs.go", "pkg/fs/mem_fs.go"},
		{"/home/user/workspace/cmd/dotfiles/main.go", "cmd/dotfiles/main.go"},
		{"/home/user/main.go", "main.go"},
	}
	for _, p := range paths {
		if got := cleanCallerPath(p.input); got != p.want {
			t.Errorf("cleanCallerPath(%q) = %q, want %q", p.input, got, p.want)
		}
	}

	// 1. Test NewTabHandler and New with nil writer
	handlerNilWriter := NewTabHandler(nil, false, LevelInfo)
	if handlerNilWriter.writer == nil {
		t.Errorf("Expected NewTabHandler with nil to fall back to a writer")
	}

	loggerNilWriter := New(Config{Writer: nil})
	if loggerNilWriter.writer == nil {
		t.Errorf("Expected New with nil writer to fall back to a writer")
	}

	// 2. Test quiet log level mapping
	loggerQuiet := New(Config{Level: LogLevelQuiet, Writer: &buf})
	if loggerQuiet.level != LogLevelQuiet {
		t.Errorf("Expected quiet level to be configured")
	}

	// 3. Test non-error arguments in non-trace mode
	loggerDefault := New(Config{Level: LogLevelDefault, Writer: &buf})
	buf.Reset()
	loggerDefault.Info("message with string arg", "hello")
	output = buf.String()
	if !strings.Contains(output, "INFO\tmessage with string arg\thello\n") {
		t.Errorf("Expected non-error arguments to pass through in non-trace mode, got %q", output)
	}

	// 4. Test FormatErrorForUser with nil error
	if got := FormatErrorForUser(nil); got != "" {
		t.Errorf("FormatErrorForUser(nil) = %q, want empty string", got)
	}
}
