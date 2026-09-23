package vm

import (
	"path/filepath"
	"strings"
	"testing"
)

// Every tool a load returns has passed ToolConfig.Validate. A declaration the engine
// cannot carry out as written fails the load, naming the tool file and the offending
// value, instead of loading and falling back to a default the author did not ask for:
// a misspelled conflict policy would otherwise overwrite a file the author asked to
// keep, and a misspelled position would put a block where nobody asked for it.
func TestLoaderRejectsInvalidToolDeclarations(t *testing.T) {
	tests := []struct {
		name        string
		declaration string
		want        []string
	}{
		{
			name: "every value valid",
			declaration: `.symlink("./config", "~/.config/probe/config", { mode: "0600" })` +
				`.copy("./settings", "~/.config/probe/settings", { mode: "600", conflict: "keep-local" })` +
				`.ensureDir("~/.ssh", { mode: "0o700" })` +
				`.block("~/.ssh/config", { id: "main.hosts_1", content: "Include managed", mode: "0600", position: "top", conflict: "merge" })` +
				`.block("~/.ssh/config", { id: "extra", content: "Host x", position: "bottom", conflict: "prompt" })` +
				`.template("./gitconfig.template", "~/.gitconfig", { mode: "0644", conflict: "overwrite" })` +
				`.zsh((shell) => shell.once("echo once").always("echo always").sourceFile("init.zsh"))`,
		},
		{
			name:        "symlink with an empty source",
			declaration: `.symlink("", "~/.config/probe/config")`,
			want:        []string{"invalid symlink", "source path cannot be empty"},
		},
		{
			name:        "symlink with an empty target",
			declaration: `.symlink("./config", "")`,
			want:        []string{"invalid symlink", "target path cannot be empty"},
		},
		{
			name:        "symlink with an invalid mode",
			declaration: `.symlink("./config", "~/.config/probe/config", { mode: "rw-------" })`,
			want:        []string{"invalid symlink", `mode "rw-------"`},
		},
		{
			name:        "copy with an empty source",
			declaration: `.copy("", "~/.config/probe/settings")`,
			want:        []string{"invalid copy", "source path cannot be empty"},
		},
		{
			name:        "copy with an empty target",
			declaration: `.copy("./settings", "")`,
			want:        []string{"invalid copy", "target path cannot be empty"},
		},
		{
			name:        "copy with an invalid mode",
			declaration: `.copy("./settings", "~/.config/probe/settings", { mode: "0888" })`,
			want:        []string{"invalid copy", `mode "0888"`},
		},
		{
			name:        "copy with an unknown conflict policy",
			declaration: `.copy("./settings", "~/.config/probe/settings", { conflict: "keep-locl" })`,
			want:        []string{"invalid copy", `conflict "keep-locl"`},
		},
		{
			name:        "directory with a blank path",
			declaration: `.ensureDir("  ")`,
			want:        []string{"invalid directory", "directory path cannot be empty"},
		},
		{
			name:        "directory with an out-of-range mode",
			declaration: `.ensureDir("~/.ssh", { mode: "0o7000" })`,
			want:        []string{"invalid directory", `mode "0o7000" is out of range`},
		},
		{
			name:        "block with a blank target",
			declaration: `.block(" ", { id: "main", content: "x" })`,
			want:        []string{"invalid block", "block target cannot be empty"},
		},
		{
			name:        "block with an id the markers cannot carry",
			declaration: `.block("~/.ssh/config", { id: "my block", content: "x" })`,
			want:        []string{"invalid block", `block id "my block"`},
		},
		{
			name:        "block with an invalid mode",
			declaration: `.block("~/.ssh/config", { id: "main", content: "x", mode: "u+rw" })`,
			want:        []string{"invalid block", `mode "u+rw"`},
		},
		{
			name:        "block with an unknown position",
			declaration: `.block("~/.ssh/config", { id: "main", content: "x", position: "Top" })`,
			want:        []string{"invalid block", `position "Top"`},
		},
		{
			name:        "block with an unknown conflict policy",
			declaration: `.block("~/.ssh/config", { id: "main", content: "x", conflict: "keep-locl" })`,
			want:        []string{"invalid block", `conflict "keep-locl"`},
		},
		{
			name: "two blocks with the same target and id",
			declaration: `.block("~/.ssh/config", { id: "main", content: "a" })` +
				`.block("~/.ssh/config", { id: "main", content: "b" })`,
			want: []string{`.block() "main" targeting "~/.ssh/config"`, filepath.Join(".ssh", "config")},
		},
		{
			name: "one block's file spelled two ways",
			declaration: `.block("~/.ssh/config", { id: "main", content: "one" })` +
				`.block("{paths.homeDir}/.ssh/config", { id: "main", content: "two" })`,
			want: []string{
				`.block() "main" targeting "~/.ssh/config"`,
				`.block() "main" targeting "{paths.homeDir}/.ssh/config"`,
			},
		},
		{
			name: "a block in the file a template renders",
			declaration: `.template("./gitconfig.template", "~/.gitconfig")` +
				`.block("~/.gitconfig", { id: "main", content: "x" })`,
			want: []string{`.template() targeting "~/.gitconfig"`, `.block() "main" targeting "~/.gitconfig"`},
		},
		{
			name:        "template with a blank source",
			declaration: `.template("", "~/.gitconfig")`,
			want:        []string{"invalid template", "template source cannot be empty"},
		},
		{
			name:        "template with a blank target",
			declaration: `.template("./gitconfig.template", "")`,
			want:        []string{"invalid template", "template target cannot be empty"},
		},
		{
			name:        "template with an invalid mode",
			declaration: `.template("./gitconfig.template", "~/.gitconfig", { mode: "644 x" })`,
			want:        []string{"invalid template", `mode "644 x"`},
		},
		{
			name:        "template with an unknown conflict policy",
			declaration: `.template("./gitconfig.template", "~/.gitconfig", { conflict: "theirs" })`,
			want:        []string{"invalid template", `conflict "theirs"`},
		},
		{
			name:        "shell script of an unknown kind",
			declaration: `.zsh((shell) => shell.script("every-time", "echo hi"))`,
			want:        []string{"invalid shell config", `got "every-time"`},
		},
		{
			name:        "shell script with an empty value",
			declaration: `.zsh((shell) => shell.once(""))`,
			want:        []string{"invalid shell config", "shell script value cannot be empty"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
				"export default defineTool((install) => install(\"manual\")" + tt.declaration + ");"

			toolConfigs, err := loadToolSource(t, tool)
			if len(tt.want) == 0 {
				if err != nil {
					t.Fatalf("load failed: %v", err)
				}
				if _, ok := toolConfigs["probe"]; !ok {
					t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
				}
				return
			}
			if err == nil {
				t.Fatal("expected loading to fail")
			}
			for _, want := range append([]string{"probe.tool.ts", `tool "probe"`}, tt.want...) {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("expected the error to mention %q, got: %v", want, err)
				}
			}
		})
	}
}

