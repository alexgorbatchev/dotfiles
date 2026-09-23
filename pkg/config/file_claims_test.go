package config

import (
	"path/filepath"
	"strings"
	"testing"
)

// fileClaimsProject is the project every file-claim case resolves against: a home
// directory for "~" and {paths.homeDir}, and a generated directory for a placeholder
// that is not the home directory.
func fileClaimsProject(t *testing.T) (*ProjectConfig, string) {
	t.Helper()
	home, err := filepath.Abs(filepath.FromSlash("/home/probe"))
	if err != nil {
		t.Fatalf("resolving the home directory: %v", err)
	}
	return &ProjectConfig{Paths: PathsConfig{HomeDir: home, GeneratedDir: filepath.Join(home, ".generated")}}, home
}

// TestValidateToolConfigsRejectsSharedFiles pins the load-time rule that one file has
// one owner. Two declarations whose targets resolve to the same file would each write
// it in turn and the last one applied would win without a message: a block's content
// replaced by another tool's, a copy moved aside into a new .bak on every run, a
// template's rendering reported as a local edit, a symlink silently repointed, and a
// block written through a symlink into the repository file it points at. The targets
// are compared once resolved, so the spelling of a path does not hide a collision.
func TestValidateToolConfigsRejectsSharedFiles(t *testing.T) {
	proj, home := fileClaimsProject(t)
	sshConfig := filepath.Join(home, ".ssh", "config")
	shared := filepath.Join(home, "shared.conf")

	alpha := func(tc ToolConfig) *ToolConfig {
		tc.Name = "alpha"
		tc.ConfigFilePath = "/repo/tools/alpha.tool.ts"
		return &tc
	}
	beta := func(tc ToolConfig) *ToolConfig {
		tc.Name = "beta"
		tc.ConfigFilePath = "/repo/tools/beta.tool.ts"
		return &tc
	}

	tests := []struct {
		name  string
		tools []*ToolConfig
		want  []string
	}{
		{
			name: "blocks with different ids share a file",
			tools: []*ToolConfig{
				alpha(ToolConfig{Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "alpha"}}}),
				beta(ToolConfig{Blocks: []BlockConfig{{Target: "{paths.homeDir}/.ssh/config", ID: "beta"}}}),
			},
		},
		{
			name: "whole-file declarations of different files",
			tools: []*ToolConfig{
				alpha(ToolConfig{
					Symlinks:  []SymlinkConfig{{Source: "./a", Target: "~/a"}},
					Copies:    []CopyConfig{{Source: "./b", Target: "~/b"}},
					Templates: []TemplateConfig{{Source: "./c", Target: "~/c"}},
				}),
				beta(ToolConfig{Blocks: []BlockConfig{{Target: "~/d", ID: "main"}}}),
			},
		},
		{
			name: "a disabled tool claims nothing",
			tools: []*ToolConfig{
				alpha(ToolConfig{Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}}),
				beta(ToolConfig{Disabled: true, Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}}),
			},
		},
		{
			name: "a tool for another host claims nothing",
			tools: []*ToolConfig{
				alpha(ToolConfig{Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}}),
				beta(ToolConfig{Hostname: "/^no-host-is-called-this-165$/", Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}}),
			},
		},
		{
			name: "two tools share a block",
			tools: []*ToolConfig{
				beta(ToolConfig{Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}}),
				alpha(ToolConfig{Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}}),
			},
			want: []string{
				`tool "alpha" ("/repo/tools/alpha.tool.ts")`, `tool "beta" ("/repo/tools/beta.tool.ts")`,
				`.block() "main" targeting "~/.ssh/config"`, sshConfig,
			},
		},
		{
			name: "one tool spells one block's file two ways",
			tools: []*ToolConfig{
				alpha(ToolConfig{Blocks: []BlockConfig{
					{Target: "~/.ssh/config", ID: "main"},
					{Target: "{paths.homeDir}/.ssh/config", ID: "main"},
				}}),
			},
			want: []string{
				`tool "alpha" ("/repo/tools/alpha.tool.ts")`, sshConfig,
				`.block() "main" targeting "~/.ssh/config"`, `.block() "main" targeting "{paths.homeDir}/.ssh/config"`,
			},
		},
		{
			name: "two tools copy to one file",
			tools: []*ToolConfig{
				alpha(ToolConfig{Copies: []CopyConfig{{Source: "./alpha.conf", Target: "~/shared.conf"}}}),
				beta(ToolConfig{Copies: []CopyConfig{{Source: "./beta.conf", Target: "$HOME/shared.conf"}}}),
			},
			want: []string{`tool "alpha"`, `tool "beta"`, `.copy() targeting "~/shared.conf"`, `.copy() targeting "$HOME/shared.conf"`, shared},
		},
		{
			name: "two tools render a template to one file",
			tools: []*ToolConfig{
				alpha(ToolConfig{Templates: []TemplateConfig{{Source: "./alpha.tmpl", Target: "~/shared.conf"}}}),
				beta(ToolConfig{Templates: []TemplateConfig{{Source: "./beta.tmpl", Target: "~/./shared.conf"}}}),
			},
			want: []string{`tool "alpha"`, `tool "beta"`, `.template() targeting "~/shared.conf"`, `.template() targeting "~/./shared.conf"`, shared},
		},
		{
			name: "two tools link one file",
			tools: []*ToolConfig{
				alpha(ToolConfig{Symlinks: []SymlinkConfig{{Source: "./alpha.conf", Target: "~/shared.conf"}}}),
				beta(ToolConfig{Symlinks: []SymlinkConfig{{Source: "./beta.conf", Target: "~/shared.conf"}}}),
			},
			want: []string{`tool "alpha"`, `tool "beta"`, `.symlink() targeting "~/shared.conf"`, shared},
		},
		{
			name: "one tool repeats a symlink",
			tools: []*ToolConfig{
				alpha(ToolConfig{Symlinks: []SymlinkConfig{
					{Source: "./alpha.conf", Target: "~/shared.conf"},
					{Source: "./alpha.conf", Target: "~/shared.conf"},
				}}),
			},
			want: []string{`tool "alpha"`, shared, `the same .symlink() of "./alpha.conf" is declared twice`},
		},
		{
			name: "two tools link one file from sources spelled alike",
			tools: []*ToolConfig{
				alpha(ToolConfig{Symlinks: []SymlinkConfig{{Source: "./shared.conf", Target: "~/shared.conf"}}}),
				beta(ToolConfig{Symlinks: []SymlinkConfig{{Source: "./shared.conf", Target: "~/shared.conf"}}}),
			},
			want: []string{`tool "alpha"`, `tool "beta"`, shared, "each run would replace the other's"},
		},
		{
			name: "a copy and a template of one tool write one file",
			tools: []*ToolConfig{
				alpha(ToolConfig{
					Copies:    []CopyConfig{{Source: "./a.conf", Target: "~/shared.conf"}},
					Templates: []TemplateConfig{{Source: "./a.tmpl", Target: "~/shared.conf"}},
				}),
			},
			want: []string{`tool "alpha"`, `.copy() targeting "~/shared.conf"`, `.template() targeting "~/shared.conf"`, shared},
		},
		{
			name: "a block in a file another tool links",
			tools: []*ToolConfig{
				alpha(ToolConfig{Symlinks: []SymlinkConfig{{Source: "./alpha.conf", Target: "~/shared.conf"}}}),
				beta(ToolConfig{Blocks: []BlockConfig{{Target: "~/shared.conf", ID: "main"}}}),
			},
			want: []string{`tool "alpha"`, `tool "beta"`, `.symlink() targeting "~/shared.conf"`, `.block() "main" targeting "~/shared.conf"`, shared},
		},
		{
			name: "a block in a file another tool copies",
			tools: []*ToolConfig{
				alpha(ToolConfig{Blocks: []BlockConfig{{Target: "~/shared.conf", ID: "main"}}}),
				beta(ToolConfig{Copies: []CopyConfig{{Source: "./beta.conf", Target: "~/shared.conf"}}}),
			},
			want: []string{`tool "alpha"`, `tool "beta"`, `.copy() targeting "~/shared.conf"`, `.block() "main" targeting "~/shared.conf"`, shared},
		},
		{
			name: "a block in a file the same tool renders",
			tools: []*ToolConfig{
				alpha(ToolConfig{
					Templates: []TemplateConfig{{Source: "./a.tmpl", Target: "~/shared.conf"}},
					Blocks:    []BlockConfig{{Target: "~/shared.conf", ID: "main"}},
				}),
			},
			want: []string{`tool "alpha"`, `.template() targeting "~/shared.conf"`, `.block() "main" targeting "~/shared.conf"`, shared},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateToolConfigs(tt.tools, proj)
			if len(tt.want) == 0 {
				if err != nil {
					t.Fatalf("ValidateToolConfigs() = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatal("ValidateToolConfigs() = nil, want an error")
			}
			for _, want := range tt.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("ValidateToolConfigs() = %v, want it to contain %s", err, want)
				}
			}
		})
	}
}

