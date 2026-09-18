package embedded_test

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/typecheck"
)

// Every ```typescript / ```ts fence in the embedded skill is compiled against the
// embedded declarations, with the tsconfig the CLI writes for a project. The fence's
// info string says how a snippet is completed into a compilable file:
//
//	```typescript                 a complete module; the package's runtime exports are
//	                              imported for it unless it imports them itself
//	```typescript builder         a chain continuing an install() builder, wrapped in
//	                              defineTool((install, ctx) => install("manual")...)
//	```typescript shell           a chain continuing a shell configurator, wrapped in
//	                              install("manual").zsh((shell) => shell...)
//	```typescript body            statements inside a defineTool callback, with
//	                              install and ctx in scope
//	```typescript config          members of the object returned from defineConfig
//	```typescript no-typecheck    deliberately not compiled; for examples whose point
//	                              is the error they contain
//
// A snippet that is none of these must be completed by the author, never skipped
// silently: an unknown form fails the test.

const packageName = typecheck.PackageName

// prelude imports every runtime export so an example may use them without repeating
// the import line the surrounding page has already shown.
const prelude = `import { Architecture, Libc, Platform, dedentString, dedentTemplate, defineConfig, defineTool } from "` + packageName + `";
`

type snippetForm string

const (
	formModule      snippetForm = ""
	formBuilder     snippetForm = "builder"
	formShell       snippetForm = "shell"
	formBody        snippetForm = "body"
	formConfig      snippetForm = "config"
	formNoTypecheck snippetForm = "no-typecheck"
)

type snippet struct {
	doc  string
	line int
	form snippetForm
	code string
}

var fenceOpen = regexp.MustCompile("^```+(typescript|ts)(?:\\s+(\\S+))?\\s*$")

// extractSnippets returns the TypeScript fences of one markdown document, with the
// 1-based line of the opening fence.
func extractSnippets(doc string, content string) ([]snippet, error) {
	var snippets []snippet
	lines := strings.Split(content, "\n")
	for i := 0; i < len(lines); i++ {
		m := fenceOpen.FindStringSubmatch(lines[i])
		if m == nil {
			continue
		}
		form := snippetForm(m[2])
		switch form {
		case formModule, formBuilder, formShell, formBody, formConfig, formNoTypecheck:
		default:
			return nil, fmt.Errorf("%s:%d: unknown snippet form %q", doc, i+1, m[2])
		}
		start := i
		var body []string
		for i++; i < len(lines) && !strings.HasPrefix(lines[i], "```"); i++ {
			body = append(body, lines[i])
		}
		if i >= len(lines) {
			return nil, fmt.Errorf("%s:%d: unterminated code fence", doc, start+1)
		}
		snippets = append(snippets, snippet{doc: doc, line: start + 1, form: form, code: strings.Join(body, "\n")})
	}
	return snippets, nil
}

// complete turns a snippet into a module and reports how many lines precede the
// snippet's own first line, so diagnostics can be mapped back to the document.
func (s snippet) complete() (string, int) {
	switch s.form {
	case formBuilder:
		head := prelude + "export default defineTool((install, ctx) =>\n  install(\"manual\")\n"
		return head + s.code + "\n);\n", strings.Count(head, "\n")
	case formShell:
		head := prelude + "export default defineTool((install, ctx) =>\n  install(\"manual\").zsh((shell) =>\n    shell\n"
		return head + s.code + "\n  ),\n);\n", strings.Count(head, "\n")
	case formBody:
		head := prelude + "export default defineTool((install, ctx) => {\n"
		return head + s.code + "\n  return install();\n});\n", strings.Count(head, "\n")
	case formConfig:
		head := prelude + "export default defineConfig(() => ({\n"
		return head + s.code + "\n}));\n", strings.Count(head, "\n")
	default:
		if strings.Contains(s.code, `from "`+packageName+`"`) || strings.Contains(s.code, `from '`+packageName+`'`) {
			return s.code + "\n", 0
		}
		return prelude + s.code + "\n", strings.Count(prelude, "\n")
	}
}

// fileName gives every snippet a stable, unique file name that still points back at
// its document.
func (s snippet) fileName() string {
	doc := strings.TrimSuffix(strings.ReplaceAll(s.doc, "/", "__"), ".md")
	return fmt.Sprintf("%s--L%d.ts", doc, s.line)
}