// Two tools whose declarations resolve to the same file fail the load, naming both
// tools and both tool files, before anything is written: whichever was applied last
// would otherwise replace the other's content on every run without a message.
func TestLoaderRejectsFilesClaimedByTwoTools(t *testing.T) {
	tests := []struct {
		name  string
		alpha string
		beta  string
		want  []string
	}{
		{
			name:  "one block",
			alpha: `.block("~/shared.conf", { id: "main", content: "from alpha" })`,
			beta:  `.block("{paths.homeDir}/shared.conf", { id: "main", content: "from beta" })`,
			want:  []string{`.block() "main" targeting "~/shared.conf"`, `.block() "main" targeting "{paths.homeDir}/shared.conf"`},
		},
		{
			name:  "one copied file",
			alpha: `.copy("./alpha.conf", "~/shared-copy.conf")`,
			beta:  `.copy("./beta.conf", "~/shared-copy.conf")`,
			want:  []string{`.copy() targeting "~/shared-copy.conf"`},
		},
		{
			name:  "one rendered file",
			alpha: `.template("./alpha.tmpl", "~/shared-template.conf")`,
			beta:  `.template("./beta.tmpl", "~/shared-template.conf")`,
			want:  []string{`.template() targeting "~/shared-template.conf"`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolFile := func(declaration string) string {
				return "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
					"export default defineTool((install) => install(\"manual\")" + declaration + ");"
			}
			_, err := loadToolFiles(t, map[string]string{
				"alpha.tool.ts": toolFile(tt.alpha),
				"beta.tool.ts":  toolFile(tt.beta),
			})
			if err == nil {
				t.Fatal("expected loading to fail")
			}
			for _, want := range append([]string{`tool "alpha"`, "alpha.tool.ts", `tool "beta"`, "beta.tool.ts"}, tt.want...) {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("expected the error to mention %q, got: %v", want, err)
				}
			}
		})
	}
}

// A tool file named only ".tool.ts" leaves the tool without a name to fall back on.
// Its declarations could never be recorded or found again, so the load fails naming
// the file rather than returning a tool nothing can refer to. The loader records the
// file with forward slashes on every platform.
func TestLoaderRejectsToolWithoutName(t *testing.T) {
	tool := "import { defineTool } from \"@alexgorbatchev/dotfiles\";\n" +
		"export default defineTool((install) => install(\"manual\"));"

	_, err := loadToolFile(t, ".tool.ts", tool)
	if err == nil {
		t.Fatal("expected loading to fail")
	}
	for _, want := range []string{filepath.ToSlash(filepath.Join("tools", ".tool.ts")), "tool name is required"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("expected the error to mention %q, got: %v", want, err)
		}
	}
}
