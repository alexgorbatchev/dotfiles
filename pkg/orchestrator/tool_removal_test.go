package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

const (
	orphanToolDir    = "/home/user/dotfiles/tools/orphan-tool"
	orphanShim       = "/home/user/bin/orphan-bin"
	orphanLink       = "/home/user/.config/orphan-tool"
	orphanInstallDir = "/home/user/.generated/binaries/orphan-tool"
	orphanBinary     = orphanInstallDir + "/current/orphan-bin"
)

// orphanFixture installs a tool that has a shim, a config directory linked into the
// home directory and a downloaded binary, then deletes the tool's directory the way
// removing a tool from a dotfiles repository does. The link is left pointing at a
// directory that no longer exists.
func orphanFixture(t *testing.T) (*Orchestrator, *fs.MemFS, *bytes.Buffer) {
	t.Helper()
	orch, memFS := declFixture(t)
	var logBuf bytes.Buffer
	orch.logger = logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	if err := orch.instRegistry.Register(&mockInstaller{name: "custom-method", binaries: []string{"orphan-bin"}}); err != nil {
		t.Fatalf("registering the installer: %v", err)
	}
	writeDecl(t, memFS, orphanToolDir+"/config/settings.toml", "theme = dark\n")

	tool := &config.ToolConfig{
		Name:               "orphan-tool",
		InstallationMethod: "custom-method",
		ConfigFilePath:     orphanToolDir + "/orphan-tool.tool.ts",
		Binaries:           testutil.DeclaredBinaries("orphan-bin"),
		Symlinks:           []config.SymlinkConfig{{Source: "./config", Target: "~/.config/orphan-tool"}},
	}
	if err := orch.InstallTool(context.Background(), tool, declProjectConfig()); err != nil {
		t.Fatalf("InstallTool: %v", err)
	}
	// The mock installer downloads nothing, so the binary it would have placed is written here.
	writeDecl(t, memFS, orphanBinary, "binary")

	for _, path := range []string{orphanShim, orphanLink, orphanBinary} {
		if _, err := memFS.Lstat(path); err != nil {
			t.Fatalf("the fixture did not create %s: %v", path, err)
		}
	}
	if err := memFS.RemoveAll(orphanToolDir); err != nil {
		t.Fatalf("removing the tool directory: %v", err)
	}
	logBuf.Reset()
	return orch, memFS, &logBuf
}

func assertGone(t *testing.T, memFS fs.FS, path string) {
	t.Helper()
	if _, err := memFS.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("%s is still there (lstat error %v)", path, err)
	}
}

func assertRemovalRecorded(t *testing.T, orch *Orchestrator, toolName, path string) {
	t.Helper()
	ops, err := orch.reg.GetFileOperations(context.Background(), registry.FileOperationFilter{ToolName: toolName, FilePath: path})
	if err != nil {
		t.Fatalf("reading the history of %s: %v", path, err)
	}
	if len(ops) == 0 || ops[0].OperationType != "rm" {
		t.Errorf("the latest operation recorded for %s is not an rm: %+v", path, ops)
	}
}

func assertForgotten(t *testing.T, orch *Orchestrator, toolName string) {
	t.Helper()
	ctx := context.Background()
	recorded, err := orch.toolsWithRecordedArtifacts(ctx)
	if err != nil {
		t.Fatalf("toolsWithRecordedArtifacts: %v", err)
	}
	if slices.Contains(recorded, toolName) {
		t.Errorf("the registry still records artifacts of %s", toolName)
	}
	if rec, err := orch.reg.GetToolInstallation(ctx, toolName); err != nil || rec != nil {
		t.Errorf("installation record = %+v, %v; want none", rec, err)
	}
}

