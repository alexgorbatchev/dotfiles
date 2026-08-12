package shell

import (
	"reflect"
	"strings"
	"testing"
)

func TestPathExtension(t *testing.T) {
	tests := []struct {
		name        string
		ext         PathExtension
		wantContain string
	}{
		{
			name: "prepend without deduplicate",
			ext: PathExtension{
				Path:        "/usr/local/bin",
				Append:      false,
				Deduplicate: false,
			},
			wantContain: `export PATH="/usr/local/bin:$PATH"`,
		},
		{
			name: "append without deduplicate",
			ext: PathExtension{
				Path:        "/opt/bin",
				Append:      true,
				Deduplicate: false,
			},
			wantContain: `export PATH="$PATH:/opt/bin"`,
		},
		{
			name: "prepend with deduplicate",
			ext: PathExtension{
				Path:        "/usr/local/bin",
				Append:      false,
				Deduplicate: true,
			},
			wantContain: "case \":$PATH:\" in\n  *\":/usr/local/bin:\"*) ;;\n  *) export PATH=\"/usr/local/bin:$PATH\" ;;\nesac",
		},
		{
			name: "append with deduplicate",
			ext: PathExtension{
				Path:        "/opt/bin",
				Append:      true,
				Deduplicate: true,
			},
			wantContain: "case \":$PATH:\" in\n  *\":/opt/bin:\"*) ;;\n  *) export PATH=\"$PATH:/opt/bin\" ;;\nesac",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.ext.Generate()
			if got != tt.wantContain {
				t.Errorf("PathExtension.Generate() = %q, want %q", got, tt.wantContain)
			}
		})
	}
}

func TestAliasAndEnvVar(t *testing.T) {
	alias := Alias{Name: "ll", Value: "ls -la"}
	if got := alias.Generate(); got != "alias ll='ls -la'" {
		t.Errorf("Alias.Generate() = %q, want %q", got, "alias ll='ls -la'")
	}

	envVar := EnvVar{Name: "MY_VAR", Value: "some-value"}
	if got := envVar.Generate(); got != `export MY_VAR="some-value"` {
		t.Errorf("EnvVar.Generate() = %q, want %q", got, `export MY_VAR="some-value"`)
	}
}

func TestFromEnvMap(t *testing.T) {
	tests := []struct {
		name string
		input map[string]string
		want  []EnvVar
	}{
		{
			name:  "nil map",
			input: nil,
			want:  nil,
		},
		{
			name:  "empty map",
			input: map[string]string{},
			want:  nil,
		},
		{
			name: "unordered keys sorted alphabetically",
			input: map[string]string{
				"ZEBRA": "stripes",
				"ALPHA": "first",
				"DELTA": "fourth",
				"BETA":  "second",
			},
			want: []EnvVar{
				{Name: "ALPHA", Value: "first"},
				{Name: "BETA", Value: "second"},
				{Name: "DELTA", Value: "fourth"},
				{Name: "ZEBRA", Value: "stripes"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FromEnvMap(tt.input)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("FromEnvMap(%v) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestFromAliasMap(t *testing.T) {
	tests := []struct {
		name string
		input map[string]string
		want  []Alias
	}{
		{
			name:  "nil map",
			input: nil,
			want:  nil,
		},
		{
			name:  "empty map",
			input: map[string]string{},
			want:  nil,
		},
		{
			name: "unordered aliases sorted alphabetically",
			input: map[string]string{
				"z": "tail -f",
				"a": "ls -la",
				"g": "git status",
				"c": "clear",
			},
			want: []Alias{
				{Name: "a", Value: "ls -la"},
				{Name: "c", Value: "clear"},
				{Name: "g", Value: "git status"},
				{Name: "z", Value: "tail -f"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FromAliasMap(tt.input)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("FromAliasMap(%v) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestDirectivesFromMapsAndScriptGeneration(t *testing.T) {
	envMap := map[string]string{
		"EDITOR": "vim",
		"PATH_EXTRA": "/usr/local/bin",
	}
	aliasMap := map[string]string{
		"ll": "ls -la",
		"ga": "git add",
	}

	envDirectives := FromEnvMapDirectives(envMap)
	aliasDirectives := FromAliasMapDirectives(aliasMap)

	var directives []Directive
	directives = append(directives, envDirectives...)
	directives = append(directives, aliasDirectives...)

	script := GenerateScript(directives)
	expectedScript := `export EDITOR="vim"
export PATH_EXTRA="/usr/local/bin"
alias ga='git add'
alias ll='ls -la'
`
	if script != expectedScript {
		t.Errorf("GenerateScript() =\n%q\nwant:\n%q", script, expectedScript)
	}
}

func TestGenerateScript(t *testing.T) {
	directives := []Directive{
		PathExtension{Path: "/usr/local/bin", Append: false, Deduplicate: false},
		Alias{Name: "g", Value: "git"},
		EnvVar{Name: "HELLO", Value: "world"},
	}

	got := GenerateScript(directives)
	expectedLines := []string{
		`export PATH="/usr/local/bin:$PATH"`,
		`alias g='git'`,
		`export HELLO="world"`,
	}

	for _, line := range expectedLines {
		if !strings.Contains(got, line) {
			t.Errorf("GenerateScript() does not contain %q\nGot:\n%s", line, got)
		}
	}
}
