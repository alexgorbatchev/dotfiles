package config

import (
	"encoding/json"
	"testing"
)

func TestPlatformMerge(t *testing.T) {
	t.Run("Base fields, Symlinks, Dependencies, and Env map merging", func(t *testing.T) {
		v1 := "1.0.0"
		v2 := "2.0.0"

		base := &ToolConfig{
			Name:    "test-tool",
			Version: &v1,
			Symlinks: []SymlinkConfig{
				{Source: "base-src", Target: "base-tgt"},
			},
			Dependencies: []string{"dep1"},
			ShellConfigs: &ShellConfigs{
				Zsh: &ShellTypeConfig{
					Env: map[string]string{
						"BASE_ENV": "base-val",
						"CONFLICT": "base-conflict",
					},
				},
			},
		}

		overrideJSON := `{
			"version": "2.0.0",
			"symlinks": [
				{"source": "override-src", "target": "override-tgt"}
			],
			"dependencies": ["dep2"],
			"shellConfigs": {
				"zsh": {
					"env": {
						"OVERRIDE_ENV": "override-val",
						"CONFLICT": "override-conflict"
					}
				}
			}
		}`

		var rawOverride map[string]interface{}
		if err := json.Unmarshal([]byte(overrideJSON), &rawOverride); err != nil {
			t.Fatalf("failed to unmarshal raw override: %v", err)
		}

		var override ToolConfig
		if err := json.Unmarshal([]byte(overrideJSON), &override); err != nil {
			t.Fatalf("failed to unmarshal override ToolConfig: %v", err)
		}

		base.Merge(&override, rawOverride)

		// 1. Base Fields: Version is successfully overwritten
		if base.Version == nil || *base.Version != v2 {
			t.Errorf("expected Version to be overwritten to %q, got %v", v2, base.Version)
		}

		// 2. Concatenation: Base Symlinks and override Symlinks are both present
		if len(base.Symlinks) != 2 {
			t.Errorf("expected 2 symlinks, got %d", len(base.Symlinks))
		} else {
			if base.Symlinks[0].Source != "base-src" || base.Symlinks[1].Source != "override-src" {
				t.Errorf("unexpected symlinks: %+v", base.Symlinks)
			}
		}

		// 3. Concatenation: Base Dependencies and override Dependencies are correctly merged
		if len(base.Dependencies) != 2 {
			t.Errorf("expected 2 dependencies, got %d", len(base.Dependencies))
		} else {
			if base.Dependencies[0] != "dep1" || base.Dependencies[1] != "dep2" {
				t.Errorf("unexpected dependencies: %+v", base.Dependencies)
			}
		}

		// 4. Map Merging: Conflicting keys in Env are overridden, non-conflicting are preserved
		if base.ShellConfigs == nil || base.ShellConfigs.Zsh == nil || base.ShellConfigs.Zsh.Env == nil {
			t.Fatalf("Zsh Env is nil after merge")
		}
		env := base.ShellConfigs.Zsh.Env
		if val, ok := env["BASE_ENV"]; !ok || val != "base-val" {
			t.Errorf("expected BASE_ENV to be preserved with value 'base-val', got %q (ok=%t)", val, ok)
		}
		if val, ok := env["OVERRIDE_ENV"]; !ok || val != "override-val" {
			t.Errorf("expected OVERRIDE_ENV to be added with value 'override-val', got %q (ok=%t)", val, ok)
		}
		if val, ok := env["CONFLICT"]; !ok || val != "override-conflict" {
			t.Errorf("expected CONFLICT to be overridden with value 'override-conflict', got %q (ok=%t)", val, ok)
		}
	})
}