func TestCleanupOrphanedToolsRemovesEveryRecordedArtifact(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	orch, memFS, logBuf := orphanFixture(t)

	if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
		t.Fatalf("CleanupOrphanedTools: %v", err)
	}

	for _, path := range []string{orphanShim, orphanLink, orphanInstallDir} {
		assertGone(t, memFS, path)
	}
	for _, path := range []string{orphanShim, orphanLink, orphanInstallDir + "/current"} {
		assertRemovalRecorded(t, orch, "orphan-tool", path)
	}
	assertForgotten(t, orch, "orphan-tool")
	if !strings.Contains(logBuf.String(), "rm ~/.config/orphan-tool") {
		t.Errorf("the link's removal was not reported:\n%s", logBuf.String())
	}

	// A second run finds nothing left to clean up.
	logBuf.Reset()
	if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
		t.Fatalf("second CleanupOrphanedTools: %v", err)
	}
	if strings.Contains(logBuf.String(), "orphan-tool") {
		t.Errorf("the second run cleaned the tool up again:\n%s", logBuf.String())
	}
}

func TestCleanupOrphanedToolsLeavesWhatIsNoLongerItsOwn(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		replace func(t *testing.T, memFS *fs.MemFS)
		warning string
		kept    string
	}{
		{
			name: "a link pointed elsewhere",
			replace: func(t *testing.T, memFS *fs.MemFS) {
				writeDecl(t, memFS, "/home/user/my-config/settings.toml", "mine\n")
				if err := memFS.Remove(orphanLink); err != nil {
					t.Fatal(err)
				}
				if err := memFS.Symlink("/home/user/my-config", orphanLink); err != nil {
					t.Fatal(err)
				}
			},
			warning: "it points to /home/user/my-config now",
			kept:    orphanLink,
		},
		{
			name: "a directory put in place of the link",
			replace: func(t *testing.T, memFS *fs.MemFS) {
				if err := memFS.Remove(orphanLink); err != nil {
					t.Fatal(err)
				}
				writeDecl(t, memFS, orphanLink+"/settings.toml", "mine\n")
			},
			warning: "it is no longer the symlink dotfiles created",
			kept:    orphanLink + "/settings.toml",
		},
		{
			name: "a directory put in place of the shim",
			replace: func(t *testing.T, memFS *fs.MemFS) {
				if err := memFS.Remove(orphanShim); err != nil {
					t.Fatal(err)
				}
				writeDecl(t, memFS, orphanShim+"/README", "mine\n")
			},
			warning: "it is a directory now, not the file dotfiles wrote",
			kept:    orphanShim + "/README",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			orch, memFS, logBuf := orphanFixture(t)
			tt.replace(t, memFS)

			if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
				t.Fatalf("CleanupOrphanedTools: %v", err)
			}

			if !strings.Contains(logBuf.String(), tt.warning) {
				t.Errorf("log does not explain what was left:\n%s", logBuf.String())
			}
			// What the user put there survives; the tool's own artifacts do not.
			if _, err := memFS.Lstat(tt.kept); err != nil {
				t.Errorf("the user's %s was removed: %v", tt.kept, err)
			}
			assertGone(t, memFS, orphanInstallDir)
			assertForgotten(t, orch, "orphan-tool")
		})
	}
}

// failingRemoveFS fails to remove one path while fail is set, the way a file on a
// read-only mount or owned by another user does.
type failingRemoveFS struct {
	fs.FS
	path string
	fail bool
}

func (f *failingRemoveFS) Remove(path string) error {
	if f.fail && path == f.path {
		return os.ErrPermission
	}
	return f.FS.Remove(path)
}

func TestCleanupOrphanedToolsRetriesWhatItCouldNotRemove(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	orch, memFS, _ := orphanFixture(t)
	failing := &failingRemoveFS{FS: orch.fs, path: orphanShim, fail: true}
	orch.fs = failing

	err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig())
	if !errors.Is(err, toolbatch.ErrFailed) {
		t.Fatalf("CleanupOrphanedTools = %v; want a reported tool failure", err)
	}
	if _, err := memFS.Lstat(orphanShim); err != nil {
		t.Fatalf("the shim that could not be removed is gone: %v", err)
	}
	assertGone(t, memFS, orphanLink)
	recorded, err := orch.toolsWithRecordedArtifacts(ctx)
	if err != nil {
		t.Fatalf("toolsWithRecordedArtifacts: %v", err)
	}
	if !slices.Contains(recorded, "orphan-tool") {
		t.Fatal("the failed cleanup forgot the tool, so nothing would retry it")
	}
	if rec, err := orch.reg.GetToolInstallation(ctx, "orphan-tool"); err != nil || rec == nil {
		t.Errorf("installation record = %+v, %v; want it kept until cleanup succeeds", rec, err)
	}

	failing.fail = false
	if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
		t.Fatalf("retried CleanupOrphanedTools: %v", err)
	}
	assertGone(t, memFS, orphanShim)
	assertRemovalRecorded(t, orch, "orphan-tool", orphanShim)
	assertForgotten(t, orch, "orphan-tool")
}

