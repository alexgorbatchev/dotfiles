package toolbatch

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestFailuresRetainCausesAndLogOnce(t *testing.T) {
	var output bytes.Buffer
	log := logger.New(logger.Config{Writer: &output})
	var failures Failures
	failures.Record(log, "healthy", nil)
	if failures.Err() != nil || output.Len() != 0 {
		t.Fatal("a successful operation must leave no failure or diagnostic")
	}
	first, second := errors.New("missing payload"), errors.New("permission denied")
	failures.Record(log, "first", first)
	failures.Record(log, "second", second)
	var outer Failures
	outer.Record(log, "cleanup", failures.Err())
	for _, cause := range []error{ErrFailed, first, second} {
		if !errors.Is(outer.Err(), cause) {
			t.Errorf("nested batch lost %v: %v", cause, outer.Err())
		}
	}
	for _, message := range []string{"[first] missing payload", "[second] permission denied"} {
		if strings.Count(output.String(), message) != 1 {
			t.Errorf("diagnostic %q was not logged exactly once: %s", message, output.String())
		}
	}
}
