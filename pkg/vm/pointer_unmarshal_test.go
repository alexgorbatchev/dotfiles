package vm

import (
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

func TestPointerUnmarshal_Precise(t *testing.T) {
	t.Run("String pointer populated", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", version: "1.4.2" });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.Version == nil {
			t.Fatal("expected non-nil Version pointer")
		}
		if *toolCfg.Version != "1.4.2" {
			t.Errorf("expected Version %q, got %q", "1.4.2", *toolCfg.Version)
		}
	})

	t.Run("String pointer omitted", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test" });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.Version != nil {
			t.Errorf("expected nil Version pointer, got: %q", *toolCfg.Version)
		}
	})

	t.Run("String pointer explicit null", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", version: null });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.Version != nil {
			t.Errorf("expected nil Version pointer on explicit null, got: %q", *toolCfg.Version)
		}
	})

	t.Run("String pointer explicit undefined", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", version: undefined });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.Version != nil {
			t.Errorf("expected nil Version pointer on explicit undefined, got: %q", *toolCfg.Version)
		}
	})

	t.Run("Bool pointer populated true", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", updateCheck: { enabled: true } });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.UpdateCheck == nil {
			t.Fatal("expected non-nil updateCheck")
		}
		if toolCfg.UpdateCheck.Enabled == nil {
			t.Fatal("expected non-nil UpdateCheck.Enabled pointer")
		}
		if *toolCfg.UpdateCheck.Enabled != true {
			t.Errorf("expected UpdateCheck.Enabled true, got %v", *toolCfg.UpdateCheck.Enabled)
		}
	})

	t.Run("Bool pointer populated false", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", updateCheck: { enabled: false } });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.UpdateCheck == nil {
			t.Fatal("expected non-nil updateCheck")
		}
		if toolCfg.UpdateCheck.Enabled == nil {
			t.Fatal("expected non-nil UpdateCheck.Enabled pointer")
		}
		if *toolCfg.UpdateCheck.Enabled != false {
			t.Errorf("expected UpdateCheck.Enabled false, got %v", *toolCfg.UpdateCheck.Enabled)
		}
	})

	t.Run("Bool pointer and string pointer constraint populated", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", updateCheck: { enabled: true, constraint: ">=1.0.0" } });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.UpdateCheck == nil {
			t.Fatal("expected non-nil updateCheck")
		}
		if toolCfg.UpdateCheck.Enabled == nil || *toolCfg.UpdateCheck.Enabled != true {
			t.Errorf("expected Enabled pointer to be true")
		}
		if toolCfg.UpdateCheck.Constraint == nil || *toolCfg.UpdateCheck.Constraint != ">=1.0.0" {
			t.Errorf("expected Constraint pointer to be '>=1.0.0'")
		}
	})

	t.Run("UpdateCheck nested structure empty", func(t *testing.T) {
		var toolCfg config.ToolConfig
		err := EvaluateToolDefinition(`defineTool({ name: "test", updateCheck: {} });`, &toolCfg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if toolCfg.UpdateCheck == nil {
			t.Fatal("expected non-nil updateCheck")
		}
		if toolCfg.UpdateCheck.Enabled != nil {
			t.Errorf("expected nil Enabled pointer, got %v", *toolCfg.UpdateCheck.Enabled)
		}
		if toolCfg.UpdateCheck.Constraint != nil {
			t.Errorf("expected nil Constraint pointer, got %s", *toolCfg.UpdateCheck.Constraint)
		}
	})
}