func TestCleanupOrphanedToolsRemovesDeclaredFiles(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	orch, memFS := declFixture(t)
	writeDecl(t, memFS, "/home/user/.ssh/config", "Host personal-pi\n")
	writeDecl(t, memFS, "/home/user/.existing/keep", "x")
	if err := memFS.Remove("/home/user/.existing/keep"); err != nil {
		t.Fatal(err)
	}

	tool := newDeclTool()
	tool.Directories = []config.DirectoryConfig{
		{Path: "~/.created-empty"},
		{Path: "~/.created-used"},
		{Path: "~/.existing", Mode: "0700"},
	}
	tool.Blocks = []config.BlockConfig{{Target: "~/.ssh/config", ID: "includes", Content: "Include ~/.ssh/extra"}}
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	writeDecl(t, memFS, "/home/user/.created-used/user-file", "mine\n")

	if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
		t.Fatalf("CleanupOrphanedTools: %v", err)
	}

	assertGone(t, memFS, "/home/user/.created-empty")
	for _, kept := range []string{"/home/user/.created-used/user-file", "/home/user/.existing"} {
		if _, err := memFS.Lstat(kept); err != nil {
			t.Errorf("%s was removed: %v", kept, err)
		}
	}
	got := readDecl(t, memFS, "/home/user/.ssh/config")
	if strings.Contains(got, "Include ~/.ssh/extra") || !strings.Contains(got, "Host personal-pi") {
		t.Errorf("shared file after cleanup:\n%s\nwant the block gone and the rest kept", got)
	}
	assertForgotten(t, orch, "decl-tool")
}

// A path another tool wrote after the orphaned one belongs to that tool now, while
// the orphaned tool's own file still goes.
func TestCleanupOrphanedToolsKeepsAPathAnotherToolTookOver(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	orch, memFS := declFixture(t)
	const (
		shared = "/home/user/bin/shared"
		own    = "/home/user/bin/gone-only"
	)
	writeDecl(t, memFS, shared, "the active tool's shim")
	writeDecl(t, memFS, own, "the orphaned tool's shim")
	recordShim(t, orch, "gone-tool", own)
	recordShim(t, orch, "gone-tool", shared)
	recordShim(t, orch, "active-tool", shared)
	active := &config.ToolConfig{Name: "active-tool"}

	if err := orch.CleanupOrphanedTools(ctx, []*config.ToolConfig{active}, declProjectConfig()); err != nil {
		t.Fatalf("CleanupOrphanedTools: %v", err)
	}
	assertGone(t, memFS, own)
	assertRemovalRecorded(t, orch, "gone-tool", own)
	if _, err := memFS.Lstat(shared); err != nil {
		t.Errorf("the active tool's file was removed: %v", err)
	}
	if st, err := orch.reg.GetFileState(ctx, shared); err != nil || st == nil || st.ToolName != "active-tool" {
		t.Errorf("state of %s = %+v, %v; want it still owned by active-tool", shared, st, err)
	}
	assertForgotten(t, orch, "gone-tool")
}

// recordShim records that toolName wrote a shim at path.
func recordShim(t *testing.T, orch *Orchestrator, toolName, path string) {
	t.Helper()
	ctx := context.Background()
	err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error {
		return orch.reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
			ToolName: toolName, OperationType: "writeFile", FilePath: path, FileType: "shim", OperationID: toolName + path,
		})
	})
	if err != nil {
		t.Fatalf("recording %s for %s: %v", path, toolName, err)
	}
}

