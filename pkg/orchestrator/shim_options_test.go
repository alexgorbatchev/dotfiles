package orchestrator

import (
	"context"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestWantsShim(t *testing.T) {
	no := false
	yes := true
	binaries := []interface{}{
		"plain",
		map[string]interface{}{"name": "hidden", "shim": false},
		map[string]interface{}{"name": "shown", "shim": true},
		map[string]interface{}{"name": "located", "pattern": "*/bin/located"},
		config.BinaryConfig{Name: "typed-hidden", Shim: &no},
		&config.BinaryConfig{Name: "typed-shown", Shim: &yes},
		config.BinaryConfig{Name: "typed-default"},
	}
	tests := []struct {
		name string
		want bool
	}{
		{"plain", true},
		{"hidden", false},
		{"shown", true},
		{"located", true},
		{"typed-hidden", false},
		{"typed-shown", true},
		{"typed-default", true},
		{"undeclared", true},
	}
	for _, tt := range tests {
		if got := wantsShim(binaries, tt.name); got != tt.want {
			t.Errorf("wantsShim(%q) = %v, want %v", tt.name, got, tt.want)
		}
	}
}

// A binary declared with `shim: false` is left out of the generated bin directory while
// the tool's other binaries get their shims.
func TestGenerateToolSkipsShimlessBinaries(t *testing.T) {
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles/dotfiles.config.ts")
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			DotfilesDir:  "/home/user/dotfiles",
			GeneratedDir: "/home/user/dotfiles/.generated",
			TargetDir:    "/home/user/dotfiles/.generated/bin",
			BinariesDir:  "/home/user/dotfiles/.generated/binaries",
		},
	}
	tool := &config.ToolConfig{
		Name:               "typescript",
		InstallationMethod: "github-release",
		Binaries: []interface{}{
			"tsserver",
			map[string]interface{}{"name": "tsc", "shim": false},
		},
	}

	if err := orch.GenerateTool(context.Background(), tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	if exists, _ := memFS.Exists("/home/user/dotfiles/.generated/bin/tsserver"); !exists {
		t.Error("expected a shim for tsserver")
	}
	if exists, _ := memFS.Exists("/home/user/dotfiles/.generated/bin/tsc"); exists {
		t.Error("expected no shim for tsc")
	}
}
