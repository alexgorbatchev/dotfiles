package config

import (
	"encoding/json"
	"strings"
	"testing"
)

func testProjectConfig() *ProjectConfig {
	cfg := &ProjectConfig{}
	cfg.Paths.HomeDir = "/home/user"
	cfg.Paths.DotfilesDir = "/repo"
	cfg.Paths.GeneratedDir = "/repo/.generated"
	cfg.Paths.TargetDir = "/repo/.generated/bin"
	cfg.Paths.BinariesDir = "/repo/.generated/binaries"
	return cfg
}

// TestParseMode covers every spelling an author might reasonably write a POSIX
// permission in, and the ones that have to be refused. A mode silently read as the
// wrong number would leave a private key world-readable.
func TestParseMode(t *testing.T) {
	tests := []struct {
		input   string
		want    uint32
		wantErr bool
	}{
		{input: "0600", want: 0o600},
		{input: "600", want: 0o600},
		{input: "0o600", want: 0o600},
		{input: "0700", want: 0o700},
		{input: "0644", want: 0o644},
		{input: "755", want: 0o755},
		{input: "", wantErr: true},
		{input: "rw-------", wantErr: true},
		{input: "0999", wantErr: true},
		{input: "abc", wantErr: true},
		{input: "01000", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := ParseMode(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("ParseMode(%q) = %04o, want an error", tt.input, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseMode(%q): %v", tt.input, err)
			}
			if uint32(got) != tt.want {
				t.Errorf("ParseMode(%q) = %04o, want %04o", tt.input, got, tt.want)
			}
		})
	}
}

