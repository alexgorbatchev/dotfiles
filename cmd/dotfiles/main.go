package main

import (
	"errors"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

var exitFunc = os.Exit

func runMain() error {
	return Execute()
}

func main() {
	if err := runMain(); err != nil {
		if !errors.Is(err, ErrSilent) {
			GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(err.Error()))
		}
		exitFunc(1)
	}
}
