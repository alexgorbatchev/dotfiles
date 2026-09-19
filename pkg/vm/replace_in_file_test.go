package vm

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// runReplaceHook drives replaceInFile the way a tool author reaches it: from inside a
// lifecycle hook, through the real VM plumbing.
func runReplaceHook(t *testing.T, memFS fs.FS, logWriter *bytes.Buffer, hookBody string) error {
	t.Helper()
	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("manual").hook("after-install", async (ctx) => { `+hookBody+` }),
		);
	`, HookAfterInstall)

	var writer *bytes.Buffer = logWriter
	if writer == nil {
		writer = &bytes.Buffer{}
	}
	return RunHook(
		t.Context(),
		logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: writer}),
		memFS,
		exec.NewMockRunner(),
		tool,
		hookTestProjectConfig(t),
		HookAfterInstall,
		HookContext{InstalledDir: "/opt/sample"},
		Target{},
	)
}

func seedFile(t *testing.T, memFS fs.FS, path, contents string) {
	t.Helper()
	if err := memFS.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("creating directory: %v", err)
	}
	if err := memFS.WriteFile(path, []byte(contents), 0644); err != nil {
		t.Fatalf("seeding file: %v", err)
	}
}

func readFile(t *testing.T, memFS fs.FS, path string) string {
	t.Helper()
	data, err := memFS.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return string(data)
}

func TestReplaceInFile_RegExpReplacesEveryMatch(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/config.toml", "theme = \"light\"\naccent = \"light\"\n")

	// No "g" flag: replaceInFile replaces every match regardless, as documented.
	err := runReplaceHook(t, memFS, nil, `await ctx.replaceInFile("/opt/sample/config.toml", /"light"/, '"dark"');`)
	if err != nil {
		t.Fatalf("hook failed: %v", err)
	}

	got := readFile(t, memFS, "/opt/sample/config.toml")
	if got != "theme = \"dark\"\naccent = \"dark\"\n" {
		t.Errorf("contents = %q", got)
	}
}

// A plain string is a literal, so regex metacharacters in it match themselves.
func TestReplaceInFile_StringPatternIsLiteral(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/app.conf", "value = a.b\nvalue = axb\n")

	err := runReplaceHook(t, memFS, nil, `await ctx.replaceInFile("/opt/sample/app.conf", "a.b", "REPLACED");`)
	if err != nil {
		t.Fatalf("hook failed: %v", err)
	}

	got := readFile(t, memFS, "/opt/sample/app.conf")
	if got != "value = REPLACED\nvalue = axb\n" {
		t.Errorf("contents = %q, want only the literal a.b replaced", got)
	}
}

func TestReplaceInFile_CallbackReceivesCaptures(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/version.txt", "version=1\nversion=7\n")

	err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/version.txt", /version=(\d+)/, (m) => "version=" + (Number(m.captures[0]) + 1));
	`)
	if err != nil {
		t.Fatalf("hook failed: %v", err)
	}

	got := readFile(t, memFS, "/opt/sample/version.txt")
	if got != "version=2\nversion=8\n" {
		t.Errorf("contents = %q", got)
	}
}

