package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// unsupportedConfigMessage is what a configuration file in any format but TypeScript/JavaScript
// is refused with.
const unsupportedConfigMessage = "only TypeScript/JavaScript configurations (.ts/.js) are supported"

// A configuration is written in TypeScript and nothing else (#164). A file in another
// format named with --config is refused before anything reads it, whatever it holds,
// rather than being decoded by a second loader that skips the platform overrides,
// unknown-key rejection and validation the TypeScript loader applies.
func TestBootstrapServicesRejectsNonTypeScriptConfig(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		content  string
	}{
		{
			name:     "json configuration in the shape the removed loader read",
			fileName: "dotfiles.config.json",
			content:  `{"projectConfig": {"paths": {}}, "toolConfigs": {}}`,
		},
		{
			name:     "dotted json configuration",
			fileName: ".dotfiles.config.json",
			content:  `{}`,
		},
		{
			name:     "file without an extension",
			fileName: "dotfiles-config",
			content:  `export default {};`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfgPath := filepath.Join(t.TempDir(), tt.fileName)
			if err := os.WriteFile(cfgPath, []byte(tt.content), 0644); err != nil {
				t.Fatalf("writing config: %v", err)
			}

			services, err := BootstrapServices(context.Background(), cfgPath)
			if err == nil {
				services.Close()
				t.Fatalf("expected %s to be refused", tt.fileName)
			}
			for _, want := range []string{cfgPath, unsupportedConfigMessage} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("expected the error to mention %q, got: %v", want, err)
				}
			}
		})
	}

	t.Run("accepts javascript configuration", func(t *testing.T) {
		dir := t.TempDir()
		cfgPath := filepath.Join(dir, "dotfiles.config.js")
		content := fmt.Sprintf("export default { paths: { %s } };\n", projectPathsTS(dir))
		if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
			t.Fatalf("writing config: %v", err)
		}

		services, err := BootstrapServices(context.Background(), cfgPath)
		if err != nil {
			t.Fatalf("expected .js config to be accepted, got: %v", err)
		}
		defer services.Close()
		if services.ProjectConfig == nil {
			t.Fatal("expected non-nil ProjectConfig")
		}
	})
}

// dotfiles.config.json and .dotfiles.config.json are no longer configuration files, so
// a directory holding only one of them has no configuration to discover.
func TestBootstrapServicesDoesNotDiscoverJSONConfig(t *testing.T) {
	for _, name := range []string{"dotfiles.config.json", ".dotfiles.config.json"} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("DOTFILES_REPO_ROOT", enterTempDir(t))
			if err := os.WriteFile(name, []byte(`{"projectConfig": {}, "toolConfigs": {}}`), 0644); err != nil {
				t.Fatalf("writing config: %v", err)
			}

			services, err := BootstrapServices(context.Background(), "")
			if err == nil {
				services.Close()
				t.Fatalf("expected %s not to be discovered", name)
			}
			if !strings.Contains(err.Error(), "defaults not found") {
				t.Errorf("expected no configuration to be found, got: %v", err)
			}
		})
	}
}

// The TypeScript loader runs the per-tool validation before any command sees a tool, so
// a misspelled conflict policy fails the load, naming the tool file, instead of
// silently falling back to the default.
func TestBootstrapServicesValidatesToolConfigs(t *testing.T) {
	tests := []struct {
		name   string
		policy string
		want   []string
	}{
		{name: "valid tool", policy: "keep-local"},
		{name: "unknown conflict policy", policy: "keep-locl", want: []string{"ssh.tool.ts", `tool "ssh"`, `conflict "keep-locl"`}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			cfgPath := writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}`, tsTools{
				"ssh": `install("manual").block("~/.ssh/config", { id: "main", conflict: "` + tt.policy + `" })`,
			})

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
