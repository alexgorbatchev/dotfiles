package main

import (
	"os"
	"testing"
)

func TestMainHelp(t *testing.T) {
	oldArgs := os.Args
	defer func() { os.Args = oldArgs }()

	os.Args = []string{"dotfiles", "--help"}
	rootCmd.SetArgs([]string{"--help"})
	err := runMain()
	if err != nil {
		t.Fatalf("runMain failed: %v", err)
	}
	main()
}
