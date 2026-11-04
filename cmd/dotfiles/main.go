package main

import (
	"context"
	"errors"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/harness"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

var exitFunc = os.Exit

func runMain() error {
	return Execute()
}

func main() {
	if err := runMain(); err != nil {
		// A command that hands the terminal to an AI harness (tool make) exits as the
		// harness did, so a script driving it can tell its failures apart.
		var harnessExit *harness.ExitError
		if errors.As(err, &harnessExit) {
			GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(err.Error()))
			exitFunc(harnessExit.Code)
			return
		}
		if errors.Is(err, toolbatch.ErrFailed) && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(toolbatch.ErrFailed.Error()))
		} else if !errors.Is(err, ErrSilent) {
			GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(err.Error()))
		}
		exitFunc(1)
	}
}
