package orchestrator

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/drift"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// copyScenario is one run of a .copy() declaration after dotfiles has already placed
// it once: the user may have edited the copy, the repository may have changed its
// source, and the declared conflict policy decides what the second run does.
type copyScenario struct {
	name       string
	policy     string
	base       string
	local      string // "" leaves the copy as dotfiles wrote it
	upstream   string // "" leaves the source as it was
	want       string
	wantBackup string // "" expects no backup beside the target
}

// runCopyScenario generates the copy once, applies the scenario's edits, then
// generates again and returns what the target and its backup hold.
func runCopyScenario(t *testing.T, tt copyScenario) (target, backup string, backupExists bool) {
	t.Helper()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/config.toml", tt.base)
	tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml", Conflict: tt.policy})

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}
	if tt.local != "" {
		writeMemFile(t, memFS, copyToolTarget, tt.local)
	}
	if tt.upstream != "" {
		writeMemFile(t, memFS, copyToolDir+"/config.toml", tt.upstream)
	}
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	got, err := memFS.ReadFile(copyToolTarget)
	if err != nil {
		t.Fatalf("reading the copy: %v", err)
	}
	bak, err := memFS.ReadFile(copyToolTarget + ".bak")
	return string(got), string(bak), err == nil
}

// A single-file copy is settled by the drift engine under its declared policy, the
// same way a template is, rather than being backed up and replaced whenever it
// differs from its source.
func TestApplyCopies_HonoursConflictPolicy(t *testing.T) {
	t.Parallel()
	const (
		base     = "a\nb\nc\n"
		local    = "A\nb\nc\n"
		upstream = "a\nb\nC\n"
	)
	tests := []copyScenario{
		{name: "keep-local keeps an edited copy whose source also changed", policy: "keep-local", base: base, local: local, upstream: upstream, want: local},
		{name: "keep-local keeps an edited copy whose source did not change", policy: "keep-local", base: base, local: local, want: local},
		{name: "the default keeps an edited copy whose source did not change", base: base, local: local, want: local},
		{name: "prompt keeps the copy when the run cannot ask", policy: "prompt", base: base, local: local, upstream: upstream, want: local},
		{name: "merge combines non-overlapping edits", policy: "merge", base: base, local: local, upstream: upstream, want: "A\nb\nC\n"},
		{name: "the default merges non-overlapping edits", base: base, local: local, upstream: upstream, want: "A\nb\nC\n"},
		{name: "overwrite replaces the copy and keeps the edit as a backup", policy: "overwrite", base: base, local: local, upstream: upstream, want: upstream, wantBackup: local},
		{name: "an untouched copy takes the source's update without a backup", policy: "keep-local", base: base, upstream: upstream, want: upstream},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, bak, bakExists := runCopyScenario(t, tt)
			if got != tt.want {
				t.Errorf("copy = %q, want %q", got, tt.want)
			}
			switch {
			case tt.wantBackup == "" && bakExists:
				t.Errorf("unexpected backup %q", bak)
			case tt.wantBackup != "" && bak != tt.wantBackup:
				t.Errorf("backup = %q (exists %v), want %q", bak, bakExists, tt.wantBackup)
			}
		})
	}
}

// A copy's record names the file it was copied from, however the copy was settled
// (written, adopted or merged), so `state log` can show where it came from.
func TestApplyCopies_RecordsTheSource(t *testing.T) {
	t.Parallel()
	source := copyToolDir + "/config.toml"
	tests := []copyScenario{
		{name: "written", base: "a\nb\nc\n", want: "a\nb\nc\n"},
		{name: "merged", base: "a\nb\nc\n", local: "A\nb\nc\n", upstream: "a\nb\nC\n", want: "A\nb\nC\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			projCfg := copyProjectConfig()
			writeMemFile(t, memFS, source, tt.base)
			tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("GenerateTool: %v", err)
			}
			if tt.local != "" {
				writeMemFile(t, memFS, copyToolTarget, tt.local)
				writeMemFile(t, memFS, source, tt.upstream)
				if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
					t.Fatalf("second GenerateTool: %v", err)
				}
			}
			state := recordedCopy(t, orch, "copy-tool", copyToolTarget)
			if state == nil || state.TargetPath == nil || *state.TargetPath != source {
				t.Errorf("recorded state = %+v, want TargetPath %q", state, source)
			}
		})
	}

	t.Run("adopted", func(t *testing.T) {
		t.Parallel()
		ctx := context.Background()
		memFS := fs.NewMemFS()
		orch := newTestOrchestrator(t, memFS, "")
		writeMemFile(t, memFS, source, "same\n")
		writeMemFile(t, memFS, copyToolTarget, "same\n")
		tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
		if err := orch.GenerateTool(ctx, tool, copyProjectConfig()); err != nil {
			t.Fatalf("GenerateTool: %v", err)
		}
		state := recordedCopy(t, orch, "copy-tool", copyToolTarget)
		if state == nil || state.TargetPath == nil || *state.TargetPath != source {
			t.Errorf("recorded state = %+v, want TargetPath %q", state, source)
		}
	})
}