func TestSkillSnippetsTypeCheck(t *testing.T) {
	repoRoot, err := testutil.RepoRoot()
	if err != nil {
		t.Fatalf("locating repository root: %v", err)
	}
	compiler, err := testutil.FindTypeScriptCompiler(repoRoot)
	if err != nil {
		t.Fatalf("the skill snippets are type-checked with the repository's TypeScript compiler: %v", err)
	}

	programDir := t.TempDir()
	declarationsDir := filepath.Join(programDir, "node_modules", packageName)
	if err := os.MkdirAll(declarationsDir, 0755); err != nil {
		t.Fatalf("creating %s: %v", declarationsDir, err)
	}
	if err := copyEmbedded(embedded.TypesFS, "dist", declarationsDir); err != nil {
		t.Fatalf("copying embedded declarations: %v", err)
	}

	var snippets []snippet
	skipped := 0
	byFile := make(map[string]snippet)
	err = fs.WalkDir(embedded.SkillFS, "skill", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}
		content, err := fs.ReadFile(embedded.SkillFS, path)
		if err != nil {
			return err
		}
		docSnippets, err := extractSnippets(strings.TrimPrefix(path, "skill/"), string(content))
		if err != nil {
			return err
		}
		for _, s := range docSnippets {
			if s.form == formNoTypecheck {
				skipped++
				continue
			}
			snippets = append(snippets, s)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("collecting snippets: %v", err)
	}
	if len(snippets) == 0 {
		t.Fatal("no TypeScript snippets found in the embedded skill")
	}

	offsets := make(map[string]int, len(snippets))
	for _, s := range snippets {
		code, offset := s.complete()
		name := s.fileName()
		if err := os.WriteFile(filepath.Join(programDir, name), []byte(code), 0644); err != nil {
			t.Fatalf("writing %s: %v", name, err)
		}
		byFile[name] = s
		offsets[name] = offset
	}

	program := typecheck.Program{
		Dir:             programDir,
		ToolConfigsDirs: []string{programDir},
		DeclarationsDir: declarationsDir,
	}
	tsconfig, err := program.TSConfig()
	if err != nil {
		t.Fatalf("rendering tsconfig: %v", err)
	}
	tsconfigPath := filepath.Join(programDir, typecheck.TSConfigFileName)
	if err := os.WriteFile(tsconfigPath, tsconfig, 0644); err != nil {
		t.Fatalf("writing tsconfig: %v", err)
	}

	diagnostics, err := typecheck.Run(context.Background(), exec.NewOSRunner(), compiler, tsconfigPath, programDir)
	if err != nil {
		t.Fatalf("running the compiler: %v", err)
	}

	t.Logf("type-checked %d snippets from the embedded skill (%d marked no-typecheck)", len(snippets), skipped)

	var failures []string
	for _, d := range diagnostics {
		name := filepath.Base(d.File)
		s, ok := byFile[name]
		if !ok {
			failures = append(failures, d.String())
			continue
		}
		// The snippet's first line is the fence line plus one; the completed file adds
		// offset lines before it.
		docLine := s.line + d.Line - offsets[name]
		failures = append(failures, fmt.Sprintf("%s:%d: %s: %s", s.doc, docLine, d.Code, d.Message))
	}
	sort.Strings(failures)
	if len(failures) > 0 {
		t.Errorf("%d documentation snippet(s) do not compile against the embedded declarations:\n%s",
			len(failures), strings.Join(failures, "\n"))
	}
}

// copyEmbedded writes every file directly under dir in fsys into dst.
func copyEmbedded(fsys fs.FS, dir, dst string) error {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		data, err := fs.ReadFile(fsys, filepath.ToSlash(filepath.Join(dir, entry.Name())))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dst, entry.Name()), data, 0644); err != nil {
			return err
		}
	}
	return nil
}

func TestExtractSnippets(t *testing.T) {
	doc := strings.Join([]string{
		"# Title",
		"```typescript",
		"const a = 1;",
		"```",
		"text",
		"```ts builder",
		".bin(\"x\")",
		"```",
		"```typescript no-typecheck",
		"broken(",
		"```",
		"```bash",
		"echo not typescript",
		"```",
	}, "\n")

	snippets, err := extractSnippets("doc.md", doc)
	if err != nil {
		t.Fatalf("extractSnippets: %v", err)
	}
	if len(snippets) != 3 {
		t.Fatalf("got %d snippets, want 3", len(snippets))
	}
	want := []struct {
		line int
		form snippetForm
		code string
	}{
		{2, formModule, "const a = 1;"},
		{6, formBuilder, ".bin(\"x\")"},
		{9, formNoTypecheck, "broken("},
	}
	for i, w := range want {
		got := snippets[i]
		if got.line != w.line || got.form != w.form || got.code != w.code {
			t.Errorf("snippet %d = %+v, want line %d form %q code %q", i, got, w.line, w.form, w.code)
		}
	}

	if _, err := extractSnippets("doc.md", "```typescript fragment\nx\n```\n"); err == nil {
		t.Error("expected an unknown snippet form to be rejected")
	}
	if _, err := extractSnippets("doc.md", "```typescript\nx\n"); err == nil {
		t.Error("expected an unterminated fence to be rejected")
	}
}

func TestSnippetCompleteOffsets(t *testing.T) {
	tests := []struct {
		form snippetForm
		code string
	}{
		{formModule, "defineTool((install) => install());"},
		{formModule, "import { defineTool } from \"" + packageName + "\";\nexport default defineTool((install) => install());"},
		{formBuilder, ".bin(\"tool\")"},
		{formShell, ".env({ A: \"b\" })"},
		{formBody, "install(\"manual\");"},
		{formConfig, "paths: {},"},
	}
	for _, tt := range tests {
		s := snippet{form: tt.form, code: tt.code}
		completed, offset := s.complete()
		lines := strings.Split(completed, "\n")
		if offset >= len(lines) || lines[offset] != strings.Split(tt.code, "\n")[0] {
			t.Errorf("form %q: offset %d does not point at the snippet's first line in:\n%s", tt.form, offset, completed)
		}
	}
}
