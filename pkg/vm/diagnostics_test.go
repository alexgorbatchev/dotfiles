package vm

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestFormatSourceFrame(t *testing.T) {
	source := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("manual")
    .zsh((shell: any) => {
      shell.block("~/.bashrc", { id: "test" });
    })
);`

	// Line 6, column 13 points to "block" in "shell.block"
	frame := FormatSourceFrame(source, 6, 13, len("block"))
	if frame == "" {
		t.Fatal("expected non-empty source frame")
	}

	lines := strings.Split(frame, "\n")
	if len(lines) < 3 {
		t.Fatalf("expected at least 3 lines in source frame, got %d:\n%s", len(lines), frame)
	}

	// Line 6 must have the pointer marker '>'
	var markerLine, pointerLine string
	for _, l := range lines {
		if strings.Contains(l, ">") && strings.Contains(l, "shell.block") {
			markerLine = l
		}
		if strings.Contains(l, "^^^^^") {
			pointerLine = l
		}
	}

	if markerLine == "" {
		t.Errorf("expected marker line with '>' and 'shell.block', got:\n%s", frame)
	}
	if pointerLine == "" {
		t.Errorf("expected pointer line with '^^^^^' under 'block', got:\n%s", frame)
	}
}

func TestDiagnosticHint(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		file string
		want string
	}{
		{
			name: "block called on unsupported object",
			msg:  "TypeError: Object has no member 'block'",
			file: "tools/mytool.tool.ts",
			want: ".block()",
		},
		{
			name: "template called on unsupported object",
			msg:  "TypeError: Object has no member 'template'",
			file: "tools/mytool.tool.ts",
			want: ".template()",
		},
		{
			name: "binaries typo for bin",
			msg:  "TypeError: Object has no member 'binaries'",
			file: "tools/mytool.tool.ts",
			want: ".bin()",
		},
		{
			name: "symlinks typo for symlink",
			msg:  "TypeError: Object has no member 'symlinks'",
			file: "tools/mytool.tool.ts",
			want: ".symlink()",
		},
		{
			name: "alias called on install builder",
			msg:  "TypeError: Object has no member 'alias'",
			file: "tools/mytool.tool.ts",
			want: "shell configurator",
		},
		{
			name: "install is not a function",
			msg:  "TypeError: install is not a function",
			file: "tools/mytool.tool.ts",
			want: "install(\"<method>\", { ... })",
		},
		{
			name: "cannot read property of undefined",
			msg:  "TypeError: Cannot read property 'foo' of undefined",
			file: "tools/mytool.tool.ts",
			want: "undefined",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hint := DiagnosticHint(tt.msg, "", tt.file)
			if !strings.Contains(hint, tt.want) {
				t.Errorf("DiagnosticHint(%q) = %q, want containing %q", tt.msg, hint, tt.want)
			}
		})
	}
}

func TestLoadTypeScriptConfigReportsFriendlyErrorWithSourcePointer(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatal(err)
	}

	toolPath := filepath.Join(toolsDir, "codex.tool.ts")
	toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install, ctx) =>
  install("manual")
    .zsh((shell: any) => {
      shell.block("~/.bashrc", { id: "test" });
    })
);`
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := fmt.Sprintf(`export default { paths: { dotfilesDir: %q, toolConfigsDir: %q } };`, filepath.ToSlash(tmpDir), filepath.ToSlash(toolsDir))
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatal(err)
	}

	_, _, _, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	t.Logf("Formatted Error Output:\n%s\n", errStr)

	// 1. Must name the tool file
	if !strings.Contains(errStr, filepath.ToSlash(toolPath)) {
		t.Errorf("expected error to name tool file %q, got:\n%s", filepath.ToSlash(toolPath), errStr)
	}

	// 2. Must name the method .block()
	if !strings.Contains(errStr, ".block()") {
		t.Errorf("expected error to name method '.block()', got:\n%s", errStr)
	}

	// 3. Must have line:col pointer to line 6 in codex.tool.ts
	if !strings.Contains(errStr, "codex.tool.ts:6:") {
		t.Errorf("expected error to contain 'codex.tool.ts:6:', got:\n%s", errStr)
	}

	// 4. Must include source code frame with '>' marker and '^' pointer
	if !strings.Contains(errStr, ">") || !strings.Contains(errStr, "^") {
		t.Errorf("expected error to contain source code frame with '>' and '^', got:\n%s", errStr)
	}

	// 5. Must include friendly Hint explaining .block()
	if !strings.Contains(errStr, "Hint:") || !strings.Contains(errStr, "install(...)") {
		t.Errorf("expected error to contain friendly Hint explaining .block() on install(...), got:\n%s", errStr)
	}

	// 6. Must NOT contain internal <eval>:... junk
	if strings.Contains(errStr, "<eval>") {
		t.Errorf("expected error NOT to contain internal '<eval>', got:\n%s", errStr)
	}
}

