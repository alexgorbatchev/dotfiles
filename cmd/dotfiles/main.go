package main

import (
	"fmt"
	"os"
)

func runMain() error {
	return Execute()
}

func main() {
	if err := runMain(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
