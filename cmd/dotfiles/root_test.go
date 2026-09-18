package main

import (
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestGetLoggerNilWriterAndFlags(t *testing.T) {
	log := GetLogger("test", nil)
	if log == nil {
		t.Errorf("expected non-nil logger")
	}

	logLevel = "invalid-level"
	quiet = true
	verbose = false
	trace = true

	log1 := GetLogger("test1", nil)
	if log1 == nil || log1.Level() != logger.LogLevelQuiet {
		t.Errorf("expected LogLevelQuiet when quiet flag is true")
	}

	quiet = false
	verbose = true
	log2 := GetLogger("test2", nil)
	if log2 == nil || log2.Level() != logger.LogLevelVerbose {
		t.Errorf("expected LogLevelVerbose when verbose flag is true")
	}
}

// --platform takes the spellings people use in the authoring API (Platform.MacOS,
// { os: "macos" }) as well as the GOOS name, and every accepted spelling lands on the
// GOOS name vm.Target evaluates .platform() blocks against. Anything else is rejected
// while the command line is parsed, naming the accepted values, instead of being
// accepted and then silently matching nothing.
func TestPlatformFlag(t *testing.T) {
	tests := []struct {
		name       string
		value      string
		wantTarget string
		wantErr    string
	}{
		{name: "macos", value: "macos", wantTarget: "darwin"},
		{name: "darwin", value: "darwin", wantTarget: "darwin"},
		{name: "case and spacing are forgiven", value: " MacOS ", wantTarget: "darwin"},
		{name: "linux", value: "linux", wantTarget: "linux"},
		{name: "windows", value: "windows", wantTarget: "windows"},
		{name: "unknown value", value: "macintosh", wantErr: "accepted values are macos (or darwin), linux and windows"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand("--platform", tt.value, "--config", "test-project/dotfiles.config.ts", "env")
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("--platform %q was accepted, output:\n%s", tt.value, out.Combined)
				}
				if !strings.Contains(err.Error(), tt.wantErr) || !strings.Contains(err.Error(), tt.value) {
					t.Errorf("error %q should name the rejected value and the accepted ones", err)
				}
				if platform != "" {
					t.Errorf("a rejected value left platform = %q", platform)
				}
				return
			}
			if err != nil {
				t.Fatalf("--platform %q: %v\n%s", tt.value, err, out.Combined)
			}
			if platform != tt.wantTarget {
				t.Errorf("--platform %q reached the loader as %q, want %q", tt.value, platform, tt.wantTarget)
			}
		})
	}
}
