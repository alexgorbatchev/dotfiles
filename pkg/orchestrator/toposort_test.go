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

	t.Run("brew tool provider automatically sorted before brew-backed tools", func(t *testing.T) {
		tools := []*config.ToolConfig{
			{
				Name:               "borders",
				InstallationMethod: "brew",
				Dependencies:       []string{"brew"},
			},
			{
				Name:               "brew",
				InstallationMethod: "curl-script",
				Binaries:           []interface{}{"brew"},
			},
		}
		sorted, err := TopologicalSort(tools)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(sorted) != 2 {
			t.Fatalf("expected 2 tools, got %d", len(sorted))
		}
		if sorted[0].Name != "brew" || sorted[1].Name != "borders" {
			t.Errorf("expected [brew, borders], got [%s, %s]", sorted[0].Name, sorted[1].Name)
		}
	})

	t.Run("system binary dependency without tool provider succeeds", func(t *testing.T) {
		// "sh" is guaranteed to be a system binary on Unix
		tools := []*config.ToolConfig{
			{
				Name:         "tool-needing-sh",
				Dependencies: []string{"sh"},
			},
		}
		sorted, err := TopologicalSort(tools)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(sorted) != 1 || sorted[0].Name != "tool-needing-sh" {
			t.Errorf("expected tool-needing-sh, got %v", sorted)
		}
	})
}

// The binary names below are deliberately nonsensical so that isSystemBinary cannot
// find them on any platform and the skipped-provider path is the one under test.
func TestTopologicalSort_SkippedProvider(t *testing.T) {
	tests := []struct {
		name        string
		skipped     *config.ToolConfig
		wantWarning string
	}{
		{
			name: "disabled provider",
			skipped: &config.ToolConfig{
				Name:     "provider",
				Binaries: []interface{}{"dotfilesnosuchbin"},
				Disabled: true,
			},
			wantWarning: `Tool "consumer" depends on "dotfilesnosuchbin", provided by disabled tool "provider": continuing without it`,
		},
		{
			name: "provider scoped to another hostname",
			skipped: &config.ToolConfig{
				Name:     "provider",
				Binaries: []interface{}{"dotfilesnosuchbin"},
				Hostname: "some-other-machine",
			},
			wantWarning: `Tool "consumer" depends on "dotfilesnosuchbin", provided by tool "provider" which is scoped to hostname "some-other-machine": continuing without it`,
		},
		{
			name: "disabled provider declaring no binaries is named by its tool name",
			skipped: &config.ToolConfig{
				Name:     "dotfilesnosuchbin",
				Disabled: true,
			},
			wantWarning: `Tool "consumer" depends on "dotfilesnosuchbin", provided by disabled tool "dotfilesnosuchbin": continuing without it`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			active := []*config.ToolConfig{
				{Name: "consumer", Binaries: []interface{}{"consumerbin"}, Dependencies: []string{"dotfilesnosuchbin"}},
				{Name: "unrelated", Binaries: []interface{}{"unrelatedbin"}},
			}

			var warnings []string
			sorted, err := topologicalSort(active, []*config.ToolConfig{tt.skipped}, func(msg string) {
				warnings = append(warnings, msg)
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			names := make([]string, 0, len(sorted))
			for _, tool := range sorted {
				names = append(names, tool.Name)
			}
			if len(names) != 2 || names[0] != "consumer" || names[1] != "unrelated" {
				t.Fatalf("expected [consumer unrelated], got %v", names)
			}

			if len(warnings) != 1 || warnings[0] != tt.wantWarning {
				t.Fatalf("expected warning %q, got %v", tt.wantWarning, warnings)
			}
		})
	}

	t.Run("two host-scoped providers of the same binary are not ambiguous", func(t *testing.T) {
		active := []*config.ToolConfig{
			{Name: "here", Binaries: []interface{}{"dotfilesnosuchbin"}},
			{Name: "consumer", Dependencies: []string{"dotfilesnosuchbin"}},
		}
		skipped := []*config.ToolConfig{
			{Name: "there", Binaries: []interface{}{"dotfilesnosuchbin"}, Hostname: "some-other-machine"},
		}

		var warnings []string
		sorted, err := topologicalSort(active, skipped, func(msg string) { warnings = append(warnings, msg) })
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(sorted) != 2 || sorted[0].Name != "here" || sorted[1].Name != "consumer" {
			t.Fatalf("expected [here consumer], got %v", sorted)
		}
		if len(warnings) != 0 {
			t.Fatalf("expected no warning when an active tool provides the binary, got %v", warnings)
		}
	})

	t.Run("a dependency no tool provides at all is still an error", func(t *testing.T) {
		active := []*config.ToolConfig{
			{Name: "consumer", Dependencies: []string{"dotfilesnosuchbin"}},
		}
		skipped := []*config.ToolConfig{
			{Name: "provider", Binaries: []interface{}{"dotfilesotherbin"}, Disabled: true},
		}

		_, err := topologicalSort(active, skipped, func(string) {})
		if err == nil {
			t.Fatal("expected an error for a dependency nothing provides, got nil")
		}
		if !strings.Contains(err.Error(), `depends on missing dependency "dotfilesnosuchbin"`) {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
