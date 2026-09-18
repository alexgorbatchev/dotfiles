package vm

import (
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// Every .bin() form records the same shape: an object carrying the name, plus only the
// members the call actually gave. A binary declared without mentioning `shim` is
// therefore distinguishable from one declared with `shim: false`, and one declared
// without a pattern carries none, leaving the default glob to Go
// (installer.defaultBinaryPattern).
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
    .bin("matched", /bin\/matched$/)
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
		map[string]interface{}{"name": "plain"},
		map[string]interface{}{"name": "located", "pattern": "*/bin/located"},
		map[string]interface{}{"name": "matched", "pattern": `/bin\/matched$/`},
		map[string]interface{}{"name": "hidden", "shim": false},
		map[string]interface{}{"name": "both", "pattern": "*/lib/both", "shim": true},
	}
	if !reflect.DeepEqual(tool.Binaries, want) {
		t.Errorf("binaries = %#v, want %#v", tool.Binaries, want)
	}
}

// The bulk forms .bin() used to accept are type errors, but nothing type-checks during
// a plain load, where they would have produced a tool with binaries missing and no
// diagnostic. The load fails instead, naming the tool file and the mistake.
func TestLoaderRejectsBulkBinaryForms(t *testing.T) {
	tests := []struct {
		name string
		call string
		want string
	}{
		{
			name: "an array of names",
			call: `.bin(["one", "two"])`,
			want: ".bin() takes a binary name: expected a string, got an array",
		},
		{
			name: "a list of names",
			call: `.bin("one", "two", "three")`,
			want: ".bin() takes a binary name and an optional pattern or options object, but got 3 arguments",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
				"export default defineTool((install) => install(\"manual\")" + tt.call + ");"
			_, err := loadToolSource(t, tool)
			if err == nil {
				t.Fatal("expected loading to fail")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("expected an error mentioning %q, got: %v", tt.want, err)
			}
			if !strings.Contains(err.Error(), "probe.tool.ts") {
				t.Errorf("expected the error to name the tool file, got: %v", err)
			}
		})
	}
}
