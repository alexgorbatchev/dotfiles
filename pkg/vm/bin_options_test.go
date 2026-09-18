package vm

import (
	"io"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// .bin() accepts an options object; only the members given cross to Go, so a binary
// declared without mentioning `shim` is indistinguishable from one declared by name.
func TestLoaderRecordsBinaryOptions(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.ts")
	configContent := `export default { paths: { generatedDir: "./.generated", toolConfigsDir: "./tools" } };`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatal(err)
	}

	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatal(err)
	}
	toolContent := `import { defineTool } from "@dotfiles/cli";
export default defineTool((install) =>
  install("manual")
    .bin("plain")
    .bin("located", "*/bin/located")
    .bin("hidden", { shim: false })
    .bin("both", { pattern: "*/lib/both", shim: true }),
);`
	if err := os.WriteFile(filepath.Join(toolsDir, "bins.tool.ts"), []byte(toolContent), 0644); err != nil {
		t.Fatal(err)
	}

	_, toolMap, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err != nil {
		t.Fatalf("LoadTypeScriptConfig failed: %v", err)
	}
	tool, ok := toolMap["bins"]
	if !ok {
		t.Fatalf("tool bins not loaded")
	}

	want := []interface{}{
		"plain",
		map[string]interface{}{"name": "located", "pattern": "*/bin/located"},
		map[string]interface{}{"name": "hidden", "shim": false},
		map[string]interface{}{"name": "both", "pattern": "*/lib/both", "shim": true},
	}
	if !reflect.DeepEqual(tool.Binaries, want) {
		t.Errorf("binaries = %#v, want %#v", tool.Binaries, want)
	}
}
