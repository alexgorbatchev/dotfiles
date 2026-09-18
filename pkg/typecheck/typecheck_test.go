package typecheck

import (
	"encoding/json"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestProgramTSConfigUsesPathsRelativeToItsDirectory(t *testing.T) {
	root := filepath.Join(string(filepath.Separator), "home", "me", "dotfiles")
	generated := filepath.Join(root, ".generated")
	program := Program{
		Dir:             generated,
		ConfigFile:      filepath.Join(root, "dotfiles.config.ts"),
		ToolConfigsDirs: []string{filepath.Join(root, "tools"), filepath.Join(root, "extra-tools")},
		DeclarationsDir: filepath.Join(generated, "node_modules", "@alexgorbatchev", "dotfiles"),
		RegistryFile:    filepath.Join(generated, "tool-types.d.ts"),
	}

	out, err := program.TSConfig()
	if err != nil {
		t.Fatalf("TSConfig: %v", err)
	}

	var parsed struct {
		CompilerOptions struct {
			Types            []string            `json:"types"`
			Paths            map[string][]string `json:"paths"`
			Strict           bool                `json:"strict"`
			NoEmit           bool                `json:"noEmit"`
			ModuleResolution string              `json:"moduleResolution"`
		} `json:"compilerOptions"`
		Include []string `json:"include"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("tsconfig is not valid JSON: %v\n%s", err, out)
	}

	wantInclude := []string{
		"./node_modules/@alexgorbatchev/dotfiles/index.d.ts",
		"./node_modules/@alexgorbatchev/dotfiles/globals.d.ts",
		"../dotfiles.config.ts",
		"../tools/**/*.ts",
		"../extra-tools/**/*.ts",
		"./tool-types.d.ts",
	}
	if !slices.Equal(parsed.Include, wantInclude) {
		t.Errorf("include = %v, want %v", parsed.Include, wantInclude)
	}
	if got := parsed.CompilerOptions.Paths[PackageName]; !slices.Equal(got, []string{"./node_modules/@alexgorbatchev/dotfiles/index.d.ts"}) {
		t.Errorf("paths[%s] = %v", PackageName, got)
	}
	if parsed.CompilerOptions.Types == nil || len(parsed.CompilerOptions.Types) != 0 {
		t.Errorf("types = %v, want an explicit empty list so no @types are picked up", parsed.CompilerOptions.Types)
	}
	if !parsed.CompilerOptions.Strict || !parsed.CompilerOptions.NoEmit || parsed.CompilerOptions.ModuleResolution != "bundler" {
		t.Errorf("compiler options do not match the declarations' target: %+v", parsed.CompilerOptions)
	}
	if !strings.HasSuffix(string(out), "}\n") {
		t.Error("tsconfig should end with a newline")
	}
}

func TestProgramTSConfigOmitsAbsentFiles(t *testing.T) {
	program := Program{
		Dir:             filepath.Join(string(filepath.Separator), "p", ".generated"),
		ToolConfigsDirs: []string{filepath.Join(string(filepath.Separator), "p", "tools")},
		DeclarationsDir: filepath.Join(string(filepath.Separator), "p", ".generated", "node_modules", "@alexgorbatchev", "dotfiles"),
	}
	out, err := program.TSConfig()
	if err != nil {
		t.Fatalf("TSConfig: %v", err)
	}
	if strings.Contains(string(out), "dotfiles.config.ts") || strings.Contains(string(out), "tool-types.d.ts") {
		t.Errorf("a JSON-configured project without a registry must not include either file:\n%s", out)
	}
}

func TestProgramTSConfigRequiresDirectories(t *testing.T) {
	if _, err := (Program{DeclarationsDir: "/d"}).TSConfig(); err == nil {
		t.Error("expected an error without a program directory")
	}
	if _, err := (Program{Dir: "/d"}).TSConfig(); err == nil {
		t.Error("expected an error without a declarations directory")
	}
}

func TestParseDiagnostics(t *testing.T) {
	output := strings.Join([]string{
		"tools/atuin.tool.ts(12,37): error TS2339: Property '$' does not exist on type 'IToolConfigContext'.",
		"tools/eza.tool.ts(4,5): error TS2353: Object literal may only specify known properties, and 'binarySource' does not exist in type 'ICargoInstallParams'.",
		"  Types of property 'x' are incompatible.",
		"    Type 'string' is not assignable to type 'never'.",
		"",
		"Found 2 errors in 2 files.",
	}, "\n")

	got := ParseDiagnostics(output)
	if len(got) != 2 {
		t.Fatalf("got %d diagnostics, want 2: %+v", len(got), got)
	}
	first := got[0]
	if first.File != "tools/atuin.tool.ts" || first.Line != 12 || first.Column != 37 || first.Code != "TS2339" {
		t.Errorf("first diagnostic = %+v", first)
	}
	if first.Message != "Property '$' does not exist on type 'IToolConfigContext'." {
		t.Errorf("first message = %q", first.Message)
	}
	second := got[1]
	if !strings.Contains(second.Message, "does not exist in type 'ICargoInstallParams'.\n  Types of property 'x' are incompatible.\n    Type 'string' is not assignable to type 'never'.") {
		t.Errorf("continuation lines were not folded into the message: %q", second.Message)
	}
	if want := "tools/atuin.tool.ts(12,37): error TS2339: Property '$' does not exist on type 'IToolConfigContext'."; first.String() != want {
		t.Errorf("String() = %q, want %q", first.String(), want)
	}
}

func TestParseDiagnosticsIgnoresUnrelatedOutput(t *testing.T) {
	if got := ParseDiagnostics("Version 7.0.2\n"); len(got) != 0 {
		t.Errorf("expected no diagnostics, got %+v", got)
	}
}
