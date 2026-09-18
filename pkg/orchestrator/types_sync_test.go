package orchestrator

import (
	"context"
	"encoding/json"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/scaffold"
)

func typesProjectConfig() *config.ProjectConfig {
	return &config.ProjectConfig{
		Paths: config.PathsConfig{
			DotfilesDir:    "/home/user/dotfiles",
			GeneratedDir:   "/home/user/dotfiles/.generated",
			ToolConfigsDir: []string{"/home/user/dotfiles/tools", "/home/user/dotfiles/extra-tools"},
		},
	}
}

func readGenerated(t *testing.T, memFS fs.FS, path string) string {
	t.Helper()
	content, err := memFS.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return string(content)
}

func TestSyncTypeScriptTypesWritesModuleRegistryWithEveryTool(t *testing.T) {
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles/dotfiles.config.ts")
	projCfg := typesProjectConfig()

	tools := []*config.ToolConfig{
		{Name: "bat", Binaries: []interface{}{"bat"}},
		{Name: "helper", Binaries: []interface{}{map[string]interface{}{"name": "helper-bin"}}, Disabled: true},
		{Name: "laptop-only", Hostname: "not-this-machine"},
	}
	if err := orch.SyncTypeScriptTypes(context.Background(), tools, projCfg); err != nil {
		t.Fatalf("SyncTypeScriptTypes: %v", err)
	}

	registry := readGenerated(t, memFS, "/home/user/dotfiles/.generated/tool-types.d.ts")
	lines := strings.Split(registry, "\n")
	if lines[1] != `import "@alexgorbatchev/dotfiles";` {
		t.Errorf("the registry must be a module that imports the package; second line = %q", lines[1])
	}
	for _, want := range []string{`"bat": never;`, `"helper": never;`, `"helper-bin": never;`, `"laptop-only": never;`} {
		if !strings.Contains(registry, want) {
			t.Errorf("registry is missing %s:\n%s", want, registry)
		}
	}
}

func TestSyncTypeScriptTypesWritesTheCLIOwnedTSConfig(t *testing.T) {
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles/dotfiles.config.ts")
	projCfg := typesProjectConfig()

	if err := orch.SyncTypeScriptTypes(context.Background(), nil, projCfg); err != nil {
		t.Fatalf("SyncTypeScriptTypes: %v", err)
	}

	var generated struct {
		CompilerOptions struct {
			Types []string            `json:"types"`
			Paths map[string][]string `json:"paths"`
		} `json:"compilerOptions"`
		Include []string `json:"include"`
	}
	if err := json.Unmarshal([]byte(readGenerated(t, memFS, "/home/user/dotfiles/.generated/tsconfig.json")), &generated); err != nil {
		t.Fatalf("generated tsconfig is not JSON: %v", err)
	}
	wantInclude := []string{
		"./node_modules/@alexgorbatchev/dotfiles/index.d.ts",
		"./node_modules/@alexgorbatchev/dotfiles/globals.d.ts",
		"../dotfiles.config.ts",
		"../tools/**/*.ts",
		"../extra-tools/**/*.ts",
		"./tool-types.d.ts",
	}
	if !slices.Equal(generated.Include, wantInclude) {
		t.Errorf("include = %v, want %v", generated.Include, wantInclude)
	}
	if len(generated.CompilerOptions.Types) != 0 || generated.CompilerOptions.Types == nil {
		t.Errorf("types = %v, want an explicit empty list", generated.CompilerOptions.Types)
	}

	var project struct {
		Extends string `json:"extends"`
	}
	if err := json.Unmarshal([]byte(readGenerated(t, memFS, "/home/user/dotfiles/tsconfig.json")), &project); err != nil {
		t.Fatalf("project tsconfig is not JSON: %v", err)
	}
	if project.Extends != "./.generated/tsconfig.json" {
		t.Errorf("project tsconfig extends %q, want ./.generated/tsconfig.json", project.Extends)
	}
}

func TestSyncTypeScriptTypesLeavesJSONConfigOutOfTheProgram(t *testing.T) {
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles/dotfiles.config.json")
	projCfg := typesProjectConfig()

	if err := orch.SyncTypeScriptTypes(context.Background(), nil, projCfg); err != nil {
		t.Fatalf("SyncTypeScriptTypes: %v", err)
	}
	tsconfig := readGenerated(t, memFS, "/home/user/dotfiles/.generated/tsconfig.json")
	if strings.Contains(tsconfig, "dotfiles.config.json") {
		t.Errorf("a JSON configuration must not be listed for type-checking:\n%s", tsconfig)
	}
	if !strings.Contains(tsconfig, "../tools/**/*.ts") {
		t.Errorf("tool directories must still be type-checked:\n%s", tsconfig)
	}
}

func TestSyncTypeScriptTypesProjectTSConfigOwnership(t *testing.T) {
	legacy, err := scaffold.ProjectTSConfig("./elsewhere/tsconfig.json")
	if err != nil {
		t.Fatal(err)
	}
	userEdited := []byte("{\n  \"compilerOptions\": { \"strict\": false }\n}\n")

	tests := []struct {
		name         string
		existing     []byte
		wantReplaced bool
	}{
		{name: "missing file is written", existing: nil, wantReplaced: true},
		{name: "legacy generated file is brought up to date", existing: legacyTSConfigBytes(), wantReplaced: true},
		{name: "user-edited file is left alone", existing: userEdited, wantReplaced: false},
		{name: "current generated form is left alone", existing: legacy, wantReplaced: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles/dotfiles.config.ts")
			projCfg := typesProjectConfig()
			path := filepath.Join(projCfg.Paths.DotfilesDir, "tsconfig.json")
			if tt.existing != nil {
				if err := memFS.MkdirAll(projCfg.Paths.DotfilesDir, 0755); err != nil {
					t.Fatal(err)
				}
				if err := memFS.WriteFile(path, tt.existing, 0644); err != nil {
					t.Fatal(err)
				}
			}

			if err := orch.SyncTypeScriptTypes(context.Background(), nil, projCfg); err != nil {
				t.Fatalf("SyncTypeScriptTypes: %v", err)
			}

			got := readGenerated(t, memFS, path)
			isExtends := strings.Contains(got, `"extends": "./.generated/tsconfig.json"`)
			if tt.wantReplaced && !isExtends {
				t.Errorf("expected the project tsconfig to extend the generated one, got:\n%s", got)
			}
			if !tt.wantReplaced && got != string(tt.existing) {
				t.Errorf("existing tsconfig was modified:\n%s", got)
			}
		})
	}
}

// legacyTSConfigBytes reproduces the tsconfig earlier versions wrote, via the
// detector's own definition so the test cannot drift from it.
func legacyTSConfigBytes() []byte {
	content := []byte("{\n  \"compilerOptions\": {\n    \"target\": \"ESNext\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"strict\": true,\n    \"noEmit\": true,\n    \"skipLibCheck\": true,\n    \"lib\": [\n      \"ESNext\"\n    ]\n  },\n  \"include\": [\n    \"dotfiles.config.ts\",\n    \"tools/**/*.ts\"\n  ]\n}\n")
	if !scaffold.IsLegacyProjectTSConfig(content) {
		panic("test fixture no longer matches scaffold's legacy tsconfig")
	}
	return content
}
