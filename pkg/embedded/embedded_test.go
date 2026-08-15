package embedded

import (
	"io/fs"
	"testing"
)

func TestTypesFS(t *testing.T) {
	entries, err := fs.ReadDir(TypesFS, "dist")
	if err != nil {
		t.Fatalf("failed to read embedded dist directory: %v", err)
	}

	if len(entries) == 0 {
		t.Errorf("expected embedded dist directory to contain files")
	}
}