// A copy the policy kept is still reported as drifted: keeping it must not move the
// recorded base forward, or `state diff` and the next generate would forget that the
// user's version and the repository's disagree.
func TestApplyCopies_KeptCopyStaysInConflictForStateDiff(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "v1\n")
	tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml", Conflict: "keep-local"})

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}
	writeMemFile(t, memFS, copyToolTarget, "local\n")
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "v2\n")
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	items, err := drift.NewInspector(orch.fs, orch.reg, projCfg).InspectTool(ctx, tool)
	if err != nil {
		t.Fatalf("InspectTool: %v", err)
	}
	if len(items) != 1 || items[0].State != drift.StateConflict {
		t.Fatalf("items = %+v, want one copy in conflict", items)
	}
}

// A directory copy settles each file it contains under the declared policy: an edited
// member is kept, a member whose source changed is updated in place, and a file the
// user added beside them is not the copy's to displace.
func TestApplyCopies_DirectoryPolicyAppliesPerFile(t *testing.T) {
	t.Parallel()
	const themesTarget = "/home/user/.config/copy-tool/themes"
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "dark\n")
	writeMemFile(t, memFS, copyToolDir+"/themes/extra/light.toml", "light\n")
	tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes", Conflict: "keep-local"})

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}
	writeMemFile(t, memFS, themesTarget+"/dark.toml", "my dark\n")
	writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "darker\n")
	writeMemFile(t, memFS, copyToolDir+"/themes/extra/light.toml", "lighter\n")
	writeMemFile(t, memFS, themesTarget+"/user.toml", "mine\n")
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}

	want := map[string]string{
		themesTarget + "/dark.toml":        "my dark\n",
		themesTarget + "/extra/light.toml": "lighter\n",
		themesTarget + "/user.toml":        "mine\n",
	}
	for path, content := range want {
		got, err := memFS.ReadFile(path)
		if err != nil || string(got) != content {
			t.Errorf("%s = %q, %v; want %q", path, string(got), err, content)
		}
	}
	if exists, _ := memFS.Exists(themesTarget + ".bak"); exists {
		t.Error("the tree was moved aside although every member was settled on its own")
	}

	items, err := drift.NewInspector(orch.fs, orch.reg, projCfg).InspectTool(ctx, tool)
	if err != nil {
		t.Fatalf("InspectTool: %v", err)
	}
	states := map[string]drift.State{}
	for _, item := range items {
		states[item.FilePath] = item.State
	}
	if states[themesTarget+"/dark.toml"] != drift.StateConflict {
		t.Errorf("state diff of the kept member = %q, want %q (items %+v)", states[themesTarget+"/dark.toml"], drift.StateConflict, items)
	}
	if states[themesTarget+"/extra/light.toml"] != drift.StateInSync {
		t.Errorf("state diff of the updated member = %q, want %q", states[themesTarget+"/extra/light.toml"], drift.StateInSync)
	}
}

// A member removed from a copied directory's source is no longer part of the copy,
// so the stale-copy cleanup removes it from the target like any undeclared copy.
func TestApplyCopies_MemberRemovedFromSourceIsCleanedUp(t *testing.T) {
	t.Parallel()
	const themesTarget = "/home/user/.config/copy-tool/themes"
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "dark\n")
	writeMemFile(t, memFS, copyToolDir+"/themes/light.toml", "light\n")
	tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes"})

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("first GenerateTool: %v", err)
	}
	if err := memFS.Remove(copyToolDir + "/themes/light.toml"); err != nil {
		t.Fatalf("removing source member: %v", err)
	}
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}
	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies: %v", err)
	}

	if exists, _ := memFS.Exists(themesTarget + "/light.toml"); exists {
		t.Error("a member removed from the source survived at the target")
	}
	if exists, _ := memFS.Exists(themesTarget + "/dark.toml"); !exists {
		t.Error("a member still in the source was removed")
	}
}