func TestReplaceInFile_ReturnsWhetherAnythingChanged(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/notes.txt", "nothing to see")

	err := runReplaceHook(t, memFS, nil, `
		const changed = await ctx.replaceInFile("/opt/sample/notes.txt", /absent/, "x");
		if (changed !== false) { throw new Error("expected false for a pattern that matches nothing, got " + changed); }
		const changedAgain = await ctx.replaceInFile("/opt/sample/notes.txt", /nothing/, "something");
		if (changedAgain !== true) { throw new Error("expected true once a replacement happened"); }
	`)
	if err != nil {
		t.Fatalf("hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/opt/sample/notes.txt"); got != "something to see" {
		t.Errorf("contents = %q", got)
	}
}

// Anchors only mean "per line" when the pattern is applied line by line.
func TestReplaceInFile_LineModeAppliesPerLine(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/list.txt", "alpha\nbeta\ngamma\n")

	err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/list.txt", /^/, "- ", { mode: "line" });
	`)
	if err != nil {
		t.Fatalf("hook failed: %v", err)
	}

	got := readFile(t, memFS, "/opt/sample/list.txt")
	if got != "- alpha\n- beta\n- gamma\n- " {
		t.Errorf("contents = %q", got)
	}
}

func TestReplaceInFile_ErrorMessageReportedWhenNothingMatches(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/config.toml", "theme = \"dark\"\n")
	var logBuf bytes.Buffer

	err := runReplaceHook(t, memFS, &logBuf, `
		await ctx.replaceInFile("/opt/sample/config.toml", /font = ".*"/, 'font = "mono"', {
			errorMessage: "expected a font setting",
		});
	`)
	if err != nil {
		t.Fatalf("hook failed: %v", err)
	}
	if !strings.Contains(logBuf.String(), "expected a font setting") {
		t.Errorf("log did not report the missing pattern:\n%s", logBuf.String())
	}
}

// Rewriting a file with identical contents would disturb its timestamp for nothing.
func TestReplaceInFile_NoWriteWhenResultIsUnchanged(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/same.txt", "keep")

	before, err := memFS.Stat("/opt/sample/same.txt")
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	hookErr := runReplaceHook(t, memFS, nil, `
		const changed = await ctx.replaceInFile("/opt/sample/same.txt", /keep/, "keep");
		if (changed !== false) { throw new Error("replacing text with itself should report no change"); }
	`)
	if hookErr != nil {
		t.Fatalf("hook failed: %v", hookErr)
	}

	after, err := memFS.Stat("/opt/sample/same.txt")
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if !after.ModTime().Equal(before.ModTime()) {
		t.Errorf("file was rewritten despite identical contents")
	}
}

// An async callback that never actually suspends has its value ready by the time it
// returns, so it works like any other callback.
func TestReplaceInFile_AsyncCallbackThatResolvesImmediatelyWorks(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/async.txt", "value")

	if err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/async.txt", /value/, async () => "later");
	`); err != nil {
		t.Fatalf("hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/opt/sample/async.txt"); got != "later" {
		t.Errorf("contents = %q", got)
	}
}

// One that genuinely suspends cannot be waited on from inside the replacement, because
// its continuation cannot run while the call is still on the stack. That must be
// reported rather than writing a placeholder into the file.
func TestReplaceInFile_PendingAsyncCallbackIsReported(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/async.txt", "value")

	err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/async.txt", /value/, async () => {
			await new Promise(function () {});
			return "never";
		});
	`)
	if err == nil {
		t.Fatalf("expected an error for a suspending replacement callback")
	}
	if !strings.Contains(err.Error(), "asynchronous replacements are not supported") {
		t.Errorf("error = %v, want it to explain the limitation", err)
	}
	if got := readFile(t, memFS, "/opt/sample/async.txt"); got != "value" {
		t.Errorf("file was modified despite the failure: %q", got)
	}
}

// Lookarounds and backreferences are ordinary JavaScript. Go's own regexp package is
// RE2 and rejects both, so these would fail to compile on the standard library.
func TestReplaceInFile_SupportsLookaroundAndBackreferences(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/ports.conf", "port=8080\nport_backup=8080\n")

	// Lookahead: only the port followed by a newline, not the backup entry.
	if err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/ports.conf", /(?<=^port=)\d+/, "9090", { mode: "line" });
	`); err != nil {
		t.Fatalf("lookbehind hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/opt/sample/ports.conf"); got != "port=9090\nport_backup=8080\n" {
		t.Errorf("lookbehind: contents = %q", got)
	}

	seedFile(t, memFS, "/opt/sample/dupes.txt", "the the cat sat on on the mat\n")
	// Backreference: collapse a doubled word.
	if err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/dupes.txt", /\b(\w+) \1\b/, (m) => m.captures[0]);
	`); err != nil {
		t.Fatalf("backreference hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/opt/sample/dupes.txt"); got != "the cat sat on the mat\n" {
		t.Errorf("backreference: contents = %q", got)
	}
}

// Named groups reach the callback under their names.
func TestReplaceInFile_NamedGroups(t *testing.T) {
	memFS := fs.NewMemFS()
	seedFile(t, memFS, "/opt/sample/name.txt", "user: ada lovelace\n")

	if err := runReplaceHook(t, memFS, nil, `
		await ctx.replaceInFile("/opt/sample/name.txt", /(?<first>\w+) (?<last>\w+)$/, (m) => m.groups.last + ", " + m.groups.first, { mode: "line" });
	`); err != nil {
		t.Fatalf("hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/opt/sample/name.txt"); got != "user: lovelace, ada\n" {
		t.Errorf("contents = %q", got)
	}
}

// A tool configuration may point homeDir somewhere other than the invoking user's own,
// and "~" has to follow the configuration rather than the process.
func TestReplaceInFile_TildeResolvesAgainstConfiguredHome(t *testing.T) {
	memFS := fs.NewMemFS()
	projCfg := hookTestProjectConfig(t)
	projCfg.Paths.HomeDir = "/sandboxed/home"
	seedFile(t, memFS, "/sandboxed/home/.config/tool.conf", "mode = old")

	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install, ctx) =>
			install("manual").hook("after-install", async () => {
				await ctx.replaceInFile("~/.config/tool.conf", /old/, "new");
			}),
		);
	`, HookAfterInstall)

	if err := RunHook(t.Context(), logger.New(logger.Config{Writer: os.Stderr}), memFS,
		exec.NewMockRunner(), tool, projCfg, HookAfterInstall, HookContext{}, Target{}); err != nil {
		t.Fatalf("hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/sandboxed/home/.config/tool.conf"); got != "mode = new" {
		t.Errorf("contents = %q; ~ did not resolve against the configured home", got)
	}
}

