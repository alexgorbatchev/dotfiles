package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestBuildDirTreeAndFormatTree(t *testing.T) {
	memFS := fs.NewMemFS()

	dirPath := "/workspace/tool"
	_ = memFS.MkdirAll(filepath.Join(dirPath, "b_dir", "sub"), 0755)
	_ = memFS.WriteFile(filepath.Join(dirPath, "a_file.txt"), []byte("a"), 0644)
	_ = memFS.WriteFile(filepath.Join(dirPath, "b_dir", "sub", "c_file.txt"), []byte("c"), 0644)

	nodes, err := buildDirTree(memFS, dirPath)
	if err != nil {
		t.Fatalf("buildDirTree failed: %v", err)
	}
	if len(nodes) != 2 {
		t.Fatalf("expected 2 top-level nodes, got %d", len(nodes))
	}

	treeStr := formatTree(nodes, "")
	if !strings.Contains(treeStr, "b_dir") || !strings.Contains(treeStr, "a_file.txt") {
		t.Errorf("formatTree output missing expected nodes, got:\n%s", treeStr)
	}

	// buildDirTree on non-existent path
	_, err = buildDirTree(memFS, "/nonexistent/path")
	if err == nil {
		t.Error("expected error building dir tree for non-existent path")
	}
}

func TestFilesCmd(t *testing.T) {
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	cfgContent := `export default { paths: { generatedDir: "./.generated" } };`
	_ = os.WriteFile(cfgPath, []byte(cfgContent), 0644)

	oldCfg := cfgFile
	cfgFile = cfgPath
	defer func() { cfgFile = oldCfg }()

	rootCmd.SetArgs([]string{"files"})
	_ = rootCmd.Execute()
}
