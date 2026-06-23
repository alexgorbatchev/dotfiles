package unwrap

import (
	"testing"
)

type TestContext struct {
	Version string
	Arch    string
	OS      string
}

func TestEvaluate(t *testing.T) {
	ctx := TestContext{
		Version: "1.2.3",
		Arch:    "amd64",
		OS:      "linux",
	}

	t.Run("Valid Evaluation", func(t *testing.T) {
		pattern := "https://github.com/org/repo/releases/download/v{{.Version}}/tool-{{.OS}}-{{.Arch}}.tar.gz"
		expected := "https://github.com/org/repo/releases/download/v1.2.3/tool-linux-amd64.tar.gz"

		res, err := Evaluate(pattern, ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res != expected {
			t.Errorf("expected %q, got %q", expected, res)
		}
	})

	t.Run("Invalid Template Pattern Syntax", func(t *testing.T) {
		pattern := "https://github.com/org/repo/releases/download/v{{.Version" // Missing closing braces

		_, err := Evaluate(pattern, ctx)
		if err == nil {
			t.Fatal("expected template parsing error, got nil")
		}
	})

	t.Run("Template Field Execution Error", func(t *testing.T) {
		pattern := "https://github.com/org/repo/releases/download/v{{.NonExistentField}}"

		_, err := Evaluate(pattern, ctx)
		if err == nil {
			t.Fatal("expected execution error, got nil")
		}
	})
}
