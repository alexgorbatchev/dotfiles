package main

import (
	"context"
	"errors"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

var exitFunc = os.Exit

func runMain() error {
	return Execute()
}

func main() {
	if err := runMain(); err != nil {
		if errors.Is(err, toolbatch.ErrFailed) && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(toolbatch.ErrFailed.Error()))
		} else if !errors.Is(err, ErrSilent) {
			GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(err.Error()))
		}
		exitFunc(1)
	}
}