// TestRenderTemplate checks that a template is filled from the same {token} syntax
// the rest of the project uses, and that the author's own variables win over the
// built-in ones without the built-in ones disappearing.
func TestRenderTemplate(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		variables map[string]any
		want      string
	}{
		{
			name:      "an author's variable",
			content:   "email = {email}\n",
			variables: map[string]any{"email": "alex@example.com"},
			want:      "email = alex@example.com\n",
		},
		{
			name:    "a project placeholder needs no variable",
			content: "path = {paths.homeDir}\n",
			want:    "path = /home/user\n",
		},
		{
			name:      "a variable shadows a project placeholder",
			content:   "name = {toolName}\n",
			variables: map[string]any{"toolName": "overridden"},
			want:      "name = overridden\n",
		},
		{
			name:      "values that are not strings are rendered as written",
			content:   "count = {count}\nenabled = {enabled}\n",
			variables: map[string]any{"count": 3, "enabled": true},
			want:      "count = 3\nenabled = true\n",
		},
		{
			name:    "a shell expansion is left for the shell",
			content: "export PATH=${HOME}/bin\n",
			want:    "export PATH=${HOME}/bin\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := RenderTemplate(tt.content, tt.variables, "git", testProjectConfig())
			if err != nil {
				t.Fatalf("RenderTemplate: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

// TestRenderTemplateReportsAnUnfilledToken is the important one. A template that
// silently rendered an unknown {token} as nothing, or left it in place, would write a
// broken configuration file and say nothing about it.
func TestRenderTemplateReportsAnUnfilledToken(t *testing.T) {
	_, err := RenderTemplate("key = {signingKey}\n", map[string]any{"email": "a@b.c"}, "git", testProjectConfig())
	if err == nil {
		t.Fatal("expected an error for a token no variable fills")
	}
	if !strings.Contains(err.Error(), "signingKey") {
		t.Errorf("error = %q, want it to name the token that could not be filled", err)
	}
}

func TestBlockConfigValidate(t *testing.T) {
	tests := []struct {
		name    string
		block   BlockConfig
		wantErr string
	}{
		{
			name:  "a complete declaration",
			block: BlockConfig{Target: "~/.ssh/config", ID: "includes", Mode: "0600"},
		},
		{
			name:    "no target",
			block:   BlockConfig{ID: "includes"},
			wantErr: "target",
		},
		{
			name:    "no id",
			block:   BlockConfig{Target: "~/.ssh/config"},
			wantErr: "id",
		},
		{
			name:    "an id that cannot be written into a marker",
			block:   BlockConfig{Target: "~/.ssh/config", ID: "has space"},
			wantErr: "id",
		},
		{
			name:    "an unusable mode",
			block:   BlockConfig{Target: "~/.ssh/config", ID: "includes", Mode: "rwx"},
			wantErr: "mode",
		},
		{
			name:    "a position nothing implements",
			block:   BlockConfig{Target: "~/.ssh/config", ID: "includes", Position: "middle"},
			wantErr: "position",
		},
		{
			name:    "a conflict policy nothing implements",
			block:   BlockConfig{Target: "~/.ssh/config", ID: "includes", Conflict: "rebase"},
			wantErr: "conflict",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.block.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected an error mentioning %q", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("error = %q, want it to mention %q", err, tt.wantErr)
			}
		})
	}
}

// TestToolConfigDecodesDeclarativeFiles checks the shape the loader actually sends
// across the JSON boundary. Decoding rejects unknown fields, so a mismatch between
// what the DSL writes and what Go reads fails loudly here rather than silently
// dropping a declaration.
func TestToolConfigDecodesDeclarativeFiles(t *testing.T) {
	raw := `{
		"name": "ssh",
		"directories": [{"path": "~/.ssh", "mode": "0700"}],
		"symlinks": [{"source": "id_rsa", "target": "~/.ssh/id_rsa", "mode": "0600"}],
		"copies": [{"source": "known_hosts", "target": "~/.ssh/known_hosts", "conflict": "keep-local"}],
		"blocks": [{
			"target": "~/.ssh/config",
			"id": "includes",
			"content": "Include /repo/tools/ssh/config",
			"mode": "0600",
			"position": "top",
			"conflict": "merge"
		}],
		"templates": [{
			"source": "./gitconfig.template",
			"target": "~/.gitconfig",
			"variables": {"email": "alex@example.com"},
			"mode": "0644",
			"conflict": "merge"
		}]
	}`

	var tool ToolConfig
	if err := json.Unmarshal([]byte(raw), &tool); err != nil {
		t.Fatalf("decoding tool configuration: %v", err)
	}

	if len(tool.Directories) != 1 || tool.Directories[0].Mode != "0700" {
		t.Errorf("directories = %+v", tool.Directories)
	}
	if len(tool.Symlinks) != 1 || tool.Symlinks[0].Mode != "0600" {
		t.Errorf("symlinks = %+v", tool.Symlinks)
	}
	if len(tool.Copies) != 1 || tool.Copies[0].Conflict != "keep-local" {
		t.Errorf("copies = %+v", tool.Copies)
	}
	if len(tool.Blocks) != 1 {
		t.Fatalf("blocks = %+v", tool.Blocks)
	}
	block := tool.Blocks[0]
	if block.ID != "includes" || block.Position != "top" || block.Mode != "0600" {
		t.Errorf("block = %+v", block)
	}
	if len(tool.Templates) != 1 {
		t.Fatalf("templates = %+v", tool.Templates)
	}
	if got := tool.Templates[0].Variables["email"]; got != "alex@example.com" {
		t.Errorf("template variables = %+v", tool.Templates[0].Variables)
	}

	if err := tool.Validate(); err != nil {
		t.Errorf("a well-formed configuration was rejected: %v", err)
	}
}

// TestValidateToolConfigsReportsTheFirstInvalidToolByName pins what every loader
// relies on: the same configuration always fails on the same tool, whatever order the
// tools arrived in, and the error names the tool file when the tool has one.
func TestValidateToolConfigsReportsTheFirstInvalidToolByName(t *testing.T) {
	badBlock := []BlockConfig{{Target: "~/.ssh/config", ID: "main", Position: "Top"}}
	tests := []struct {
		name  string
		tools []*ToolConfig
		want  []string
	}{
		{
			name:  "all valid",
			tools: []*ToolConfig{{Name: "b"}, {Name: "a"}},
		},
		{
			name: "first invalid tool by name, naming its file",
			tools: []*ToolConfig{
				{Name: "zeta", ConfigFilePath: "/repo/tools/zeta.tool.ts", Blocks: badBlock},
				{Name: "alpha", ConfigFilePath: "/repo/tools/alpha.tool.ts", Blocks: badBlock},
			},
			want: []string{`invalid tool configuration in "/repo/tools/alpha.tool.ts"`, `tool "alpha"`, `position "Top"`},
		},
		{
			name: "same name, first tool file",
			tools: []*ToolConfig{
				{Name: "ssh", ConfigFilePath: "/repo/b.json", Blocks: badBlock},
				{Name: "ssh", ConfigFilePath: "/repo/a.json", Blocks: badBlock},
			},
			want: []string{`invalid tool configuration in "/repo/a.json"`},
		},
		{
			name: "same name and no file keeps the caller's order",
			tools: []*ToolConfig{
				{Name: "ssh", Blocks: []BlockConfig{{Target: "~/.ssh/config", ID: "main", Position: "First"}}},
				{Name: "ssh", Blocks: badBlock},
			},
			want: []string{`position "First"`},
		},
		{
			name:  "tool without a file",
			tools: []*ToolConfig{{Name: "ssh", Blocks: badBlock}},
			want:  []string{"invalid tool configuration: ", `tool "ssh"`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateToolConfigs(tt.tools)
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

	tools := []*ToolConfig{{Name: "b"}, {Name: "a"}}
	if err := ValidateToolConfigs(tools); err != nil {
		t.Fatalf("ValidateToolConfigs() = %v, want nil", err)
	}
	if tools[0].Name != "b" || tools[1].Name != "a" {
		t.Errorf("ValidateToolConfigs reordered the caller's slice to %q, %q", tools[0].Name, tools[1].Name)
	}
}

// TestMergeCombinesDeclarativeFiles checks that a .platform() block
// contributes its declarations rather than replacing the ones outside it, which is
// how the existing symlink and copy lists already behave.
func TestMergeCombinesDeclarativeFiles(t *testing.T) {
	base := &ToolConfig{
		Name:        "ssh",
		Blocks:      []BlockConfig{{Target: "~/.ssh/config", ID: "base"}},
		Templates:   []TemplateConfig{{Source: "a.tmpl", Target: "~/a"}},
		Directories: []DirectoryConfig{{Path: "~/.ssh", Mode: "0700"}},
	}
	override := &ToolConfig{
		Blocks:      []BlockConfig{{Target: "~/.ssh/config", ID: "base"}, {Target: "~/.ssh/config", ID: "macos"}},
		Templates:   []TemplateConfig{{Source: "b.tmpl", Target: "~/b"}},
		Directories: []DirectoryConfig{{Path: "~/.ssh", Mode: "0700"}, {Path: "~/.gnupg", Mode: "0700"}},
	}

	base.Merge(override, map[string]interface{}{})

	if len(base.Blocks) != 2 {
		t.Errorf("blocks = %+v, want the platform block added once", base.Blocks)
	}
	if len(base.Templates) != 2 {
		t.Errorf("templates = %+v, want both", base.Templates)
	}
	if len(base.Directories) != 2 {
		t.Errorf("directories = %+v, want the duplicate collapsed", base.Directories)
	}
}
