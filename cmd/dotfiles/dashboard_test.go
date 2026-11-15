package main

import (
	"strings"
	"testing"
)

func TestDashboardCommandFlags(t *testing.T) {
	out, err := executeCommand("dashboard", "--help")
	if err != nil {
		t.Fatalf("dashboard --help failed: %v", err)
	}
	if !strings.Contains(out, "--host") || !strings.Contains(out, "-H") {
		t.Errorf("expected dashboard --help to show --host and -H flags, got:\n%s", out)
	}
}
