package orchestrator

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

const (
	copyToolDir    = "/home/user/tools/copy-tool"
	copyToolTarget = "/home/user/.config/copy-tool/config.toml"
)

// writeMemFile writes content at path, creating the parent directories MemFS insists on.
func writeMemFile(t *testing.T, memFS fs.FS, path, content string) {
	t.Helper()
	if err := memFS.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("creating %s: %v", filepath.Dir(path), err)
	}
	if err := memFS.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
}

func newCopyTool(copies ...config.CopyConfig) *config.ToolConfig {
	return &config.ToolConfig{
		Name:           "copy-tool",
		ConfigFilePath: copyToolDir + "/copy-tool.tool.ts",
		Copies:         copies,
	}
}

func copyProjectConfig() *config.ProjectConfig {
	return &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/.generated/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
}

// recordedCopy returns the live registry state of path as a "copy" of toolName, or nil.
func recordedCopy(t *testing.T, orch *Orchestrator, toolName, path string) *registry.FileState {
	t.Helper()
	states, err := orch.reg.GetFileStatesForTool(context.Background(), toolName)
	if err != nil {
		t.Fatalf("reading file states: %v", err)
	}
	for i := range states {
		if states[i].FilePath == path && states[i].FileType == "copy" && states[i].LastOperation != "rm" {
			return states[i]
		}
	}
	return nil
}

// .copy(src, dst) places the source at the target on generate. A target that already
// holds a file dotfiles never wrote is moved aside to a backup under the default
// policy, an older backup being kept rather than replaced, and a target that already
// matches the source is left untouched and adopted, so a repeated generate makes no
// new backup at all.
func TestGenerateTool_AppliesCopies(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		existing   map[string]string
		wantBackup string
		// wantSecond is the numbered backup made when the plain name was taken.
		wantSecond string
	}{
		{name: "target absent"},
		{
			name:       "target holds a foreign file",
			existing:   map[string]string{copyToolTarget: "user"},
			wantBackup: "user",
		},
		{
			name:       "a previous backup is kept and the new one goes beside it",
			existing:   map[string]string{copyToolTarget: "user", copyToolTarget + ".bak": "older"},
			wantBackup: "older",
			wantSecond: "user",
		},
		{
			name:       "an identical target is left alone",
			existing:   map[string]string{copyToolTarget: "managed", copyToolTarget + ".bak": "older"},
			wantBackup: "older",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := newMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed")
			for path, content := range tt.existing {
				writeMemFile(t, memFS, path, content)
			}

			tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
			if err := orch.GenerateTool(ctx, tool, copyProjectConfig()); err != nil {
				t.Fatalf("GenerateTool: %v", err)
			}

			got, err := memFS.ReadFile(copyToolTarget)
			if err != nil {
				t.Fatalf("copy target was not written: %v", err)
			}
			if string(got) != "managed" {
				t.Errorf("copy target = %q, want %q", string(got), "managed")
			}

			backup, err := memFS.ReadFile(copyToolTarget + ".bak")
			switch {
			case tt.wantBackup == "" && err == nil:
				t.Errorf("unexpected backup %q", string(backup))
			case tt.wantBackup != "" && err != nil:
				t.Errorf("expected backup %q: %v", tt.wantBackup, err)
			case tt.wantBackup != "" && string(backup) != tt.wantBackup:
				t.Errorf("backup = %q, want %q", string(backup), tt.wantBackup)
			}

			second, secondErr := memFS.ReadFile(copyToolTarget + ".bak.2")
			switch {
			case tt.wantSecond == "" && secondErr == nil:
				t.Errorf("unexpected second backup %q", string(second))
			case tt.wantSecond != "" && secondErr != nil:
				t.Errorf("expected second backup %q: %v", tt.wantSecond, secondErr)
			case tt.wantSecond != "" && string(second) != tt.wantSecond:
				t.Errorf("second backup = %q, want %q", string(second), tt.wantSecond)
			}

			if recordedCopy(t, orch, "copy-tool", copyToolTarget) == nil {
				t.Errorf("target %s was not recorded as a copy of copy-tool", copyToolTarget)
			}
		})
	}
}

