package embedded

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	pathpkg "path"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
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

// TestSkillFSMirrorsCanonicalSkill asserts that SkillFS embeds every file from the
// canonical skill directory (pkg/embedded/skill) with identical content.
func TestSkillFSMirrorsCanonicalSkill(t *testing.T) {
	repoRoot, err := testutil.RepoRoot()
	if err != nil {
		t.Fatalf("locating repository root: %v", err)
	}
	canonicalSkillDir := filepath.Join(repoRoot, "pkg", "embedded", "skill")

	if _, err := os.Stat(canonicalSkillDir); err != nil {
		t.Fatalf("canonical skill directory not found at %s: %v", canonicalSkillDir, err)
	}

	// Verify all canonical files exist in SkillFS with identical content.
	err = filepath.WalkDir(canonicalSkillDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") {
			return nil
		}

		relPath, err := filepath.Rel(canonicalSkillDir, path)
		if err != nil {
			return err
		}

		embeddedPath := pathpkg.Join("skill", filepath.ToSlash(relPath))
		canonicalContent, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading canonical skill file %s: %w", path, err)
		}

		embeddedContent, err := fs.ReadFile(SkillFS, embeddedPath)
		if err != nil {
			t.Errorf("SkillFS is missing %q (present in canonical %s): %v", embeddedPath, path, err)
			return nil
		}

		if !bytes.Equal(canonicalContent, embeddedContent) {
			t.Errorf("SkillFS file %q does not match canonical %s", embeddedPath, path)
		}

		return nil
	})
	if err != nil {
		t.Fatalf("failed to walk canonical skill directory: %v", err)
	}

	// Verify SkillFS does not contain any extra/orphaned files.
	err = fs.WalkDir(SkillFS, "skill", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") {
				return fs.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") {
			return nil
		}

		relPath := strings.TrimPrefix(path, "skill/")
		canonicalPath := filepath.Join(canonicalSkillDir, filepath.FromSlash(relPath))
		if _, err := os.Stat(canonicalPath); os.IsNotExist(err) {
			t.Errorf("SkillFS contains orphaned file %q not found in canonical skill: %s", path, canonicalPath)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("failed to walk SkillFS: %v", err)
	}
}

func TestAgentSkillSymlinkReadsEmbeddedSkill(t *testing.T) {
	repoRoot, err := testutil.RepoRoot()
	if err != nil {
		t.Fatal(err)
	}
	agentSkillDir := filepath.Join(repoRoot, ".agents", "skills", "dotfiles")
	info, err := os.Lstat(agentSkillDir)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("agent skill must be a symlink to the canonical embedded skill")
	}
	resolved, err := filepath.EvalSymlinks(agentSkillDir)
	if err != nil {
		t.Fatal(err)
	}
	canonicalSkillDir := filepath.Join(repoRoot, "pkg", "embedded", "skill")
	if resolved != canonicalSkillDir {
		t.Fatalf("agent skill resolves to %q, want %q", resolved, canonicalSkillDir)
	}
	err = fs.WalkDir(SkillFS, "skill", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		got, err := os.ReadFile(filepath.Join(agentSkillDir, filepath.FromSlash(strings.TrimPrefix(path, "skill/"))))
		if err != nil {
			return err
		}
		want, err := fs.ReadFile(SkillFS, path)
		if err != nil {
			return err
		}
		if !bytes.Equal(got, want) {
			t.Errorf("agent skill %s differs from embedded content", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
