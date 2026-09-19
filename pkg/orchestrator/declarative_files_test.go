package orchestrator

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

const declToolDir = "/home/user/dotfiles/tools/decl-tool"

// declProjectConfig is the project layout the declarative-file tests run against.
func declProjectConfig() *config.ProjectConfig {
	cfg := &config.ProjectConfig{}
	cfg.Paths.HomeDir = "/home/user"
	cfg.Paths.DotfilesDir = "/home/user/dotfiles"
	cfg.Paths.GeneratedDir = "/home/user/.generated"
	cfg.Paths.TargetDir = "/home/user/bin"
	cfg.Paths.BinariesDir = "/home/user/.generated/binaries"
	return cfg
}

// newDeclTool builds a tool that installs nothing and only declares files.
func newDeclTool() *config.ToolConfig {
	return &config.ToolConfig{
		Name:               "decl-tool",
		InstallationMethod: "manual",
		ConfigFilePath:     declToolDir + "/decl-tool.tool.ts",
	}
}

func declFixture(t *testing.T) (*Orchestrator, *fs.MemFS) {
	t.Helper()
	memFS := fs.NewMemFS()
	for _, dir := range []string{"/home/user", declToolDir, "/home/user/bin"} {
		if err := memFS.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
	}
	return newTestOrchestrator(t, memFS, ""), memFS
}

func writeDecl(t *testing.T, memFS *fs.MemFS, path, content string) {
	t.Helper()
	if err := memFS.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("creating %s: %v", filepath.Dir(path), err)
	}
	if err := memFS.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
}

func readDecl(t *testing.T, memFS *fs.MemFS, path string) string {
	t.Helper()
	data, err := memFS.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return string(data)
}

// TestEnsureDirCreatesWithTheDeclaredMode is the case ~/.ssh needs: ssh refuses to
// use a key whose directory other users can read, so the permission is part of the
// declaration rather than something a hook has to chmod afterwards.
func TestEnsureDirCreatesWithTheDeclaredMode(t *testing.T) {
	orch, memFS := declFixture(t)

	tool := newDeclTool()
	tool.Directories = []config.DirectoryConfig{{Path: "~/.ssh", Mode: "0700"}}

	if err := orch.GenerateTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	info, err := memFS.Lstat("/home/user/.ssh")
	if err != nil {
		t.Fatalf("the declared directory was not created: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("the declared path is not a directory")
	}
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("mode = %04o, want 0700", got)
	}
}

// TestEnsureDirCorrectsADriftedMode covers a directory that already exists with the
// wrong permission, which is what a machine set up by hand looks like.
func TestEnsureDirCorrectsADriftedMode(t *testing.T) {
	orch, memFS := declFixture(t)
	if err := memFS.MkdirAll("/home/user/.ssh", 0755); err != nil {
		t.Fatalf("creating the directory: %v", err)
	}

	tool := newDeclTool()
	tool.Directories = []config.DirectoryConfig{{Path: "~/.ssh", Mode: "0700"}}

	if err := orch.GenerateTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	info, err := memFS.Lstat("/home/user/.ssh")
	if err != nil {
		t.Fatalf("lstat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("mode = %04o, want the declaration to correct it to 0700", got)
	}
}

// TestBlockIsWrittenIntoASharedFile is the headline case: the file keeps everything
// the user and other tools put in it, and gains one delimited region.
func TestBlockIsWrittenIntoASharedFile(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "Host personal-pi\n  User pi\n")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{
		Target:  "~/.ssh/config",
		ID:      "includes",
		Content: "Include /home/user/dotfiles/tools/decl-tool/config",
		Mode:    "0600",
	}}

	if err := orch.GenerateTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.ssh/config")
	if !strings.Contains(got, "Host personal-pi") {
		t.Errorf("the user's own host was lost:\n%s", got)
	}
	if !strings.Contains(got, "Include /home/user/dotfiles/tools/decl-tool/config") {
		t.Errorf("the block body is missing:\n%s", got)
	}
	if !strings.Contains(got, ">>> dotfiles:includes") {
		t.Errorf("the block markers are missing:\n%s", got)
	}

	info, err := memFS.Lstat("/home/user/.ssh/config")
	if err != nil {
		t.Fatalf("lstat: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("mode = %04o, want the declared 0600", perm)
	}
}