// A directory source is copied as a tree. Its members sit inside the declared target,
// so the stale-copy cleanup keeps them while the declaration stands and removes them
// once it is gone.
func TestGenerateTool_CopiesDirectoryTree(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	projCfg := copyProjectConfig()
	writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "dark")
	writeMemFile(t, memFS, copyToolDir+"/themes/extra/light.toml", "light")

	tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes"})
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool: %v", err)
	}

	copied := map[string]string{
		"/home/user/.config/copy-tool/themes/dark.toml":        "dark",
		"/home/user/.config/copy-tool/themes/extra/light.toml": "light",
	}
	for path, want := range copied {
		got, err := memFS.ReadFile(path)
		if err != nil {
			t.Fatalf("%s was not copied: %v", path, err)
		}
		if string(got) != want {
			t.Errorf("%s = %q, want %q", path, string(got), want)
		}
		if recordedCopy(t, orch, "copy-tool", path) == nil {
			t.Errorf("%s was not recorded as a copy", path)
		}
	}

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies: %v", err)
	}
	for path := range copied {
		if exists, _ := memFS.Exists(path); !exists {
			t.Errorf("%s was removed while its directory is still declared", path)
		}
	}

	if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{newCopyTool()}, projCfg); err != nil {
		t.Fatalf("CleanupStaleCopies without declaration: %v", err)
	}
	for path := range copied {
		if exists, _ := memFS.Exists(path); exists {
			t.Errorf("%s survived the removal of its declaration", path)
		}
	}
}

func TestGenerateTool_CopyMissingSourceFails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	tool := newCopyTool(config.CopyConfig{Source: "./missing.toml", Target: "~/.config/copy-tool/config.toml"})
	err := orch.GenerateTool(ctx, tool, copyProjectConfig())
	if err == nil {
		t.Fatal("expected an error for a missing copy source")
	}
	if !strings.Contains(err.Error(), "./missing.toml") {
		t.Errorf("error %q does not name the source", err)
	}
	if exists, _ := memFS.Exists(copyToolTarget); exists {
		t.Errorf("target was created from a missing source")
	}
}

// The install pipeline applies copies too, so a tool installed for the first time
// gets its configuration files without a separate generate.
func TestInstallTool_AppliesCopies(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")
	if err := orch.instRegistry.Register(&mockInstaller{name: "mock-copy"}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}
	writeMemFile(t, memFS, copyToolDir+"/config.toml", "managed")

	tool := newCopyTool(config.CopyConfig{Source: "./config.toml", Target: "~/.config/copy-tool/config.toml"})
	tool.InstallationMethod = "mock-copy"
	if err := orch.InstallTool(ctx, tool, copyProjectConfig()); err != nil {
		t.Fatalf("InstallTool: %v", err)
	}

	got, err := memFS.ReadFile(copyToolTarget)
	if err != nil {
		t.Fatalf("copy target was not written by install: %v", err)
	}
	if string(got) != "managed" {
		t.Errorf("copy target = %q, want %q", string(got), "managed")
	}
}