var _ = config.ToolConfig{}

// ctx.resolve is documented as returning exactly one path, and as failing loudly when
// the pattern is ambiguous rather than picking one arbitrarily.
func TestResolve_ExactlyOneMatch(t *testing.T) {
	memFS := fs.NewMemFS()
	dir := t.TempDir()
	for _, name := range []string{"tool-1.2.3-linux", "notes.txt"} {
		if err := os.MkdirAll(filepath.Join(dir, name), 0755); err != nil {
			t.Fatalf("seeding: %v", err)
		}
	}

	tool := writeToolFile(t, `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install, ctx) =>
			install("manual").hook("after-install", async ({ fileSystem }) => {
				await fileSystem.writeFile("/resolved", ctx.resolve(`+"`"+dir+`/tool-*-linux`+"`"+`));
			}),
		);
	`, HookAfterInstall)

	if err := RunHook(t.Context(), logger.New(logger.Config{Writer: os.Stderr}), memFS,
		exec.NewMockRunner(), tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{}, Target{}); err != nil {
		t.Fatalf("hook failed: %v", err)
	}
	if got := readFile(t, memFS, "/resolved"); got != filepath.Join(dir, "tool-1.2.3-linux") {
		t.Errorf("resolved = %q", got)
	}
}

func TestResolve_AmbiguousAndMissingPatternsFail(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"config-a.yaml", "config-b.yaml"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0644); err != nil {
			t.Fatalf("seeding: %v", err)
		}
	}

	for _, tc := range []struct{ name, pattern, want string }{
		{"ambiguous", dir + "/config-*.yaml", "expected exactly 1"},
		{"missing", dir + "/absent-*", "No matches found"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tool := writeToolFile(t, `
				import { defineTool } from "@alexgorbatchev/dotfiles";
				export default defineTool((install, ctx) =>
					install("manual").hook("after-install", async () => { ctx.resolve("`+tc.pattern+`"); }),
				);
			`, HookAfterInstall)
			err := RunHook(t.Context(), logger.New(logger.Config{Writer: os.Stderr}), fs.NewMemFS(),
				exec.NewMockRunner(), tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{}, Target{})
			if err == nil {
				t.Fatalf("expected %s pattern to fail", tc.name)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error = %v, want it to mention %q", err, tc.want)
			}
		})
	}
}
