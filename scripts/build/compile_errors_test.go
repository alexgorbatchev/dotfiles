package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// compileAllBinaries builds four targets concurrently. When more than one fails,
// every failure has to reach the caller: reading a single value off the error
// channel reports one broken platform and leaves the others to be discovered one
// release at a time.
func TestCompileAllBinariesReportsEveryFailedTarget(t *testing.T) {
	// A directory with a version but no Go module, so `go build ./cmd/dotfiles`
	// fails for every target.
	rootDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(rootDir, "package.json"), []byte(`{"version":"9.9.9"}`), 0644); err != nil {
		t.Fatalf("writing package.json: %v", err)
	}

	err := compileAllBinaries(rootDir)
	if err == nil {
		t.Fatal("expected compileAllBinaries to fail when no target can be built")
	}

	for _, target := range []string{"darwin/amd64", "darwin/arm64", "linux/amd64", "linux/arm64"} {
		if !strings.Contains(err.Error(), target) {
			t.Errorf("error does not mention failed target %s:\n%v", target, err)
		}
	}
}
