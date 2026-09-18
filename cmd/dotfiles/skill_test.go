package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSkillCommand_CopiesEmbeddedSkill(t *testing.T) {
	t.Run("copies into the target directory", func(t *testing.T) {
		dst := t.TempDir()
		out, err := runCommand("skill", dst)
		if err != nil {
			t.Fatalf("skill %s: %v\n%s", dst, err, out.Combined)
		}
		skillFile := filepath.Join(dst, "dotfiles", "SKILL.md")
		if _, err := os.Stat(skillFile); err != nil {
			t.Fatalf("expected %s to be written: %v", skillFile, err)
		}
		if !strings.Contains(out.Stderr, "Copied skill folder to "+filepath.Join(dst, "dotfiles")) {
			t.Fatalf("stderr lacks the copy confirmation:\n%s", out.Stderr)
		}
	})

	t.Run("cannot create the destination", func(t *testing.T) {
		blocker := filepath.Join(t.TempDir(), "file")
		if err := os.WriteFile(blocker, []byte("x"), 0644); err != nil {
			t.Fatalf("writing blocker: %v", err)
		}
		_, err := runCommand("skill", filepath.Join(blocker, "sub"))
		if err == nil || !strings.Contains(err.Error(), "creating destination skill directory") {
			t.Fatalf("error = %v, want destination creation failure", err)
		}
	})
}

func TestSkillCommand_Listing(t *testing.T) {
	// Isolate the implicit search locations (cwd and home) so only --dir matters.
	enterTempDir(t)
	t.Setenv("HOME", t.TempDir())

	skillsDir := t.TempDir()
	alpha := filepath.Join(skillsDir, "alpha")
	if err := os.MkdirAll(alpha, 0755); err != nil {
		t.Fatalf("creating alpha: %v", err)
	}
	if err := os.WriteFile(filepath.Join(alpha, "SKILL.md"), []byte("---\ndescription: Alpha skill\n---\n# Alpha\n"), 0644); err != nil {
		t.Fatalf("writing alpha skill: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(skillsDir, "no-skill-file"), 0755); err != nil {
		t.Fatalf("creating no-skill-file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillsDir, "notes.txt"), []byte("not a skill"), 0644); err != nil {
		t.Fatalf("writing notes: %v", err)
	}

	t.Run("human mode", func(t *testing.T) {
		out, err := runCommand("skill", "--dir", skillsDir)
		if err != nil {
			t.Fatalf("skill --dir: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "- alpha: Alpha skill ("+alpha+")\n" {
			t.Fatalf("stdout = %q, want the single alpha line", out.Stdout)
		}
		if !strings.Contains(out.Stderr, "Installed AI skills (1):") {
			t.Fatalf("stderr lacks the count:\n%s", out.Stderr)
		}
	})

	t.Run("agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := runCommand("skill", "--dir", skillsDir)
		if err != nil {
			t.Fatalf("skill --dir: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "name:alpha desc:Alpha skill path:"+alpha+"\n" {
			t.Fatalf("stdout = %q, want the compact alpha line", out.Stdout)
		}
	})

	t.Run("json", func(t *testing.T) {
		out, err := runCommand("skill", "--dir", skillsDir, "--json")
		if err != nil {
			t.Fatalf("skill --dir --json: %v\n%s", err, out.Combined)
		}
		var skills []struct {
			Name        string
			Path        string
			Description string
		}
		if err := json.Unmarshal([]byte(out.Stdout), &skills); err != nil {
			t.Fatalf("stdout is not a JSON array: %v\n%s", err, out.Stdout)
		}
		if len(skills) != 1 || skills[0].Name != "alpha" || skills[0].Description != "Alpha skill" || skills[0].Path != alpha {
			t.Fatalf("skills = %+v, want only alpha", skills)
		}
	})

	t.Run("nothing found in agent mode", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		out, err := runCommand("skill", "--dir", t.TempDir())
		if err != nil {
			t.Fatalf("skill --dir: %v\n%s", err, out.Combined)
		}
		if out.Stdout != "no skills found\n" {
			t.Fatalf("stdout = %q, want the compact empty report", out.Stdout)
		}
	})
}

func TestParseSkillDescriptionEdgeCases(t *testing.T) {
	if got := parseSkillDescription(""); got != "No description" {
		t.Errorf("expected 'No description' for empty content, got %q", got)
	}

	if got := parseSkillDescription("---"); got != "No description" {
		t.Errorf("expected 'No description' for unclosed frontmatter, got %q", got)
	}

	noFrontmatter := "# My Skill Title\nAnd body text"
	if got := parseSkillDescription(noFrontmatter); got != "My Skill Title" {
		t.Errorf("expected 'My Skill Title', got %q", got)
	}
}

func TestParseSkillDescriptionYAML(t *testing.T) {
	// Single line YAML
	s1 := "---\ndescription: single line skill\n---\n# Title"
	if got := parseSkillDescription(s1); got != "single line skill" {
		t.Errorf("expected 'single line skill', got %q", got)
	}

	// Multiline YAML
	s2 := "---\ndescription: |\n  Line one\n  Line two\n---\n# Title"
	if got := parseSkillDescription(s2); got != "Line one Line two" {
		t.Errorf("expected 'Line one Line two', got %q", got)
	}
}
