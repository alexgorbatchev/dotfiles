package main

import (
	"strings"
	"testing"
)

func TestVersionCommand(t *testing.T) {
	out, err := executeCommand("self", "version")
	if err != nil {
		t.Fatalf("self version command failed: %v", err)
	}
	if strings.TrimSpace(out) != Version {
		t.Errorf("expected version output to be %q, got %q", Version, out)
	}

	outFlag, err := executeCommand("--version")
	if err != nil {
		t.Fatalf("--version flag failed: %v", err)
	}
	if strings.TrimSpace(outFlag) != Version {
		t.Errorf("expected --version output to be %q, got %q", Version, outFlag)
	}
}