// A symlink at a file copy's target is not the copy: reading through it would compare
// against, and writing through it would change, whatever it points at. Under the
// default policy it is moved aside and a real file takes its place; keep-local leaves
// it where it is.
func TestApplyCopies_SymlinkAtTarget(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		policy      string
		wantReplace bool
	}{
		{name: "the default replaces the link", wantReplace: true},
		{name: "keep-local keeps the link", policy: "keep-local"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed\n")
			if err := memFS.MkdirAll("/home/user/.config/copy-tool", 0755); err != nil {
				t.Fatalf("mkdir: %v", err)
			}
			if err := memFS.Symlink(copyToolDir+"/config.toml", copyToolTarget); err != nil {
				t.Fatalf("symlink: %v", err)
			}
			tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml", Conflict: tt.policy})

			if err := orch.GenerateTool(ctx, tool, copyProjectConfig()); err != nil {
				t.Fatalf("GenerateTool: %v", err)
			}

			info, err := memFS.Lstat(copyToolTarget)
			if err != nil {
				t.Fatalf("lstat target: %v", err)
			}
			isLink := info.Mode()&os.ModeSymlink != 0
			if tt.wantReplace == isLink {
				t.Errorf("target is a symlink = %v, want %v", isLink, !tt.wantReplace)
			}
			if tt.wantReplace {
				bak, err := memFS.Lstat(copyToolTarget + ".bak")
				if err != nil || bak.Mode()&os.ModeSymlink == 0 {
					t.Errorf("expected the link kept as the backup, got %v, %v", bak, err)
				}
			}
		})
	}
}

// The directories a copy has to create to reach its target are not copies: recorded
// under the tool, the stale-copy cleanup would find a "copy" no declaration names and
// try to remove the user's ~/.config on the next run.
func TestApplyCopies_ParentDirectoriesAreNotRecordedAsCopies(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/themes/nested/a.toml", "a\n")
	tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes"})

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	for _, dir := range []string{
		"/home/user/.config",
		"/home/user/.config/copy-tool",
		"/home/user/.config/copy-tool/themes",
		"/home/user/.config/copy-tool/themes/nested",
	} {
		if recordedCopy(t, orch, "copy-tool", dir) != nil {
			t.Errorf("directory %s was recorded as a copy", dir)
		}
	}
	if recordedCopy(t, orch, "copy-tool", "/home/user/.config/copy-tool/themes/nested/a.toml") == nil {
		t.Error("the copied file was not recorded")
	}
}