// A directory the tool created keeps its record while a file inside it could not be
// removed, so the retry that removes the file removes the directory as well.
func TestCleanupOrphanedToolsKeepsADirectoryWhoseContentFailed(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	orch, memFS := declFixture(t)
	const (
		dir      = "/home/user/.app"
		rendered = dir + "/app.conf"
	)
	writeDecl(t, memFS, declToolDir+"/app.conf.tmpl", "setting = 1\n")
	tool := newDeclTool()
	tool.Directories = []config.DirectoryConfig{{Path: "~/.app"}}
	tool.Templates = []config.TemplateConfig{{Source: "./app.conf.tmpl", Target: "~/.app/app.conf"}}
	if err := orch.GenerateTool(ctx, tool, declProjectConfig()); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	failing := &failingRemoveFS{FS: orch.fs, path: rendered, fail: true}
	orch.fs = failing

	if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); !errors.Is(err, toolbatch.ErrFailed) {
		t.Fatalf("CleanupOrphanedTools = %v; want a reported tool failure", err)
	}
	if st, err := orch.reg.GetFileState(ctx, dir); err != nil || st == nil {
		t.Fatalf("state of %s = %+v, %v; want its record kept", dir, st, err)
	}

	failing.fail = false
	if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
		t.Fatalf("retried CleanupOrphanedTools: %v", err)
	}
	assertGone(t, memFS, dir)
	assertRemovalRecorded(t, orch, "decl-tool", dir)
	assertForgotten(t, orch, "decl-tool")
}

// A copied directory the user replaced with a link to their own leads every recorded
// member path into the user's files, which are kept; only the records end. This runs
// on the real filesystem, because only there does a path resolve through a symlink
// above its last component.
func TestCleanupOrphanedToolsKeepsFilesReachedThroughAReplacedCopyDirectory(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		content string
	}{
		{name: "an identical file", content: "managed\n"},
		{name: "an edited file", content: "edited\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			home := t.TempDir()
			toolDir := filepath.Join(home, "dotfiles", "tools", "decl-tool")
			projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir:      home,
				TargetDir:    filepath.Join(home, ".generated", "bin"),
				BinariesDir:  filepath.Join(home, ".generated", "binaries"),
				GeneratedDir: filepath.Join(home, ".generated"),
			}}
			orch := newTestOrchestrator(t, fs.NewResolvedFS(fs.NewOSFS(), home), "")
			var logBuf bytes.Buffer
			orch.logger = logger.New(logger.Config{Writer: &logBuf})
			mustWrite(t, filepath.Join(toolDir, "nvim", "init.lua"), "managed\n")
			tool := &config.ToolConfig{
				Name:           "decl-tool",
				ConfigFilePath: filepath.Join(toolDir, "decl-tool.tool.ts"),
				Copies:         []config.CopyConfig{{Source: "./nvim", Target: "~/.config/nvim"}},
			}
			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("GenerateTool: %v", err)
			}
			copied := filepath.Join(home, ".config", "nvim")
			if err := os.RemoveAll(copied); err != nil {
				t.Fatal(err)
			}
			mine := filepath.Join(home, "my-nvim", "init.lua")
			mustWrite(t, mine, tt.content)
			if err := os.Symlink(filepath.Dir(mine), copied); err != nil {
				t.Fatal(err)
			}

			if err := orch.CleanupOrphanedTools(ctx, nil, projCfg); err != nil {
				t.Fatalf("CleanupOrphanedTools: %v", err)
			}
			if got, err := os.ReadFile(mine); err != nil || string(got) != tt.content {
				t.Errorf("the user's file holds %q, %v; want %q", got, err, tt.content)
			}
			if _, err := os.Lstat(mine + ".bak"); !errors.Is(err, os.ErrNotExist) {
				t.Errorf("the user's file was backed up (lstat error %v)", err)
			}
			if !strings.Contains(logBuf.String(), "~/.config/nvim above it is no longer the directory dotfiles copied into") {
				t.Errorf("log does not explain why the file was kept:\n%s", logBuf.String())
			}
			assertForgotten(t, orch, "decl-tool")
		})
	}
}

