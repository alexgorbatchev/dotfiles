package embedded

import (
	"io/fs"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/typecheck"
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

// The authoring declarations ship under exactly one name, plus globals.d.ts, which is
// genuinely different content. A second copy under another name is what package.json's
// "types" does not point at and nothing imports, so it goes stale unnoticed; and
// tool-types.d.ts in particular is the name the CLI gives a project's bin-name
// registry, a differently shaped file, so nothing embedded may claim it.
func TestTypesFSDeclarationsAreEmittedOnce(t *testing.T) {
	entries, err := fs.ReadDir(TypesFS, "dist")
	if err != nil {
		t.Fatalf("failed to read embedded dist directory: %v", err)
	}

	var declarations []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".d.ts") {
			declarations = append(declarations, entry.Name())
		}
	}
	slices.Sort(declarations)

	want := []string{"globals.d.ts", "index.d.ts"}
	if !slices.Equal(declarations, want) {
		t.Errorf("embedded declaration files = %v, want %v", declarations, want)
	}
	if slices.Contains(declarations, typecheck.RegistryFileName) {
		t.Errorf("embedded declaration %q collides with the bin-name registry the CLI generates per project", typecheck.RegistryFileName)
	}
}
