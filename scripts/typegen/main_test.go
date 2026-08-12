package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateTypes(t *testing.T) {
	tmpDir := t.TempDir()
	outputPath := filepath.Join(tmpDir, "types.gen.ts")

	err := generateTypes(outputPath)
	if err != nil {
		t.Fatalf("generateTypes failed: %v", err)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("failed to read generated file: %v", err)
	}

	strContent := string(content)
	expectedTypes := []string{
		"interface ToolConfig",
		"interface ProjectConfig",
		"interface PlatformConfigEntry",
		"interface BinaryConfig",
		"interface SymlinkConfig",
	}

	for _, expected := range expectedTypes {
		if !strings.Contains(strContent, expected) {
			t.Errorf("generated types missing expected declaration %q", expected)
		}
	}
}