func TestCopyRootBound(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name, source, target, want string
	}{
		{"a single file renamed", "/repo/x/settings.json", "/home/.config/app/config.json", "/home/.config/app/config.json"},
		{"a member of a renamed directory", "/repo/x/nvim-cfg/lua/a.lua", "/home/.config/nvim/lua/a.lua", "/home/.config/nvim"},
		{"a member of a directory named alike", "/repo/x/nvim/init.lua", "/home/.config/nvim/init.lua", "/home/.config"},
		{"paths alike to the root", "/a/b", "/a/b", "/"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := copyRootBound(tt.source, tt.target); got != tt.want {
				t.Errorf("copyRootBound(%q, %q) = %q, want %q", tt.source, tt.target, got, tt.want)
			}
		})
	}
}

func TestCleanupOrphanedToolsReportsWhatAPackageManagerInstalled(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		record  registry.ToolInstallationRecord
		warning string
	}{
		{
			name:    "a package",
			record:  registry.ToolInstallationRecord{InstallMethod: ptrTo("brew")},
			warning: "The brew package it installed is left in place",
		},
		{
			name:    "an app bundle",
			record:  registry.ToolInstallationRecord{InstallMethod: ptrTo("dmg"), AppBundlePath: ptrTo("/Applications/Tool.app")},
			warning: "/Applications/Tool.app is left in place",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			orch, memFS := declFixture(t)
			var logBuf bytes.Buffer
			orch.logger = logger.New(logger.Config{Writer: &logBuf})
			writeDecl(t, memFS, "/home/user/.generated/binaries/pkg-tool/current/pkg-bin", "link")
			rec := tt.record
			rec.ToolName = "pkg-tool"
			rec.Version = "1.0.0"
			rec.InstallPath = "/home/user/.generated/binaries/pkg-tool"
			if err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error { return orch.reg.RecordToolInstallation(ctx, tx, &rec) }); err != nil {
				t.Fatalf("RecordToolInstallation: %v", err)
			}

			if err := orch.CleanupOrphanedTools(ctx, nil, declProjectConfig()); err != nil {
				t.Fatalf("CleanupOrphanedTools: %v", err)
			}
			if !strings.Contains(logBuf.String(), tt.warning) {
				t.Errorf("log does not report the external installation:\n%s", logBuf.String())
			}
			assertGone(t, memFS, "/home/user/.generated/binaries/pkg-tool")
			assertForgotten(t, orch, "pkg-tool")
		})
	}
}

func TestRemoveToolArtifactsInstallDirectories(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	t.Run("refuses a name that is not one directory", func(t *testing.T) {
		t.Parallel()
		orch, _ := declFixture(t)
		for _, name := range []string{"", ".", "..", "a/b"} {
			if err := orch.removeToolArtifacts(ctx, name, declProjectConfig()); err == nil {
				t.Errorf("removeToolArtifacts(%q) succeeded", name)
			}
		}
	})

	t.Run("removes a recorded install directory the binaries directory moved away from", func(t *testing.T) {
		t.Parallel()
		orch, memFS := declFixture(t)
		writeDecl(t, memFS, "/home/user/old-binaries/moved-tool/current/bin", "x")
		writeDecl(t, memFS, "/home/user/not-named-after-it/bin", "x")
		for _, path := range []string{"/home/user/old-binaries/moved-tool", "/home/user/not-named-after-it"} {
			rec := &registry.ToolInstallationRecord{ToolName: "moved-tool", Version: "1", InstallPath: path}
			if err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error { return orch.reg.RecordToolInstallation(ctx, tx, rec) }); err != nil {
				t.Fatalf("RecordToolInstallation: %v", err)
			}
			if err := orch.removeToolArtifacts(ctx, "moved-tool", declProjectConfig()); err != nil {
				t.Fatalf("removeToolArtifacts: %v", err)
			}
		}
		assertGone(t, memFS, "/home/user/old-binaries/moved-tool")
		if _, err := memFS.Lstat("/home/user/not-named-after-it/bin"); err != nil {
			t.Errorf("a recorded install path not named after the tool was removed: %v", err)
		}
	})
}