func TestLoadTypeScriptConfigReportsFriendlyErrorForTypoWithPointer(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatal(err)
	}

	toolPath := filepath.Join(toolsDir, "probe.tool.ts")
	toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool((install) =>
  install("manual", { binaryPath: "/usr/bin/true" })
    .binaries(["probe"])
);`
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := fmt.Sprintf(`export default { paths: { dotfilesDir: %q, toolConfigsDir: %q } };`, filepath.ToSlash(tmpDir), filepath.ToSlash(toolsDir))
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatal(err)
	}

	_, _, _, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()

	// 1. Must name the tool file
	if !strings.Contains(errStr, filepath.ToSlash(toolPath)) {
		t.Errorf("expected error to name tool file %q, got:\n%s", filepath.ToSlash(toolPath), errStr)
	}

	// 2. Must name .binaries()
	if !strings.Contains(errStr, ".binaries()") {
		t.Errorf("expected error to name method '.binaries()', got:\n%s", errStr)
	}

	// 3. Must have source code frame with pointer
	if !strings.Contains(errStr, ">") || !strings.Contains(errStr, "^") {
		t.Errorf("expected error to contain source code frame with '>' and '^', got:\n%s", errStr)
	}

	// 4. Must suggest .bin()
	if !strings.Contains(errStr, ".bin()") {
		t.Errorf("expected error to suggest '.bin()', got:\n%s", errStr)
	}

	// 5. Must NOT contain internal <eval>
	if strings.Contains(errStr, "<eval>") {
		t.Errorf("expected error NOT to contain internal '<eval>', got:\n%s", errStr)
	}
}

func TestLoadTypeScriptConfigFileErrorWithPointer(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := `import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig((ctx: any) => {
  ctx.nonexistentMethod();
  return {
    paths: {
      dotfilesDir: "~/.dotfiles",
    },
  };
});`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatal(err)
	}

	_, _, _, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()

	// 1. Must name dotfiles.config.ts
	if !strings.Contains(errStr, "dotfiles.config.ts") {
		t.Errorf("expected error to name 'dotfiles.config.ts', got:\n%s", errStr)
	}

	// 2. Must contain line pointer
	if !strings.Contains(errStr, "dotfiles.config.ts:4:") {
		t.Errorf("expected error to contain 'dotfiles.config.ts:4:', got:\n%s", errStr)
	}

	// 3. Must have source frame
	if !strings.Contains(errStr, ">") || !strings.Contains(errStr, "^") {
		t.Errorf("expected error to contain source frame with '>' and '^', got:\n%s", errStr)
	}

	// 4. Must NOT contain internal <eval>
	if strings.Contains(errStr, "<eval>") {
		t.Errorf("expected error NOT to contain internal '<eval>', got:\n%s", errStr)
	}
}

func TestLoadTypeScriptConfigReportsAsyncToolFactoryErrorWithPointer(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	memFS := fs.NewMemFS()
	tmpDir := t.TempDir()
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatal(err)
	}

	toolPath := filepath.Join(toolsDir, "async.tool.ts")
	toolContent := `import { defineTool } from "@alexgorbatchev/dotfiles";

