package orchestrator

import (
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

func TestTopologicalSort(t *testing.T) {
	tools := []*config.ToolConfig{
		{Name: "A", Dependencies: []string{"B"}},
		{Name: "B", Dependencies: []string{"C"}},
		{Name: "C"},
	}

	sorted, err := TopologicalSort(tools)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(sorted) != 3 {
		t.Fatalf("expected 3 tools, got %d", len(sorted))
	}

	if sorted[0].Name != "C" || sorted[1].Name != "B" || sorted[2].Name != "A" {
		t.Errorf("expected C, B, A; got %s, %s, %s", sorted[0].Name, sorted[1].Name, sorted[2].Name)
	}

	// Cycle detection
	cyclicTools := []*config.ToolConfig{
		{Name: "X", Dependencies: []string{"Y"}},
		{Name: "Y", Dependencies: []string{"X"}},
	}
	_, err = TopologicalSort(cyclicTools)
	if err == nil {
		t.Fatal("expected cycle detection error, got nil")
	}

	// Duplicate names
	duplicateTools := []*config.ToolConfig{
		{Name: "A"},
		{Name: "A"},
	}
	_, err = TopologicalSort(duplicateTools)
	if err == nil {
		t.Fatal("expected duplicate name error, got nil")
	}

	// Unregistered dependency
	unregisteredDepTools := []*config.ToolConfig{
		{Name: "A", Dependencies: []string{"B"}},
	}
	_, err = TopologicalSort(unregisteredDepTools)
	if err == nil {
		t.Fatal("expected error on unregistered dependency, got nil")
	}
}

func TestTopologicalSort_BinaryDependencies(t *testing.T) {
	tests := []struct {
		name        string
		tools       []*config.ToolConfig
		wantOrder   []string
		wantErrSub  string
		expectError bool
	}{
		{
			name: "successful binary dependency resolution",
			tools: []*config.ToolConfig{
				{
					Name:         "rust-tool",
					Binaries:     []interface{}{"cargo", "rustc"},
					Dependencies: []string{},
				},
				{
					Name:         "my-package",
					Binaries:     []interface{}{"my-bin"},
					Dependencies: []string{"cargo"},
				},
			},
			wantOrder:   []string{"rust-tool", "my-package"},
			expectError: false,
		},
		{
			name: "successful fallback to direct tool dependency",
			tools: []*config.ToolConfig{
				{
					Name:         "rust-tool",
					Binaries:     []interface{}{"cargo", "rustc"},
					Dependencies: []string{},
				},
				{
					Name:         "my-package",
					Binaries:     []interface{}{"my-bin"},
					Dependencies: []string{"rust-tool"},
				},
			},
			wantOrder:   []string{"rust-tool", "my-package"},
			expectError: false,
		},
		{
			name: "ambiguous dependency error (multiple binary providers)",
			tools: []*config.ToolConfig{
				{
					Name:     "tool-one",
					Binaries: []interface{}{"duplicate-bin"},
				},
				{
					Name:     "tool-two",
					Binaries: []interface{}{"duplicate-bin"},
				},
				{
					Name:         "tool-three",
					Dependencies: []string{"duplicate-bin"},
				},
			},
			expectError: true,
			wantErrSub:  "ambiguous dependency",
		},
		{
			name: "missing dependency error (no binary providers)",
			tools: []*config.ToolConfig{
				{
					Name:         "tool-A",
					Dependencies: []string{"missing-bin"},
				},
			},
			expectError: true,
			wantErrSub:  "depends on missing dependency",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := TopologicalSort(tt.tools)
			if tt.expectError {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErrSub)
				}
				if tt.wantErrSub != "" && !strings.Contains(err.Error(), tt.wantErrSub) {
					t.Fatalf("expected error to contain %q, got: %v", tt.wantErrSub, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(got) != len(tt.wantOrder) {
				t.Fatalf("expected %d sorted tools, got %d", len(tt.wantOrder), len(got))
			}

			for i, w := range tt.wantOrder {
				if got[i].Name != w {
					t.Errorf("at index %d: expected tool name %q, got %q", i, w, got[i].Name)
				}
			}
		})
	}
}

func TestTopologicalSort_RobustnessAndDeterminism(t *testing.T) {
	t.Run("multiple tools providing same binary without dependency does not cause error", func(t *testing.T) {
		tools := []*config.ToolConfig{
			{
				Name:     "tool-A",
				Binaries: []interface{}{"shared-bin"},
			},
			{
				Name:     "tool-B",
				Binaries: []interface{}{"shared-bin"},
			},
		}
		sorted, err := TopologicalSort(tools)
		if err != nil {
			t.Fatalf("unexpected error when multiple tools provide the same binary but no dependency is declared: %v", err)
		}
		if len(sorted) != 2 {
			t.Fatalf("expected 2 tools, got %d", len(sorted))
		}
	})

	t.Run("multiple providers with dependency causes ambiguous dependency error", func(t *testing.T) {
		tools := []*config.ToolConfig{
			{
				Name:     "tool-A",
				Binaries: []interface{}{"shared-bin"},
			},
			{
				Name:     "tool-B",
				Binaries: []interface{}{"shared-bin"},
			},
			{
				Name:         "tool-C",
				Dependencies: []string{"shared-bin"},
			},
		}
		_, err := TopologicalSort(tools)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		expectedErrSub := `ambiguous dependency: binary "shared-bin" is provided by multiple tools: tool-A, tool-B`
		if !strings.Contains(err.Error(), expectedErrSub) {
			t.Errorf("expected error containing %q, got %q", expectedErrSub, err.Error())
		}
	})

	t.Run("self-dependency cycle is gracefully ignored", func(t *testing.T) {
		tools := []*config.ToolConfig{
			{
				Name:         "self-dep-tool",
				Dependencies: []string{"self-dep-tool"},
			},
		}
		sorted, err := TopologicalSort(tools)
		if err != nil {
			t.Fatalf("unexpected error on self dependency: %v", err)
		}
		if len(sorted) != 1 || sorted[0].Name != "self-dep-tool" {
			t.Errorf("expected sorted list to contain the self-dep-tool, got %v", sorted)
		}
	})
}
