package main

import (
	"bytes"
	"errors"
	"io"
	iofs "io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
	"github.com/spf13/cobra"
)

func TestSkillCommand_CopiesEmbeddedSkill(t *testing.T) {
	t.Run("copies only the bundled skill and replaces stale contents", func(t *testing.T) {
		dst := t.TempDir()
		skillFile := filepath.Join(dst, "dotfiles", "SKILL.md")
		if err := os.MkdirAll(filepath.Dir(skillFile), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(skillFile, []byte("stale skill"), 0644); err != nil {
			t.Fatal(err)
		}
		out, err := runCommand("skill", "copy", dst)
		if err != nil {
			t.Fatalf("skill copy %s: %v\n%s", dst, err, out.Combined)
		}
		entries, err := os.ReadDir(dst)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 1 || entries[0].Name() != "dotfiles" {
			t.Fatalf("exported directories = %v, want only the bundled skill", entries)
		}
		err = iofs.WalkDir(embedded.SkillFS, "skill", func(path string, entry iofs.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return err
			}
			want, err := embedded.SkillFS.ReadFile(path)
			if err != nil {
				return err
			}
			got, err := os.ReadFile(filepath.Join(dst, "dotfiles", strings.TrimPrefix(path, "skill/")))
			if err != nil {
				return err
			}
			if !bytes.Equal(got, want) {
				t.Errorf("exported %s differs from embedded content", path)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.Stderr, "Copied skill folder to "+filepath.Join(dst, "dotfiles")) {
			t.Fatalf("stderr lacks the copy confirmation:\n%s", out.Stderr)
		}
		if out.Stdout != "" {
			t.Fatalf("copy diagnostics leaked to stdout: %q", out.Stdout)
		}
	})

	t.Run("cannot create the destination", func(t *testing.T) {
		blocker := filepath.Join(t.TempDir(), "file")
		if err := os.WriteFile(blocker, []byte("x"), 0644); err != nil {
			t.Fatalf("writing blocker: %v", err)
		}
		_, err := runCommand("skill", "copy", filepath.Join(blocker, "sub"))
		if err == nil || !strings.Contains(err.Error(), "creating destination skill directory") {
			t.Fatalf("error = %v, want destination creation failure", err)
		}
	})
}

func TestSkillCommandRejectsListingOptions(t *testing.T) {
	for _, args := range [][]string{
		{"skill", "--dir", "."},
		{"skill", "--json"},
		{"skill", "list"},
		{"skill", "extra"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			out, err := runCommand(args...)
			if err == nil {
				t.Fatalf("expected rejected invocation, got output %q", out.Stdout)
			}
		})
	}
}

func TestSkillCommandReturnsOutputFailure(t *testing.T) {
	reader, writer := io.Pipe()
	want := errors.New("skill output closed")
	if err := reader.CloseWithError(want); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := writer.Close(); err != nil {
			t.Error(err)
		}
	})
	cmd := &cobra.Command{}
	cmd.SetOut(writer)
	if err := printSkill(cmd); !errors.Is(err, want) {
		t.Fatalf("printing skill error = %v, want %v", err, want)
	}
}