// The first collision is reported the same way whatever order the tools arrive in,
// naming the tool that sorts first before the one it collides with.
func TestValidateToolConfigsReportsSharedFilesInToolOrder(t *testing.T) {
	proj, _ := fileClaimsProject(t)
	shared := []BlockConfig{{Target: "~/.ssh/config", ID: "main"}}
	forward := []*ToolConfig{{Name: "alpha", Blocks: shared}, {Name: "beta", Blocks: shared}}
	reverse := []*ToolConfig{{Name: "beta", Blocks: shared}, {Name: "alpha", Blocks: shared}}

	first := ValidateToolConfigs(forward, proj)
	second := ValidateToolConfigs(reverse, proj)
	if first == nil || second == nil {
		t.Fatalf("ValidateToolConfigs() = %v, %v, want two errors", first, second)
	}
	if first.Error() != second.Error() {
		t.Errorf("the error depends on the order of the tools:\n%v\n%v", first, second)
	}
	if strings.Index(first.Error(), `tool "alpha"`) > strings.Index(first.Error(), `tool "beta"`) {
		t.Errorf("expected alpha to be named before beta, got: %v", first)
	}
}

// A target no placeholder can fill is not a claim on any file. The load leaves it to
// the step that writes the declaration, which reports the placeholder it cannot fill.
func TestValidateToolConfigsSkipsUnresolvableTargets(t *testing.T) {
	proj, _ := fileClaimsProject(t)
	tools := []*ToolConfig{
		{Name: "alpha", Blocks: []BlockConfig{{Target: "{nothing}/x", ID: "main"}}},
		{Name: "beta", Blocks: []BlockConfig{{Target: "{nothing}/x", ID: "main"}}},
	}
	if err := ValidateToolConfigs(tools, proj); err != nil {
		t.Fatalf("ValidateToolConfigs() = %v, want nil", err)
	}
}