export default defineTool(async (install, ctx) => {
  const obj: any = {};
  obj.block("test");
  return install("manual");
});`
	if err := os.WriteFile(toolPath, []byte(toolContent), 0644); err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	configContent := fmt.Sprintf(`export default { paths: { dotfilesDir: %q, toolConfigsDir: %q } };`, filepath.ToSlash(tmpDir), filepath.ToSlash(toolsDir))
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatal(err)
	}

	_, _, _, err := LoadTypeScriptConfig(log, memFS, configPath)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "async.tool.ts") {
		t.Errorf("expected error to name async.tool.ts, got:\n%s", errStr)
	}
	if !strings.Contains(errStr, ">") || !strings.Contains(errStr, "^") {
		t.Errorf("expected error to contain code frame, got:\n%s", errStr)
	}
	if strings.Contains(errStr, "<eval>") {
		t.Errorf("expected error NOT to contain internal '<eval>', got:\n%s", errStr)
	}
}

func TestDiagnosticsEdgeCases(t *testing.T) {
	// SourceLocation.String
	if got := (SourceLocation{}).String(); got != "" {
		t.Errorf("empty SourceLocation.String() = %q, want empty", got)
	}
	if got := (SourceLocation{File: "a.ts"}).String(); got != "a.ts" {
		t.Errorf("SourceLocation without line = %q, want 'a.ts'", got)
	}
	if got := (SourceLocation{File: "a.ts", Line: 5}).String(); got != "a.ts:5" {
		t.Errorf("SourceLocation without col = %q, want 'a.ts:5'", got)
	}
	if got := (SourceLocation{File: "a.ts", Line: 5, Column: 10}).String(); got != "a.ts:5:10" {
		t.Errorf("SourceLocation with col = %q, want 'a.ts:5:10'", got)
	}

	// DiagnosticError.Unwrap
	origErr := errors.New("underlying")
	diagErr := &DiagnosticError{OriginalErr: origErr}
	if !errors.Is(diagErr, origErr) {
		t.Errorf("DiagnosticError should unwrap to origErr")
	}

	// DiagnosticError.Error default header
	defaultErr := &DiagnosticError{Message: "something failed"}
	if defaultErr.Error() != "something failed" {
		t.Errorf("DiagnosticError default = %q, want 'something failed'", defaultErr.Error())
	}

	// FormatSourceFrame edge cases
	if got := FormatSourceFrame("", 1, 1, 1); got != "" {
		t.Errorf("FormatSourceFrame empty content = %q, want empty", got)
	}
	if got := FormatSourceFrame("line1", 0, 1, 1); got != "" {
		t.Errorf("FormatSourceFrame line 0 = %q, want empty", got)
	}
	if got := FormatSourceFrame("line1", 10, 1, 1); got != "" {
		t.Errorf("FormatSourceFrame out of bounds line = %q, want empty", got)
	}

	// FormatSourceFrame with tabs in raw line
	tabbedSource := "\t\tshell.block()"
	tabbedFrame := FormatSourceFrame(tabbedSource, 1, 3, 5)
	if !strings.Contains(tabbedFrame, "\t\t") {
		t.Errorf("expected tabbedFrame to preserve tabs in pointer indent:\n%s", tabbedFrame)
	}

	// DiagnosticHint edge cases
	hint1 := DiagnosticHint("TypeError: Object has no member 'blck'", "blck", "tool.ts")
	if !strings.Contains(hint1, ".block()") {
		t.Errorf("expected typo hint for 'blck' to suggest .block(), got %q", hint1)
	}

	hint2 := DiagnosticHint("TypeError: ctx.paths is not a function", "", "tool.ts")
	if !strings.Contains(hint2, "ctx.paths.homeDir") {
		t.Errorf("expected paths hint, got %q", hint2)
	}

	hint3 := DiagnosticHint("TypeError: ctx.systemInfo is not a function", "", "tool.ts")
	if !strings.Contains(hint3, "ctx.systemInfo.os") {
		t.Errorf("expected systemInfo hint, got %q", hint3)
	}

	hint4 := DiagnosticHint("TypeError: foo is not a function", "", "tool.ts")
	if !strings.Contains(hint4, "\"foo\" is not a function") {
		t.Errorf("expected generic not a function hint, got %q", hint4)
	}

	hint5 := DiagnosticHint("TypeError: Value is not an object: undefined", "", "tool.ts")
	if !strings.Contains(hint5, "Expected an object") {
		t.Errorf("expected value not object hint, got %q", hint5)
	}

	hint6 := DiagnosticHint("TypeError: Object has no member 'systemInfo'", "systemInfo", "tool.ts")
	if !strings.Contains(hint6, "ctx.systemInfo") {
		t.Errorf("expected context property hint, got %q", hint6)
	}

	// FormatVMFailure nil err
	if got := FormatVMFailure(nil, "", nil, nil, "", "", nil); got != nil {
		t.Errorf("FormatVMFailure(nil) should return nil, got %v", got)
	}

	// FormatVMFailure with no sourcemap
	plainErr := errors.New("plain failure")
	fDiag := FormatVMFailure(nil, "", nil, nil, "/dir", "/dir/tools/foo.tool.ts", plainErr)
	if fDiag == nil || !strings.Contains(fDiag.Error(), "foo.tool.ts") {
		t.Errorf("FormatVMFailure without sourcemap = %v", fDiag)
	}
}
