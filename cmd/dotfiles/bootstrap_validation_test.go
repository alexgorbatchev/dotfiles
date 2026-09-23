package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A JSON configuration is loaded without the TypeScript loader, so it has to pass the
// same per-tool validation before any command sees its tools. Without it a misspelled
// conflict policy would silently fall back to the default, and a blank map key would
// produce a tool without a name.
func TestBootstrapServicesValidatesJSONToolConfigs(t *testing.T) {
	tests := []struct {
		name  string
		tools string
		want  []string
	}{
		{
			name:  "valid tool",
			tools: `"ssh": {"installationMethod": "manual", "blocks": [{"target": "~/.ssh/config", "id": "main", "conflict": "keep-local"}]}`,
		},
		{
			name:  "unknown conflict policy",
			tools: `"ssh": {"installationMethod": "manual", "blocks": [{"target": "~/.ssh/config", "id": "main", "conflict": "keep-locl"}]}`,
			want:  []string{"dotfiles.config.json", `tool "ssh"`, `conflict "keep-locl"`},
		},
		{
			// Both entries are named "ssh", so only the map key tells them apart; the
			// one under the first key is reported whatever order the map yields.
			name: "entries sharing a name fail on the first key",
			tools: `"b": {"name": "ssh", "installationMethod": "manual", "blocks": [{"target": "~/.ssh/config", "id": "main", "position": "Last"}]},` +
				`"a": {"name": "ssh", "installationMethod": "manual", "blocks": [{"target": "~/.ssh/config", "id": "main", "position": "First"}]}`,
			want: []string{`tool "ssh"`, `position "First"`},
		},
		{
			name:  "blank tool name",
			tools: `" ": {"installationMethod": "manual"}`,
			want:  []string{"dotfiles.config.json", "tool name is required"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			cfgPath := filepath.Join(tmpDir, "dotfiles.config.json")
			content := `{"projectConfig": {"paths": {` + projectPathsJSON(tmpDir) + `}}, "toolConfigs": {` + tt.tools + `}}`
			if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
				t.Fatalf("writing config: %v", err)
			}

			services, err := BootstrapServices(context.Background(), cfgPath)
			if len(tt.want) == 0 {
				if err != nil {
					t.Fatalf("BootstrapServices failed: %v", err)
				}
				defer services.Close()
				if len(services.ToolConfigs) != 1 || services.ToolConfigs[0].Name != "ssh" {
					t.Fatalf("expected the ssh tool to be loaded, got %v", services.ToolConfigs)
				}
				return
			}
			if err == nil {
				services.Close()
				t.Fatal("expected bootstrap to fail")
			}
			for _, want := range tt.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("expected the error to mention %q, got: %v", want, err)
				}
			}
		})
	}
}
