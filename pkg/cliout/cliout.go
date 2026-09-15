package cliout

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// TreeNode represents a node in a hierarchical directory or object tree.
type TreeNode struct {
	Name     string      `json:"name"`
	IsDir    bool        `json:"isDir,omitempty"`
	Children []*TreeNode `json:"children,omitempty"`
}

// IsAgentMode returns true when AGENT is set to "1", "true", or "yes" (case-insensitive).
func IsAgentMode() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("AGENT")))
	return v == "1" || v == "true" || v == "yes"
}

// RenderJSON writes data as JSON to the specified writer.
// When AGENT mode is active, it formats as minified JSON (single line, zero extra whitespace).
// In human mode, it pretty-prints with 2-space indentation.
func RenderJSON(w io.Writer, data any) error {
	var b []byte
	var err error
	if IsAgentMode() {
		b, err = json.Marshal(data)
	} else {
		b, err = json.MarshalIndent(data, "", "  ")
	}
	if err != nil {
		return fmt.Errorf("encoding JSON: %w", err)
	}
	_, err = fmt.Fprintln(w, string(b))
	return err
}

// FormatTree formats a slice of TreeNodes.
// In human mode, it uses box-drawing characters (├─, └─, │).
// In agent mode, it uses token-conservative bulleted indentation (* item).
func FormatTree(nodes []*TreeNode) string {
	if IsAgentMode() {
		return formatAgentTree(nodes, "")
	}
	return formatHumanTree(nodes, "")
}

func formatHumanTree(nodes []*TreeNode, prefix string) string {
	var lines []string
	for i, node := range nodes {
		isLast := i == len(nodes)-1
		connector := "├─ "
		if isLast {
			connector = "└─ "
		}
		lines = append(lines, prefix+connector+node.Name)
		if node.IsDir && len(node.Children) > 0 {
			childPrefix := prefix + "│  "
			if isLast {
				childPrefix = prefix + "   "
			}
			lines = append(lines, formatHumanTree(node.Children, childPrefix))
		}
	}
	return strings.Join(lines, "\n")
}

func formatAgentTree(nodes []*TreeNode, indent string) string {
	var lines []string
	for _, node := range nodes {
		lines = append(lines, indent+"* "+node.Name)
		if node.IsDir && len(node.Children) > 0 {
			lines = append(lines, formatAgentTree(node.Children, indent+"  "))
		}
	}
	return strings.Join(lines, "\n")
}

// RenderDivider writes a horizontal divider across terminal width in human mode.
// In agent mode, it produces no output.
func RenderDivider(w io.Writer, char rune) {
	if IsAgentMode() {
		return
	}
	width := 80
	if colStr := os.Getenv("COLUMNS"); colStr != "" {
		if cols, err := strconv.Atoi(colStr); err == nil && cols > 0 {
			width = cols
		}
	}
	fmt.Fprintln(w, strings.Repeat(string(char), width))
}