// TestBlockIsIdempotent checks that a second generate is a no-op. If it were not,
// every run would look like a change and drift detection would mean nothing.
func TestBlockIsIdempotent(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "Host personal-pi\n")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{Target: "~/.ssh/config", ID: "includes", Content: "Include a"}}

	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}
	once := readDecl(t, memFS, "/home/user/.ssh/config")

	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}
	twice := readDecl(t, memFS, "/home/user/.ssh/config")

	if once != twice {
		t.Errorf("the second run changed the file:\n--- once ---\n%s\n--- twice ---\n%s", once, twice)
	}
}

// TestBlockPreservesAnEditMadeOutsideIt is what makes the block design worth having:
// text added beside the block is never in conflict with it.
func TestBlockPreservesAnEditMadeOutsideIt(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "Host original\n")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{Target: "~/.ssh/config", ID: "includes", Content: "Include a"}}

	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}

	// The user adds a host, and the repository changes what the block says.
	current := readDecl(t, memFS, "/home/user/.ssh/config")
	writeDecl(t, memFS, "/home/user/.ssh/config", current+"\nHost added-by-hand\n  User me\n")
	tool.Blocks[0].Content = "Include a\nInclude b"

	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.ssh/config")
	if !strings.Contains(got, "Host added-by-hand") {
		t.Errorf("the host the user added by hand was lost:\n%s", got)
	}
	if !strings.Contains(got, "Include b") {
		t.Errorf("the updated block body was not applied:\n%s", got)
	}
}

// TestBlockKeepsALocalEditToItsOwnBody covers drift inside the markers. The source
// did not move, so the edit is the only change there is and overwriting it would
// throw away work for nothing.
func TestBlockKeepsALocalEditToItsOwnBody(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{Target: "~/.ssh/config", ID: "includes", Content: "Include a"}}

	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}

	edited := strings.Replace(readDecl(t, memFS, "/home/user/.ssh/config"), "Include a", "Include edited-by-hand", 1)
	writeDecl(t, memFS, "/home/user/.ssh/config", edited)

	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.ssh/config")
	if !strings.Contains(got, "Include edited-by-hand") {
		t.Errorf("the local edit to the block body was overwritten:\n%s", got)
	}
}

// TestBlockOverwritePolicyReplacesALocalEdit checks that an author who asks for the
// opposite gets it, and that what was there is still recoverable.
func TestBlockOverwritePolicyReplacesALocalEdit(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{
		Target:   "~/.ssh/config",
		ID:       "includes",
		Content:  "Include a",
		Conflict: "overwrite",
	}}

	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}

	edited := strings.Replace(readDecl(t, memFS, "/home/user/.ssh/config"), "Include a", "Include edited-by-hand", 1)
	writeDecl(t, memFS, "/home/user/.ssh/config", edited)

	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.ssh/config")
	if strings.Contains(got, "edited-by-hand") {
		t.Errorf("the overwrite policy left the local edit in place:\n%s", got)
	}
	if !strings.Contains(got, "Include a") {
		t.Errorf("the declared body was not written:\n%s", got)
	}
}

// TestBlockIsRemovedWhenItsDeclarationDisappears covers a tool dropping a block, or
// being removed entirely. The region goes away and the rest of the file survives.
func TestBlockIsRemovedWhenItsDeclarationDisappears(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "Host personal-pi\n")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{Target: "~/.ssh/config", ID: "includes", Content: "Include a"}}

	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}
	if !strings.Contains(readDecl(t, memFS, "/home/user/.ssh/config"), "dotfiles:includes") {
		t.Fatal("the block was never written, so its removal proves nothing")
	}

	tool.Blocks = nil
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.ssh/config")
	if strings.Contains(got, "dotfiles:includes") {
		t.Errorf("the block outlived its declaration:\n%s", got)
	}
	if !strings.Contains(got, "Host personal-pi") {
		t.Errorf("removing the block took the rest of the file with it:\n%s", got)
	}
}

