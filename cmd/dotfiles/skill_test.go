package main

import (
	"testing"
)

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
