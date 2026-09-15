package main

import (
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

var exitFunc = os.Exit

func runMain() error {
	return Execute()
}

func main() {
	if err := runMain(); err != nil {
		GetLogger("", rootCmd.ErrOrStderr()).Error(logger.Message(err.Error()))
		exitFunc(1)
	}
}