// TestTemplateIsRenderedWithItsVariables covers the whole template path, including
// that a project placeholder works without being declared as a variable.
func TestTemplateIsRenderedWithItsVariables(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, declToolDir+"/gitconfig.template", "[user]\n\temail = {email}\n\thome = {paths.homeDir}\n")

	tool := newDeclTool()
	tool.Templates = []config.TemplateConfig{{
		Source:    "./gitconfig.template",
		Target:    "~/.gitconfig",
		Variables: map[string]any{"email": "alex@example.com"},
		Mode:      "0644",
	}}

	if err := orch.GenerateTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.gitconfig")
	want := "[user]\n\temail = alex@example.com\n\thome = /home/user\n"
	if got != want {
		t.Errorf("rendered:\n%q\nwant:\n%q", got, want)
	}
}

// TestTemplateReportsAnUnfilledToken checks that a typo stops the run instead of
// writing a configuration file with a missing value into place.
func TestTemplateReportsAnUnfilledToken(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, declToolDir+"/gitconfig.template", "[user]\n\temail = {emial}\n")

	tool := newDeclTool()
	tool.Templates = []config.TemplateConfig{{
		Source:    "./gitconfig.template",
		Target:    "~/.gitconfig",
		Variables: map[string]any{"email": "alex@example.com"},
	}}

	err := orch.GenerateTool(context.Background(), tool, declProjectConfig())
	if err == nil {
		t.Fatal("expected a template with an unfillable token to fail")
	}
	if !strings.Contains(err.Error(), "emial") {
		t.Errorf("error = %q, want it to name the token", err)
	}
}

// TestTemplateMergesAnUpstreamChangeWithALocalOne is the three-way merge doing its
// job: the user's addition and the repository's change both survive.
func TestTemplateMergesAnUpstreamChangeWithALocalOne(t *testing.T) {
	orch, memFS := declFixture(t)
	source := declToolDir + "/gitconfig.template"
	writeDecl(t, memFS, source, "[user]\n\temail = {email}\n\n[diff]\n\ttool = vimdiff\n")

	tool := newDeclTool()
	tool.Templates = []config.TemplateConfig{{
		Source:    "./gitconfig.template",
		Target:    "~/.gitconfig",
		Variables: map[string]any{"email": "alex@example.com"},
	}}

	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}

	// The user edits the top section, and the repository adds a section to the bottom.
	writeDecl(t, memFS, "/home/user/.gitconfig", "[user]\n\temail = alex@example.com\n\tname = Alex\n\n[diff]\n\ttool = vimdiff\n")
	writeDecl(t, memFS, source, "[user]\n\temail = {email}\n\n[diff]\n\ttool = vimdiff\n\n[core]\n\teditor = nvim\n")

	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	got := readDecl(t, memFS, "/home/user/.gitconfig")
	if !strings.Contains(got, "name = Alex") {
		t.Errorf("the user's own section was lost:\n%s", got)
	}
	if !strings.Contains(got, "editor = nvim") {
		t.Errorf("the repository's change was not applied:\n%s", got)
	}
	if strings.Contains(got, "<<<<<<<") {
		t.Errorf("these two changes do not overlap and should have merged cleanly:\n%s", got)
	}
}

// TestSymlinkModeIsEnforcedOnTheSource covers .symlink(..., { mode }). A symlink
// carries no permission of its own, so the mode has to reach what it points at --
// which is exactly what a private key needs.
func TestSymlinkModeIsEnforcedOnTheSource(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, declToolDir+"/id_rsa", "PRIVATE KEY")

	tool := newDeclTool()
	tool.Symlinks = []config.SymlinkConfig{{Source: "id_rsa", Target: "~/.ssh/id_rsa", Mode: "0600"}}

	if err := orch.GenerateTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	info, err := memFS.Lstat(declToolDir + "/id_rsa")
	if err != nil {
		t.Fatalf("lstat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("mode of the link's source = %04o, want 0600", got)
	}
}

