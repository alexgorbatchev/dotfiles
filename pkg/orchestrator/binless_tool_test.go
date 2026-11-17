package orchestrator

import (
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// A tool that declares no .bin() provides no binary, so its name is free for another
// tool's binary: a desktop application named "amp" installed without a command and a
// CLI tool that declares .bin("amp") neither collide nor make a dependency on "amp"
// ambiguous.
func TestBinlessToolNameDoesNotClaimABinary(t *testing.T) {
	app := &config.ToolConfig{Name: "amp", InstallationMethod: "dmg"}
	cli := &config.ToolConfig{Name: "amp-cli", InstallationMethod: "curl-binary", Binaries: []interface{}{map[string]interface{}{"name": "amp"}}}
	user := &config.ToolConfig{Name: "user", Dependencies: []string{"amp"}}

	for _, c := range DetectConflicts([]*config.ToolConfig{app, cli}) {
		t.Errorf("unexpected conflict: %+v", c)
	}

	sorted, err := TopologicalSort([]*config.ToolConfig{user, app, cli})
	if err != nil {
		t.Fatalf("TopologicalSort: %v", err)
	}
	position := make(map[string]int, len(sorted))
	for i, tool := range sorted {
		position[tool.Name] = i
	}
	if position["amp-cli"] > position["user"] {
		t.Errorf("order = %v, want amp-cli, which declares the amp binary, before its dependent", names(sorted))
	}
}

// A dependency on a bin-less tool's name still orders it first: the tool is named, not
// one of its binaries.
func TestDependencyOnBinlessToolResolvesByToolName(t *testing.T) {
	fonts := &config.ToolConfig{Name: "fonts"}
	user := &config.ToolConfig{Name: "user", Dependencies: []string{"fonts"}}

	sorted, err := TopologicalSort([]*config.ToolConfig{user, fonts})
	if err != nil {
		t.Fatalf("TopologicalSort: %v", err)
	}
	if got := names(sorted); len(got) != 2 || got[0] != "fonts" || got[1] != "user" {
		t.Errorf("order = %v, want [fonts user]", got)
	}
}

func names(tools []*config.ToolConfig) []string {
	out := make([]string, len(tools))
	for i, tool := range tools {
		out[i] = tool.Name
	}
	return out
}
