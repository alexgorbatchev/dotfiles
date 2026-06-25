package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LogLevel int

const (
	LogLevelVerbose LogLevel = 1
	LogLevelDefault LogLevel = 3
	LogLevelQuiet   LogLevel = 5
)

const (
	LevelTrace slog.Level = -8
	LevelDebug slog.Level = slog.LevelDebug // -4
	LevelInfo  slog.Level = slog.LevelInfo  // 0
	LevelWarn  slog.Level = slog.LevelWarn  // 4
	LevelError slog.Level = slog.LevelError // 8
	LevelFatal slog.Level = 12
)

var (
	toolFilePattern      = regexp.MustCompile(`\.tool\.(ts|js)`)
	frameLocationPattern = regexp.MustCompile(`([\w.-]+\.tool\.(?:ts|js)):(\d+)`)
)

// Config represents the configuration for constructing a new Logger.
type Config struct {
	Name   string
	Level  LogLevel
	Trace  bool
	Writer io.Writer // Defaults to os.Stderr
}

// Logger is a type-safe wrapper around slog.Logger.
type Logger struct {
	mu       sync.RWMutex
	name     string
	level    LogLevel
	trace    bool
	writer   io.Writer
	path     []string
	contexts []string
	slog     *slog.Logger
	onFatal  func()
}

// TabHandler implements a custom, tab-delimited structured slog.Handler.
type TabHandler struct {
	writer io.Writer
	trace  bool
	level  slog.Level
}

func NewTabHandler(w io.Writer, trace bool, level slog.Level) *TabHandler {
	if w == nil {
		w = os.Stderr
	}
	return &TabHandler{
		writer: w,
		trace:  trace,
		level:  level,
	}
}

func (h *TabHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *TabHandler) Handle(_ context.Context, r slog.Record) error {
	var sb strings.Builder

	// Level name
	levelName := r.Level.String()
	switch r.Level {
	case LevelTrace:
		levelName = "TRACE"
	case LevelFatal:
		levelName = "FATAL"
	}
	sb.WriteString(levelName)
	sb.WriteString("\t")

	// If trace mode is enabled, print source file and line
	if h.trace {
		if r.PC != 0 {
			fs := runtime.CallersFrames([]uintptr{r.PC})
			frame, _ := fs.Next()
			if frame.File != "" {
				sb.WriteString(cleanCallerPath(frame.File))
				sb.WriteString(":")
				sb.WriteString(strconv.Itoa(frame.Line))
				sb.WriteString(" - ")
			}
		}
	}

	// Message
	sb.WriteString(r.Message)

	// Additional arguments/attributes
	r.Attrs(func(a slog.Attr) bool {
		sb.WriteString("\t")
		sb.WriteString(a.Value.String())
		return true
	})

	sb.WriteString("\n")
	_, err := h.writer.Write([]byte(sb.String()))
	return err
}

func (h *TabHandler) WithAttrs(_ []slog.Attr) slog.Handler {
	// Not needed for our standard sequential logging, but must satisfy interface.
	return h
}

func (h *TabHandler) WithGroup(_ string) slog.Handler {
	return h
}

// New creates a new safe, structured Logger instance.
func New(cfg Config) *Logger {
	if cfg.Writer == nil {
		cfg.Writer = os.Stderr
	}
	slogLevel := mapLevel(cfg.Level)
	handler := NewTabHandler(cfg.Writer, cfg.Trace, slogLevel)
	slogLogger := slog.New(handler)

	return &Logger{
		name:    cfg.Name,
		level:   cfg.Level,
		trace:   cfg.Trace,
		writer:  cfg.Writer,
		path:    []string{cfg.Name},
		slog:    slogLogger,
		onFatal: func() { os.Exit(1) },
	}
}

func mapLevel(lvl LogLevel) slog.Level {
	switch lvl {
	case LogLevelVerbose:
		return LevelTrace
	case LogLevelQuiet:
		return LevelError
	default:
		return LevelInfo
	}
}

// ParseLogLevel parses case-insensitive string representations of log levels.
func ParseLogLevel(levelName string) (LogLevel, error) {
	switch strings.ToLower(strings.TrimSpace(levelName)) {
	case "verbose":
		return LogLevelVerbose, nil
	case "default":
		return LogLevelDefault, nil
	case "quiet":
		return LogLevelQuiet, nil
	default:
		return LogLevelDefault, fmt.Errorf("invalid log level: %s. Valid levels are: verbose, default, quiet", levelName)
	}
}