// A stale copy that cannot be removed keeps its record, so the next run retries it.
func TestCleanupStaleCopiesKeepsTheRecordOfACopyItCouldNotRemove(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed\n")
	if err := orch.GenerateTool(ctx, newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"}), projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}
	orch.fs = &failingRemoveFS{FS: orch.fs, path: copyToolTarget, fail: true}

	err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{newCopyTool()}, projCfg)
	if err == nil || !errors.Is(err, os.ErrPermission) {
		t.Fatalf("CleanupStaleCopies = %v; want the removal failure", err)
	}
	if recordedCopy(t, orch, "copy-tool", copyToolTarget) == nil {
		t.Error("the copy's record ended although the copy is still there")
	}
}

func TestRemoveRecordedPath(t *testing.T) {
	t.Parallel()
	const path = "/home/user/.local/thing"
	writeFile := func(t *testing.T, memFS *fs.MemFS) { writeDecl(t, memFS, path, "x") }
	makeDir := func(t *testing.T, memFS *fs.MemFS) {
		if err := memFS.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	makeLink := func(t *testing.T, memFS *fs.MemFS) {
		writeDecl(t, memFS, "/home/user/elsewhere", "x")
		if err := memFS.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := memFS.Symlink("/home/user/elsewhere", path); err != nil {
			t.Fatal(err)
		}
	}
	tests := []struct {
		name        string
		state       registry.FileState
		onDisk      func(t *testing.T, memFS *fs.MemFS)
		wantRemoved bool
		wantWarning string
	}{
		{name: "a recorded file", state: registry.FileState{FileType: "completion", LastOperation: "writeFile"}, onDisk: writeFile, wantRemoved: true},
		{name: "a shim that is a symlink", state: registry.FileState{FileType: "shim", LastOperation: "writeFile"}, onDisk: makeLink, wantRemoved: true},
		{name: "an empty directory it created", state: registry.FileState{FileType: "directory", LastOperation: "mkdir"}, onDisk: makeDir, wantRemoved: true},
		{
			name: "a symlink where a file was written", state: registry.FileState{FileType: "completion", LastOperation: "writeFile"},
			onDisk: makeLink, wantWarning: "it is a symlink now, not the file dotfiles wrote",
		},
		{
			name: "a file where a directory was created", state: registry.FileState{FileType: "directory", LastOperation: "mkdir"},
			onDisk: writeFile, wantWarning: "it is no longer the directory dotfiles created",
		},
		{
			name: "a directory it only changed the mode of", state: registry.FileState{FileType: "directory", LastOperation: "chmod"},
			onDisk: makeDir,
		},
		{name: "a path that is gone", state: registry.FileState{FileType: "shim", LastOperation: "writeFile"}, onDisk: func(*testing.T, *fs.MemFS) {}, wantRemoved: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			orch, memFS := declFixture(t)
			var logBuf bytes.Buffer
			orch.logger = logger.New(logger.Config{Writer: &logBuf})
			tt.onDisk(t, memFS)
			st := tt.state
			st.FilePath = path
			st.ToolName = "some-tool"

			if err := orch.removeRecordedPath(context.Background(), "some-tool", &st, declProjectConfig()); err != nil {
				t.Fatalf("removeRecordedPath: %v", err)
			}

			_, err := memFS.Lstat(path)
			if removed := errors.Is(err, os.ErrNotExist); removed != tt.wantRemoved {
				t.Errorf("removed = %v (lstat error %v), want %v", removed, err, tt.wantRemoved)
			}
			if tt.wantWarning != "" && !strings.Contains(logBuf.String(), tt.wantWarning) {
				t.Errorf("log = %q, want a warning containing %q", logBuf.String(), tt.wantWarning)
			}
		})
	}
}

// A registry that cannot be read fails the cleanup as a reported batch failure, so
// generate goes on with the configured tools and exits non-zero.
func TestCleanupOrphanedToolsReportsAnUnreadableRegistry(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening the database: %v", err)
	}
	orch := NewOrchestrator(logger.New(logger.Config{Writer: &bytes.Buffer{}}), newMemFS(), nil, registry.NewRegistry(sqlDB), nil)
	_ = sqlDB.Close()

	err = orch.CleanupOrphanedTools(ctx, nil, declProjectConfig())
	if !errors.Is(err, toolbatch.ErrFailed) || !strings.Contains(err.Error(), "finding orphaned tools") {
		t.Fatalf("CleanupOrphanedTools = %v; want a reported failure to find orphaned tools", err)
	}
}
