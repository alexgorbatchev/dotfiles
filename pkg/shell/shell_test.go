package shell

import (
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