// GetSubLogger creates a sublogger.
// Only named subloggers create a new level in the logger hierarchy path.
func (l *Logger) GetSubLogger(name string, context ...string) *Logger {
	l.mu.RLock()
	defer l.mu.RUnlock()

	subPath := append([]string{}, l.path...)
	if name != "" {
		subPath = append(subPath, name)
	}

	subContexts := append([]string{}, l.contexts...)
	subContexts = append(subContexts, context...)

	return &Logger{
		name:     name,
		level:    l.level,
		trace:    l.trace,
		writer:   l.writer,
		path:     subPath,
		contexts: subContexts,
		slog:     l.slog,
		onFatal:  l.onFatal,
	}
}

// SetPrefix overrides/sets the prefix for this logger wrapped inside brackets [context].
func (l *Logger) SetPrefix(context string) *Logger {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.contexts = []string{context}
	return l
}

// WithName returns a new Logger with the given name appended to the logger's name path.
func (l *Logger) WithName(name string) *Logger {
	return l.GetSubLogger(name)
}

func (l *Logger) Trace(msg Message, args ...any) {
	l.log(context.Background(), LevelTrace, msg, args)
}

func (l *Logger) Debug(msg Message, args ...any) {
	l.log(context.Background(), LevelDebug, msg, args)
}

func (l *Logger) Info(msg Message, args ...any) {
	l.log(context.Background(), LevelInfo, msg, args)
}

func (l *Logger) Warn(msg Message, args ...any) {
	l.log(context.Background(), LevelWarn, msg, args)
}

func (l *Logger) Error(msg Message, args ...any) {
	l.log(context.Background(), LevelError, msg, args)
}

func (l *Logger) Fatal(msg Message, args ...any) {
	l.log(context.Background(), LevelFatal, msg, args)
	if l.onFatal != nil {
		l.onFatal()
	}
}

func (l *Logger) log(ctx context.Context, level slog.Level, msg Message, args []any) {
	l.mu.RLock()
	defer l.mu.RUnlock()

	var prefix string
	if len(l.contexts) > 0 {
		var sb strings.Builder
		for _, c := range l.contexts {
			sb.WriteString("[")
			sb.WriteString(c)
			sb.WriteString("]")
		}
		sb.WriteString(" ")
		prefix = sb.String()
	}

	filteredArgs := l.filterArgs(args)

	// Ensure we preserve the PC for correct caller file/line info
	if l.slog.Enabled(ctx, level) {
		var pcs [1]uintptr
		// Skip frames to reach the caller of Trace/Debug/Info/etc.
		runtime.Callers(3, pcs[:])
		r := slog.NewRecord(time.Now(), level, prefix+string(msg), pcs[0])
		for _, arg := range filteredArgs {
			r.AddAttrs(slog.Any("", arg))
		}
		_ = l.slog.Handler().Handle(ctx, r)
	}
}

func (l *Logger) filterArgs(args []any) []any {
	if l.trace {
		return args
	}
	var filtered []any
	for _, arg := range args {
		if err, ok := arg.(error); ok {
			formatted := FormatErrorForUser(err)
			if formatted != "" {
				filtered = append(filtered, formatted)
			}
		} else {
			filtered = append(filtered, arg)
		}
	}
	return filtered
}

// ExtractToolFileLocations parses stack frame paths containing .tool.ts/.tool.js file locations.
func ExtractToolFileLocations(errStr string) []string {
	lines := strings.Split(errStr, "\n")
	var locations []string
	for _, line := range lines {
		if toolFilePattern.MatchString(line) {
			matches := frameLocationPattern.FindStringSubmatch(line)
			if len(matches) >= 3 {
				locations = append(locations, matches[1]+":"+matches[2])
			}
		}
	}
	return locations
}

// FormatErrorForUser formats errors for user-facing output in non-trace mode.
func FormatErrorForUser(err error) string {
	if err == nil {
		return ""
	}
	locations := ExtractToolFileLocations(err.Error())
	if len(locations) == 0 {
		return ""
	}
	return "(" + strings.Join(locations, ", ") + ")"
}

func cleanCallerPath(file string) string {
	if idx := strings.Index(file, "pkg/"); idx != -1 {
		return file[idx:]
	}
	if idx := strings.Index(file, "cmd/"); idx != -1 {
		return file[idx:]
	}
	return filepath.Base(file)
}
