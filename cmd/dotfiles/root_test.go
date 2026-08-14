package main

import (
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
