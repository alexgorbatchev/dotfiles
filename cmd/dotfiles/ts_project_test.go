package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// tsTools are the tool files of a test project: each key is a tool's name, which is its
// file's name, and each value the expression its defineTool callback returns, written
// against the callback's install and ctx parameters, such as `install("manual").bin("bat")`.
type tsTools map[string]string

// projectPathsTS renders the three required "paths" members rooted under root, so
// fixtures never point at directories outside the test's temp dir.
func projectPathsTS(root string) string {
	return fmt.Sprintf(`"homeDir": %q, "targetDir": %q, "generatedDir": %q`,
		filepath.Join(root, "home"), filepath.Join(root, "target"), filepath.Join(root, "generated"))
}

// writeTSProject writes the TypeScript project a user would: dir/dotfiles.config.ts,
// whose default export is an object with the members project, and one
// dir/tools/<name>.tool.ts per tool (the default tool configs directory). A tools
// directory left by an earlier call is replaced, so rewriting a project removes the
// tools it no longer has, and a project without tools has no tools directory. It
// returns the configuration's path.
func writeTSProject(t *testing.T, dir, project string, tools tsTools) string {
	t.Helper()
	toolsDir := filepath.Join(dir, "tools")
	if err := os.RemoveAll(toolsDir); err != nil {
		t.Fatalf("clearing %s: %v", toolsDir, err)
	}
	if len(tools) > 0 {
		if err := os.MkdirAll(toolsDir, 0755); err != nil {
			t.Fatalf("creating %s: %v", toolsDir, err)
		}
	}
	for name, expr := range tools {
		source := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n\n" +
			"export default defineTool((install, ctx) => " + expr + ");\n"
		if err := os.WriteFile(filepath.Join(toolsDir, name+".tool.ts"), []byte(source), 0644); err != nil {
			t.Fatalf("writing tool %s: %v", name, err)
		}
	}

	configPath := filepath.Join(dir, "dotfiles.config.ts")
	config := "import { defineConfig } from \"@alexgorbatchev/dotfiles\";\n\n" +
		"export default defineConfig(() => ({ " + project + " }));\n"
	if err := os.WriteFile(configPath, []byte(config), 0644); err != nil {
		t.Fatalf("writing %s: %v", configPath, err)
	}
	return configPath
}
