package cliout

import (
	"bytes"
	"strings"
	"testing"
)

func TestIsAgentMode(t *testing.T) {
	tests := []struct {
		val  string
		want bool
	}{
		{"1", true},
		{"true", true},
		{"TRUE", true},
		{"yes", true},
		{"YES", true},
		{"0", false},
		{"false", false},
		{"no", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run("AGENT="+tt.val, func(t *testing.T) {
			t.Setenv("AGENT", tt.val)
			if got := IsAgentMode(); got != tt.want {
				t.Errorf("IsAgentMode() = %v, want %v for AGENT=%q", got, tt.want, tt.val)
			}
		})
	}
}

func TestRenderJSON(t *testing.T) {
	data := map[string]any{
		"tools": []string{"bat", "fd"},
		"count": 2,
	}

	t.Run("human mode pretty json", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		var buf bytes.Buffer
		err := RenderJSON(&buf, data)
		if err != nil {
			t.Fatalf("RenderJSON error: %v", err)
		}
		out := buf.String()
		if !strings.Contains(out, "  \"count\": 2") {
			t.Errorf("expected indented JSON in human mode, got:\n%s", out)
		}
		if !strings.Contains(out, "\n") {
			t.Errorf("expected multiline JSON in human mode, got single line:\n%s", out)
		}
	})

	t.Run("agent mode minified json", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		var buf bytes.Buffer
		err := RenderJSON(&buf, data)
		if err != nil {
			t.Fatalf("RenderJSON error: %v", err)
		}
		out := strings.TrimSpace(buf.String())
		if strings.Contains(out, "  ") {
			t.Errorf("expected minified JSON with no indent spaces in agent mode, got:\n%s", out)
		}
		if strings.Contains(out, "\n") {
			t.Errorf("expected single-line JSON in agent mode, got:\n%s", out)
		}
	})
}

func TestFormatTree(t *testing.T) {
	tree := []*TreeNode{
		{
			Name:  "bin",
			IsDir: true,
			Children: []*TreeNode{
				{Name: "bat", IsDir: false},
				{Name: "sub", IsDir: true, Children: []*TreeNode{
					{Name: "nested", IsDir: false},
				}},
			},
		},
		{
			Name:  "README.md",
			IsDir: false,
		},
	}

	t.Run("human mode tree glyphs", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		res := FormatTree(tree)
		if !strings.Contains(res, "├─ bin") || !strings.Contains(res, "└─ README.md") {
			t.Errorf("expected box-drawing tree glyphs in human mode, got:\n%s", res)
		}
		if !strings.Contains(res, "nested") {
			t.Errorf("expected nested item in human mode, got:\n%s", res)
		}
	})

	t.Run("agent mode bullet list", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		res := FormatTree(tree)
		if strings.Contains(res, "├─") || strings.Contains(res, "└─") {
			t.Errorf("expected no box-drawing glyphs in agent mode, got:\n%s", res)
		}
		if !strings.Contains(res, "* bin") || !strings.Contains(res, "  * bat") || !strings.Contains(res, "    * nested") {
			t.Errorf("expected indented bullets in agent mode, got:\n%s", res)
		}
	})
}

func TestRenderDivider(t *testing.T) {
	t.Run("human mode renders divider", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		var buf bytes.Buffer
		RenderDivider(&buf, '-')
		out := buf.String()
		if len(strings.TrimSpace(out)) == 0 || !strings.Contains(out, "---") {
			t.Errorf("expected divider line in human mode, got %q", out)
		}
	})

	t.Run("human mode renders divider with COLUMNS", func(t *testing.T) {
		t.Setenv("AGENT", "0")
		t.Setenv("COLUMNS", "40")
		var buf bytes.Buffer
		RenderDivider(&buf, '=')
		out := strings.TrimSpace(buf.String())
		if len(out) != 40 || out != strings.Repeat("=", 40) {
			t.Errorf("expected 40-char '=' divider, got len %d: %q", len(out), out)
		}
	})

	t.Run("agent mode suppresses divider", func(t *testing.T) {
		t.Setenv("AGENT", "1")
		var buf bytes.Buffer
		RenderDivider(&buf, '-')
		if buf.Len() != 0 {
			t.Errorf("expected empty buffer in agent mode, got %q", buf.String())
		}
	})
}
