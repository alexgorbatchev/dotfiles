package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseSkillDescription(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name: "single line description",
			content: `---
name: my-skill
description: Manage dotfiles configuration
---
# My Skill Header`,
			expected: "Manage dotfiles configuration",
		},
		{
			name: "folded block scalar description (>-)",
			content: `---
name: dotfiles
description: >-
  .tool.ts configuration files, defineTool, install(), dotfiles.config.ts,
  defineConfig, installation methods, shell integration.
---
# Dotfiles Tool Installer`,
			expected: ".tool.ts configuration files, defineTool, install(), dotfiles.config.ts, defineConfig, installation methods, shell integration.",
		},
		{
			name: "literal block scalar description (|)",
			content: `---
name: pi-subagents
description: |
  Delegate work to builtin or custom subagents with single-agent,
  parallel, scripted, compatibility-chain workflows.
---
# Pi Subagents`,
			expected: "Delegate work to builtin or custom subagents with single-agent, parallel, scripted, compatibility-chain workflows.",
		},
		{
			name: "quoted single line description",
			content: `---
name: test
description: "A quoted description string"
---`,
			expected: "A quoted description string",
		},
		{
			name: "fallback to markdown H1 header",
			content: `# Skill Title

No frontmatter description here.`,
			expected: "Skill Title",
		},
		{
			name:     "no description available",
			content:  `Just some random markdown without title or frontmatter`,
			expected: "No description",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseSkillDescription(tt.content)
			if got != tt.expected {
				t.Errorf("parseSkillDescription() = %q; want %q", got, tt.expected)
			}
		})
	}
}

func TestSkillCommandWithCustomDir(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a mock skill directory structure
	skill1Dir := filepath.Join(tmpDir, "skill-one")
	if err := os.MkdirAll(skill1Dir, 0755); err != nil {
		t.Fatalf("failed creating dir: %v", err)
	}

	skill1Content := `---
name: skill-one
description: >-
  First mock skill for testing multiline YAML
  parsing in dotfiles CLI.
---
# Skill One`
	if err := os.WriteFile(filepath.Join(skill1Dir, "SKILL.md"), []byte(skill1Content), 0644); err != nil {
		t.Fatalf("failed writing SKILL.md: %v", err)
	}

	output, err := executeCommand("skill", "--dir", tmpDir)
	if err != nil {
		t.Fatalf("skill command failed: %v, output: %s", err, output)
	}

	if !strings.Contains(output, "Installed AI skills") {
		t.Errorf("expected output to contain 'Installed AI skills', got:\n%s", output)
	}
	if !strings.Contains(output, "First mock skill for testing multiline YAML parsing in dotfiles CLI.") {
		t.Errorf("expected output to contain parsed description, got:\n%s", output)
	}
}
