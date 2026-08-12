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

func TestTypegenEmitIndexDts(t *testing.T) {
	tmpDir := t.TempDir()
	distDir := filepath.Join(tmpDir, ".dist")
	if err := os.MkdirAll(distDir, 0755); err != nil {
		t.Fatalf("failed to create .dist dir: %v", err)
	}

	distIndexPath := filepath.Join(distDir, "index.d.ts")
	if err := generateTypes(distIndexPath); err != nil {
		t.Fatalf("generateTypes to .dist/index.d.ts failed: %v", err)
	}

	content, err := os.ReadFile(distIndexPath)
	if err != nil {
		t.Fatalf("failed to read .dist/index.d.ts: %v", err)
	}

	if len(content) == 0 {
		t.Errorf("expected .dist/index.d.ts to be non-empty")
	}

	strContent := string(content)
	if !strings.Contains(strContent, "interface ToolConfig") {
		t.Errorf("expected .dist/index.d.ts to contain interface ToolConfig")
	}
}