// A copy without a declared mode keeps the source's permission, as copying a file
// does: an executable script stays executable at its target.
func TestApplyCopies_KeepsSourcePermissionWithoutDeclaredMode(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	writeMemFile(t, memFS, copyToolDir+"/run.sh", "#!/bin/sh\n")
	if err := memFS.Chmod(copyToolDir+"/run.sh", 0o755); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	tool := newCopyTool(config.CopyConfig{Source: "./run.sh", Target: "~/bin/run.sh"})

	if err := orch.GenerateTool(ctx, tool, copyProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	info, err := memFS.Lstat("/home/user/bin/run.sh")
	if err != nil {
		t.Fatalf("lstat: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o755 {
		t.Errorf("mode = %04o, want 0755", got)
	}

	// Only a declared mode is enforced on later runs. The source's permission is what
	// a new copy starts with, and git cannot carry 0600, so enforcing it again would
	// loosen a copy the user tightened by hand.
	if err := memFS.Chmod("/home/user/bin/run.sh", 0o700); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	if err := orch.GenerateTool(ctx, tool, copyProjectConfig()); err != nil {
		t.Fatalf("second GenerateTool: %v", err)
	}
	if info, err = memFS.Lstat("/home/user/bin/run.sh"); err != nil || info.Mode().Perm() != 0o700 {
		t.Errorf("after the user's chmod: %v, %v; want mode 0700 kept", info, err)
	}
}

// A file dotfiles never wrote that a policy keeps is not taken over: its permission
// is left alone and nothing is recorded, so removing the declaration later cannot
// remove the user's file as a stale copy or template.
func TestSettleWholeFile_KeptUnmanagedFileIsNotTakenOver(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		declare func(tool *config.ToolConfig)
	}{
		{name: "copy without a mode", declare: func(tool *config.ToolConfig) {
			tool.Copies = []config.CopyConfig{{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml", Conflict: "keep-local"}}
		}},
		{name: "template with a mode", declare: func(tool *config.ToolConfig) {
			tool.Templates = []config.TemplateConfig{{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml", Mode: "0644", Conflict: "keep-local"}}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			projCfg := copyProjectConfig()
			writeMemFile(t, memFS, copyToolDir+"/config.toml", "from the repository\n")
			writeMemFile(t, memFS, copyToolTarget, "the user's own\n")
			if err := memFS.Chmod(copyToolTarget, 0o600); err != nil {
				t.Fatalf("chmod: %v", err)
			}
			tool := newCopyTool()
			tt.declare(tool)

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("GenerateTool: %v", err)
			}
			if info, err := memFS.Lstat(copyToolTarget); err != nil || info.Mode().Perm() != 0o600 {
				t.Errorf("kept file: %v, %v; want mode 0600 untouched", info, err)
			}

			if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{newCopyTool()}, projCfg); err != nil {
				t.Fatalf("CleanupStaleCopies: %v", err)
			}
			if got, err := memFS.ReadFile(copyToolTarget); err != nil || string(got) != "the user's own\n" {
				t.Errorf("after the declaration was removed: %q, %v; want the user's file in place", got, err)
			}
		})
	}
}

// Removing a whole tool treats its edited copies like a removed declaration does:
// the user's edit is moved aside, not deleted.
func TestCleanupOrphanedTools_BacksUpAnEditedCopy(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed\n")
	if err := orch.GenerateTool(ctx, newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"}), projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	writeMemFile(t, memFS, copyToolTarget, "edited\n")

	if err := orch.CleanupOrphanedTools(ctx, nil, projCfg); err != nil {
		t.Fatalf("CleanupOrphanedTools: %v", err)
	}
	if exists, _ := memFS.Exists(copyToolTarget); exists {
		t.Error("the orphaned copy is still at its target")
	}
	if got, err := memFS.ReadFile(copyToolTarget + ".bak"); err != nil || string(got) != "edited\n" {
		t.Errorf("backup = %q, %v; want the edited file", got, err)
	}
}

// A directory inside a copied directory is part of the copy as well: it is created at
// the target even when it is empty, and something that is not a directory where it
// belongs (a plain file, or a symlink that would lead the copy somewhere else) is
// judged like any unmanaged entry. This runs on the real filesystem, because only
// there does looking beneath a plain file fail rather than report nothing.
func TestApplyCopies_NestedDirectoriesOnTheRealFilesystem(t *testing.T) {
	t.Parallel()
	setup := func(t *testing.T) (orch *Orchestrator, projCfg *config.ProjectConfig, home, toolDir string) {
		t.Helper()
		home = t.TempDir()
		toolDir = filepath.Join(home, "repo", "tool")
		mustWrite(t, filepath.Join(toolDir, "tree", "sub", "x.conf"), "x\n")
		if err := os.MkdirAll(filepath.Join(toolDir, "tree", "empty"), 0o755); err != nil {
			t.Fatal(err)
		}
		projCfg = &config.ProjectConfig{Paths: config.PathsConfig{
			HomeDir:      home,
			TargetDir:    filepath.Join(home, ".generated", "bin"),
			BinariesDir:  filepath.Join(home, ".generated", "binaries"),
			GeneratedDir: filepath.Join(home, ".generated"),
		}}
		return newTestOrchestrator(t, fs.NewResolvedFS(fs.NewOSFS(), home), ""), projCfg, home, toolDir
	}
	newTool := func(toolDir, policy string) *config.ToolConfig {
		return &config.ToolConfig{
			Name:           "copy-tool",
			ConfigFilePath: filepath.Join(toolDir, "copy-tool.tool.ts"),
			Copies:         []config.CopyConfig{{Source: "./tree", Target: "~/tree", Conflict: policy}},
		}
	}

	t.Run("an empty source directory is created", func(t *testing.T) {
		t.Parallel()
		orch, projCfg, home, toolDir := setup(t)
		if err := orch.GenerateTool(context.Background(), newTool(toolDir, ""), projCfg); err != nil {
			t.Fatalf("GenerateTool: %v", err)
		}
		if info, err := os.Stat(filepath.Join(home, "tree", "empty")); err != nil || !info.IsDir() {
			t.Errorf("empty directory: %v, %v", info, err)
		}
	})

	t.Run("a file where a nested directory belongs is moved aside", func(t *testing.T) {
		t.Parallel()
		orch, projCfg, home, toolDir := setup(t)
		mustWrite(t, filepath.Join(home, "tree", "sub"), "a file\n")
		if err := orch.GenerateTool(context.Background(), newTool(toolDir, ""), projCfg); err != nil {
			t.Fatalf("GenerateTool: %v", err)
		}
		if got, err := os.ReadFile(filepath.Join(home, "tree", "sub", "x.conf")); err != nil || string(got) != "x\n" {
			t.Errorf("x.conf = %q, %v", got, err)
		}
		if got, err := os.ReadFile(filepath.Join(home, "tree", "sub.bak")); err != nil || string(got) != "a file\n" {
			t.Errorf("backup = %q, %v", got, err)
		}
		items, err := drift.NewInspector(orch.fs, orch.reg, projCfg).InspectTool(context.Background(), newTool(toolDir, ""))
		if err != nil {
			t.Fatalf("InspectTool after generate: %v", err)
		}
		for _, item := range items {
			if item.State != drift.StateInSync {
				t.Errorf("%s = %q after generate, want in-sync", item.FilePath, item.State)
			}
		}
	})

	t.Run("state diff reports a file where a nested directory belongs", func(t *testing.T) {
		t.Parallel()
		orch, projCfg, home, toolDir := setup(t)
		mustWrite(t, filepath.Join(home, "tree", "sub"), "a file\n")
		items, err := drift.NewInspector(orch.fs, orch.reg, projCfg).InspectTool(context.Background(), newTool(toolDir, ""))
		if err != nil {
			t.Fatalf("InspectTool: %v", err)
		}
		found := false
		for _, item := range items {
			if item.FilePath == filepath.Join(home, "tree", "sub") && item.State == drift.StateUnmanaged {
				found = true
			}
		}
		if !found {
			t.Errorf("items = %+v, want the file at tree/sub reported as unmanaged", items)
		}
	})

	t.Run("keep-local does not write through a symlinked nested directory", func(t *testing.T) {
		t.Parallel()
		orch, projCfg, home, toolDir := setup(t)
		elsewhere := filepath.Join(home, "elsewhere")
		if err := os.MkdirAll(elsewhere, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Join(home, "tree"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(elsewhere, filepath.Join(home, "tree", "sub")); err != nil {
			t.Fatal(err)
		}
		if err := orch.GenerateTool(context.Background(), newTool(toolDir, "keep-local"), projCfg); err != nil {
			t.Fatalf("GenerateTool: %v", err)
		}
		if _, err := os.Stat(filepath.Join(elsewhere, "x.conf")); !os.IsNotExist(err) {
			t.Errorf("the copy wrote through the symlink into %s (%v)", elsewhere, err)
		}
	})
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// A file that stops being part of a copy is removed from the target only when it
// still holds what dotfiles wrote. An edited one is moved aside to a backup, so the
// removal of a declaration or of a source file never discards the user's work.
func TestCleanupStaleCopies_BacksUpAnEditedFile(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := fs.NewMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed\n")
	tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	writeMemFile(t, memFS, copyToolTarget, "edited\n")

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{newCopyTool()}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies: %v", err)
	}
	if exists, _ := memFS.Exists(copyToolTarget); exists {
		t.Error("the stale copy is still at its target")
	}
	if got, err := memFS.ReadFile(copyToolTarget + ".bak"); err != nil || string(got) != "edited\n" {
		t.Errorf("backup = %q, %v; want the edited file", got, err)
	}
	if recordedCopy(t, orch, "copy-tool", copyToolTarget) != nil {
		t.Error("the stale copy is still recorded")
	}
}

// A merge keeps the user's side on later runs too. The base recorded after a merge is
// the repository's version, not the merged file: recording the merged file would make
// the next run read it as untouched and replace it with the source, discarding the
// edit the merge had kept.
func TestSettleWholeFile_MergedFileSurvivesTheNextRun(t *testing.T) {
	t.Parallel()
	const (
		base     = "l1\nl2\nl3\nl4\nl5\n"
		local    = "L1\nl2\nl3\nl4\nl5\n"
		upstream = "l1\nl2\nl3\nl4\nL5\n"
		merged   = "L1\nl2\nl3\nl4\nL5\n"
	)
	tests := []struct {
		name    string
		mode    os.FileMode // 0 when the declaration states none
		declare func(tool *config.ToolConfig)
	}{
		{name: "copy", declare: func(tool *config.ToolConfig) {
			tool.Copies = []config.CopyConfig{{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"}}
		}},
		{name: "template", declare: func(tool *config.ToolConfig) {
			tool.Templates = []config.TemplateConfig{{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"}}
		}},
		{name: "copy with a mode", mode: 0o600, declare: func(tool *config.ToolConfig) {
			tool.Copies = []config.CopyConfig{{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml", Mode: "600"}}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := fs.NewMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			projCfg := copyProjectConfig()
			writeMemFile(t, memFS, copyToolDir+"/config.toml", base)
			tool := newCopyTool()
			tt.declare(tool)

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("first GenerateTool: %v", err)
			}
			writeMemFile(t, memFS, copyToolTarget, local)
			writeMemFile(t, memFS, copyToolDir+"/config.toml", upstream)
			for run := 2; run <= 3; run++ {
				if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
					t.Fatalf("GenerateTool run %d: %v", run, err)
				}
				if got, _ := memFS.ReadFile(copyToolTarget); string(got) != merged {
					t.Fatalf("after run %d = %q, want the merge %q", run, got, merged)
				}
			}
			if tt.mode != 0 {
				if info, err := memFS.Lstat(copyToolTarget); err != nil || info.Mode().Perm() != tt.mode {
					t.Errorf("merged file: %v, %v; want mode %04o", info, err, tt.mode)
				}
				state := recordedCopy(t, orch, "copy-tool", copyToolTarget)
				if state == nil || state.TargetMode == nil || string(*state.TargetMode) != "0600" {
					t.Errorf("recorded state = %+v, want the declared mode 0600 recorded", state)
				}
			}

			// One write for the first run and one for the merge: the merge is a single
			// operation in `state log`, as a block's is, and the run that keeps the
			// merged file writes nothing.
			ops, err := orch.reg.GetFileOperations(ctx, registry.FileOperationFilter{FilePath: copyToolTarget, OperationType: "writeFile"})
			if err != nil {
				t.Fatalf("GetFileOperations: %v", err)
			}
			if len(ops) != 2 {
				t.Errorf("recorded %d writes, want 2", len(ops))
			}
			// The merge's own record spells the mode the way every other write does,
			// whatever spelling the declaration used.
			if tt.mode != 0 && len(ops) > 0 && (ops[0].TargetMode == nil || string(*ops[0].TargetMode) != "0600") {
				t.Errorf("merge record target mode = %v, want 0600", ops[0].TargetMode)
			}

			items, err := drift.NewInspector(orch.fs, orch.reg, projCfg).InspectTool(ctx, tool)
			if err != nil {
				t.Fatalf("InspectTool: %v", err)
			}
			if len(items) != 1 || items[0].State != drift.StateLocalDrift {
				t.Errorf("items = %+v, want the merged file reported as local drift", items)
			}

			if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{newCopyTool()}, projCfg); err != nil {
				t.Fatalf("CleanupStaleCopies: %v", err)
			}
			if got, err := memFS.ReadFile(copyToolTarget + ".bak"); err != nil || string(got) != merged {
				t.Errorf("after removing the declaration, backup = %q, %v; want the merged file kept", got, err)
			}
		})
	}
}

// A target spelled with a trailing slash names the same directory, and gets the same
// protection: keep-local must not write through a symlink there either.
func TestApplyCopies_TrailingSlashTargetOverASymlink(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	toolDir := filepath.Join(home, "repo", "tool")
	mustWrite(t, filepath.Join(toolDir, "tree", "x.conf"), "x\n")
	elsewhere := filepath.Join(home, "elsewhere")
	if err := os.MkdirAll(elsewhere, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(elsewhere, filepath.Join(home, "tree")); err != nil {
		t.Fatal(err)
	}
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
		HomeDir:      home,
		TargetDir:    filepath.Join(home, ".generated", "bin"),
		BinariesDir:  filepath.Join(home, ".generated", "binaries"),
		GeneratedDir: filepath.Join(home, ".generated"),
	}}
	orch := newTestOrchestrator(t, fs.NewResolvedFS(fs.NewOSFS(), home), "")
	tool := &config.ToolConfig{
		Name:           "copy-tool",
		ConfigFilePath: filepath.Join(toolDir, "copy-tool.tool.ts"),
		Copies:         []config.CopyConfig{{Source: "./tree/", Target: "{paths.homeDir}/tree/", Conflict: "keep-local"}},
	}

	if err := orch.GenerateTool(context.Background(), tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	if _, err := os.Stat(filepath.Join(elsewhere, "x.conf")); !os.IsNotExist(err) {
		t.Errorf("the copy wrote through the symlink into %s (%v)", elsewhere, err)
	}
}

// A member that left a copied directory's source is not removed through a symlink that
// has since replaced one of the directories above it: the file there is not one
// dotfiles wrote, however much it resembles one.
func TestCleanupStaleCopies_DoesNotRemoveThroughASymlinkedDirectory(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	toolDir := filepath.Join(home, "repo", "tool")
	mustWrite(t, filepath.Join(toolDir, "tree", "sub", "y"), "y\n")
	mustWrite(t, filepath.Join(toolDir, "tree", "keep"), "k\n")
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
		HomeDir:      home,
		TargetDir:    filepath.Join(home, ".generated", "bin"),
		BinariesDir:  filepath.Join(home, ".generated", "binaries"),
		GeneratedDir: filepath.Join(home, ".generated"),
	}}
	orch := newTestOrchestrator(t, fs.NewResolvedFS(fs.NewOSFS(), home), "")
	tool := &config.ToolConfig{
		Name:           "copy-tool",
		ConfigFilePath: filepath.Join(toolDir, "copy-tool.tool.ts"),
		Copies:         []config.CopyConfig{{Source: "./tree", Target: "~/tree"}},
	}
	ctx := context.Background()
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	unrelated := filepath.Join(home, "unrelated")
	mustWrite(t, filepath.Join(unrelated, "y"), "y\n")
	if err := os.RemoveAll(filepath.Join(home, "tree", "sub")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(unrelated, filepath.Join(home, "tree", "sub")); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Join(toolDir, "tree", "sub")); err != nil {
		t.Fatal(err)
	}

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies: %v", err)
	}
	if got, err := os.ReadFile(filepath.Join(unrelated, "y")); err != nil || string(got) != "y\n" {
		t.Errorf("the unrelated file = %q, %v; want it untouched", got, err)
	}
	if recordedCopy(t, orch, "copy-tool", filepath.Join(home, "tree", "sub", "y")) != nil {
		t.Error("the stale member is still recorded")
	}
}

// An entry dotfiles never wrote is described as such, not as one "changed since
// dotfiles last wrote it".
func TestContentForAction_DescribesUnmanagedEntries(t *testing.T) {
	t.Parallel()
	var logBuf bytes.Buffer
	orch := newTestOrchestrator(t, fs.NewMemFS(), "")
	orch.logger = logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})

	for _, action := range []drift.Action{drift.ActionKeep, drift.ActionPrompt} {
		logBuf.Reset()
		if _, _, err := orch.contentForAction(actionRequest{action: action, state: drift.StateUnmanaged, path: "/home/user/x", label: "/home/user/x", tool: "t"}); err != nil {
			t.Fatalf("contentForAction: %v", err)
		}
		if strings.Contains(logBuf.String(), "since dotfiles last wrote it") || !strings.Contains(logBuf.String(), "not written by dotfiles") {
			t.Errorf("%s message = %q", action, logBuf.String())
		}
		// `dotfiles state diff` takes a tool name; a path there is "tool not found".
		if action == drift.ActionPrompt && !strings.Contains(logBuf.String(), "`dotfiles state diff t`") {
			t.Errorf("prompt message = %q, want it to name the command that shows the file", logBuf.String())
		}
	}
}
