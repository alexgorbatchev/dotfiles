// Package toolbatch records independent tool failures without stopping a batch.
package toolbatch

import (
	"errors"
	"fmt"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// ErrFailed marks a batch whose individual failures have already been logged.
var ErrFailed = errors.New("Command completed with tool failures; see errors above")

// Failures retains the causes of a batch's failures. Its zero value is ready to use.
type Failures struct {
	errs []error
}

// Record logs a tool's failure immediately and retains it for the final result.
// Nested batch failures have already been logged, so their causes are retained once.
func (f *Failures) Record(log *logger.Logger, tool string, err error) {
	if err == nil {
		return
	}
	if !errors.Is(err, ErrFailed) {
		log.WithTag(tool).Error(logger.Message(err.Error()))
	}
	f.errs = append(f.errs, fmt.Errorf("tool %q: %w", tool, err))
}

// Err returns nil on success, or an error wrapping ErrFailed and every cause.
func (f *Failures) Err() error {
	if len(f.errs) == 0 {
		return nil
	}
	return errors.Join(ErrFailed, errors.Join(f.errs...))
}