// TestCopyModeIsEnforcedOnTheTarget covers .copy(..., { mode }).
func TestCopyModeIsEnforcedOnTheTarget(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, declToolDir+"/netrc", "machine example.com")

	tool := newDeclTool()
	tool.Copies = []config.CopyConfig{{Source: "netrc", Target: "~/.netrc", Mode: "0600"}}

	if err := orch.GenerateTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	info, err := memFS.Lstat("/home/user/.netrc")
	if err != nil {
		t.Fatalf("lstat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("mode = %04o, want 0600", got)
	}
}

// TestBlockRefusesToGuessAtAMalformedFile checks that a file whose markers were
// mangled by hand stops the run instead of being written over.
func TestBlockRefusesToGuessAtAMalformedFile(t *testing.T) {
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "# >>> dotfiles:includes\nInclude a\n")

	tool := newDeclTool()
	tool.Blocks = []config.BlockConfig{{Target: "~/.ssh/config", ID: "includes", Content: "Include a"}}

	err := orch.GenerateTool(context.Background(), tool, declProjectConfig())
	if err == nil {
		t.Fatal("expected an unterminated block to be reported")
	}
	if !strings.Contains(err.Error(), "never closed") {
		t.Errorf("error = %q, want it to say the block is unterminated", err)
	}
}

// TestPoliciesAndEdgeCases covers prompt policy, unmanaged files, and errors.
func TestPoliciesAndEdgeCases(t *testing.T) {
	orch, memFS := declFixture(t)
	ctx := context.Background()

	// 1. PolicyPrompt on template
	writeDecl(t, memFS, declToolDir+"/prompt.tmpl", "desired content")
	writeDecl(t, memFS, "/home/user/prompt.txt", "local edited content")
	toolPrompt := newDeclTool()
	toolPrompt.Templates = []config.TemplateConfig{{
		Source:   "./prompt.tmpl",
		Target:   "~/prompt.txt",
		Conflict: "prompt",
	}}
	if err := orch.GenerateTool(ctx, toolPrompt, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool prompt: %v", err)
	}
	if readDecl(t, memFS, "/home/user/prompt.txt") != "local edited content" {
		t.Error("prompt policy should keep local content when unattended")
	}

	// 2. PolicyKeepLocal on unmanaged block
	writeDecl(t, memFS, "/home/user/.bashrc", "# >>> dotfiles:sh\nold\n# <<< dotfiles:sh\n")
	toolBlock := newDeclTool()
	toolBlock.Blocks = []config.BlockConfig{{
		Target:   "~/.bashrc",
		ID:       "sh",
		Content:  "new",
		Conflict: "keep-local",
		Position: "top",
	}}
	if err := orch.GenerateTool(ctx, toolBlock, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool block keep-local: %v", err)
	}
	if !strings.Contains(readDecl(t, memFS, "/home/user/.bashrc"), "old") {
		t.Error("keep-local on block should preserve existing content")
	}

	// 3. Bad mode error in ensureDir
	toolBadDir := newDeclTool()
	toolBadDir.Directories = []config.DirectoryConfig{{Path: "~/bad", Mode: "invalid-mode"}}
	if err := orch.GenerateTool(ctx, toolBadDir, declProjectConfig()); err == nil {
		t.Error("expected error for invalid dir mode")
	}

	// 4. Bad mode error in template
	toolBadTmpl := newDeclTool()
	writeDecl(t, memFS, declToolDir+"/bad.tmpl", "content")
	toolBadTmpl.Templates = []config.TemplateConfig{{Source: "./bad.tmpl", Target: "~/bad.txt", Mode: "invalid-mode"}}
	if err := orch.GenerateTool(ctx, toolBadTmpl, declProjectConfig()); err == nil {
		t.Error("expected error for invalid template mode")
	}

	// 5. Template read error (missing source)
	toolMissingTmpl := newDeclTool()
	toolMissingTmpl.Templates = []config.TemplateConfig{{Source: "./missing.tmpl", Target: "~/missing.txt"}}
	if err := orch.GenerateTool(ctx, toolMissingTmpl, declProjectConfig()); err == nil {
		t.Error("expected error for missing template source")
	}
}
