package e2e

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCLIBuildInputCache(t *testing.T) {
	root := t.TempDir()
	inputs := map[string]string{
		"go.mod":                    "module cache-fixture\n\ngo 1.26.2\n",
		"go.sum":                    "",
		"cmd/dotfiles/main.go":      "package main\nfunc main() { println(\"first\") }\n",
		"pkg/example/asset.txt":     "embedded content",
		"internal/example/value.go": "package example\nconst Value = 1\n",
		"cache_inputs_test.go":      "package e2e\nimport \"testing\"\nfunc TestInputs(t *testing.T) { if err := recordBuildInputs(\".\"); err != nil { t.Fatal(err) } }\n",
	}
	for path, content := range inputs {
		path = filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	// Compile the actual tracker in an isolated module so cmd/go tests its inputs.
	source, err := os.ReadFile("cache_inputs.go")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "cache_inputs.go"), source, 0644); err != nil {
		t.Fatal(err)
	}
	run := func(t *testing.T, wantCached bool) {
		t.Helper()
		ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "go", "test", ".")
		cmd.Dir = root
		output, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("fixture tests: %v\n%s", err, output)
		}
		if cached := strings.Contains(string(output), "(cached)"); cached != wantCached {
			t.Fatalf("cached = %v, want %v\n%s", cached, wantCached, output)
		}
	}
	run(t, false)
	run(t, true)
	for _, path := range []string{"cmd/dotfiles/main.go", "pkg/example/asset.txt", "internal/example/value.go", "go.mod", "go.sum"} {
		t.Run(path, func(t *testing.T) {
			file, err := os.OpenFile(filepath.Join(root, path), os.O_APPEND|os.O_WRONLY, 0644)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := file.WriteString("\n"); err != nil {
				t.Fatal(err)
			}
			if err := file.Close(); err != nil {
				t.Fatal(err)
			}
			run(t, false)
			run(t, true)
		})
	}
}