// A copied directory is settled file by file: an identical tree is left alone, a
// member whose source changed is updated in place, a file the copy does not own is
// left where it is, and only something that is not a directory at the target (a
// plain file or a symlink) is moved aside to <target>.bak under the default policy.
func TestGenerateTool_CopyDirectoryPolicy(t *testing.T) {
	t.Parallel()
	const themesTarget = "/home/user/.config/copy-tool/themes"

	tests := []struct {
		name         string
		beforeSecond func(t *testing.T, memFS fs.FS)
		wantBackup   func(t *testing.T, memFS fs.FS)
	}{
		{
			name:         "identical tree is left alone",
			beforeSecond: func(t *testing.T, memFS fs.FS) {},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				if exists, _ := memFS.Exists(themesTarget + ".bak"); exists {
					t.Errorf("an unchanged tree was backed up")
				}
			},
		},
		{
			name: "a changed source member is updated in place",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "darker")
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				if exists, _ := memFS.Exists(themesTarget + ".bak"); exists {
					t.Errorf("an untouched tree was backed up for an upstream update")
				}
				got, _ := memFS.ReadFile(themesTarget + "/dark.toml")
				if string(got) != "darker" {
					t.Errorf("target dark.toml = %q, want %q", string(got), "darker")
				}
			},
		},
		{
			name: "an extra member at the target is left alone",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				writeMemFile(t, memFS, themesTarget+"/user.toml", "mine")
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				if exists, _ := memFS.Exists(themesTarget + ".bak"); exists {
					t.Errorf("the tree was backed up for a file the copy does not own")
				}
				mine, err := memFS.ReadFile(themesTarget + "/user.toml")
				if err != nil || string(mine) != "mine" {
					t.Errorf("user.toml = %q, %v; want %q", string(mine), err, "mine")
				}
			},
		},
		{
			name: "a file where the directory belongs is backed up",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				if err := memFS.RemoveAll(themesTarget); err != nil {
					t.Fatalf("removing tree: %v", err)
				}
				writeMemFile(t, memFS, themesTarget, "not a directory")
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				old, err := memFS.ReadFile(themesTarget + ".bak")
				if err != nil || string(old) != "not a directory" {
					t.Errorf("backup = %q, %v; want %q", string(old), err, "not a directory")
				}
			},
		},
		{
			name: "a symlink where the directory belongs is backed up",
			beforeSecond: func(t *testing.T, memFS fs.FS) {
				if err := memFS.RemoveAll(themesTarget); err != nil {
					t.Fatalf("removing tree: %v", err)
				}
				if err := memFS.Symlink(copyToolDir+"/themes", themesTarget); err != nil {
					t.Fatalf("creating symlink: %v", err)
				}
			},
			wantBackup: func(t *testing.T, memFS fs.FS) {
				info, err := memFS.Lstat(themesTarget + ".bak")
				if err != nil || info.Mode()&os.ModeSymlink == 0 {
					t.Errorf("expected the symlink to be kept as the backup, got %v, %v", info, err)
				}
				info, err = memFS.Lstat(themesTarget)
				if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
					t.Errorf("expected a real directory at the target, got %v, %v", info, err)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := newMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			projCfg := copyProjectConfig()
			writeMemFile(t, memFS, copyToolDir+"/themes/dark.toml", "dark")
			writeMemFile(t, memFS, copyToolDir+"/themes/extra/light.toml", "light")
			tool := newCopyTool(config.CopyConfig{Source: "./themes", Target: "~/.config/copy-tool/themes"})

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("first GenerateTool: %v", err)
			}
			tt.beforeSecond(t, memFS)
			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("second GenerateTool: %v", err)
			}

			light, err := memFS.ReadFile(themesTarget + "/extra/light.toml")
			if err != nil || string(light) != "light" {
				t.Errorf("target extra/light.toml = %q, %v; want %q", string(light), err, "light")
			}
			if recordedCopy(t, orch, "copy-tool", themesTarget+"/extra/light.toml") == nil {
				t.Errorf("extra/light.toml is not recorded as a copy after the second run")
			}
			tt.wantBackup(t, memFS)
		})
	}
}

func TestIsWithin(t *testing.T) {
	t.Parallel()
	tests := []struct {
		dir, path string
		want      bool
	}{
		{"/home/user/.config/tool", "/home/user/.config/tool", true},
		{"/home/user/.config/tool", "/home/user/.config/tool/themes/dark.toml", true},
		{"/home/user/.config/tool", "/home/user/.config/tool.bak", false},
		{"/home/user/.config/tool", "/home/user/.config/other", false},
		{"/home/user/.config/tool", "/home/user", false},
		{"/home/user/.config/tool", "relative/path", false},
	}
	for _, tt := range tests {
		if got := isWithin(tt.dir, tt.path); got != tt.want {
			t.Errorf("isWithin(%q, %q) = %v, want %v", tt.dir, tt.path, got, tt.want)
		}
	}
}

func TestIsWithinCoverage(t *testing.T) {
	tests := []struct {
		dir  string
		path string
		want bool
	}{
		{"/a/b", "/a/b", true},
		{"/a/b", "/a/b/c", true},
		{"/a/b", "/a/b/c/d", true},
		{"/a/b", "/a/c", false},
		{"/a/b", "/a", false},
		{"/a/b", "/other/path", false},
	}

	for _, tt := range tests {
		got := isWithin(tt.dir, tt.path)
		if got != tt.want {
			t.Errorf("isWithin(%q, %q) = %v, want %v", tt.dir, tt.path, got, tt.want)
		}
	}
}
