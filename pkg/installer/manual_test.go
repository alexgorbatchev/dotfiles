package installer

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestManualInstaller(t *testing.T) {
	fsys := fs.NewMemFS()
	inst := NewManualInstaller(fsys, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "manual" {
		t.Errorf("expected name to be 'manual', got %s", inst.Name())
	}

	if !inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be true")
	}

	t.Run("Install success with binaryPath defaults to symlink", func(t *testing.T) {
		srcPath := "/src/mybinary"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("manual-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		target, err := fsys.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected destPath to be a symlink: %v", err)
		}
		if target != srcPath {
			t.Errorf("expected symlink target %s, got %s", srcPath, target)
		}
	})

	t.Run("Install success with explicit copy true produces regular file", func(t *testing.T) {
		srcPath := "/src/copied-binary"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("copied-payload"), 0644)

		tool := &config.ToolConfig{
			Name: "copytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"copy":       true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "copytool" {
			t.Errorf("expected copytool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "copytool")
		info, err := fsys.Lstat(destPath)
		if err != nil {
			t.Fatalf("lstat %s: %v", destPath, err)
		}
		if !info.Mode().IsRegular() {
			t.Errorf("expected regular file at %s, mode is %v", destPath, info.Mode())
		}
		if info.Mode().Perm() != 0755 {
			t.Errorf("expected mode 0755, got %v", info.Mode().Perm())
		}
	})

	t.Run("Install success with explicit symlink false produces regular file", func(t *testing.T) {
		srcPath := "/src/symlink-false-binary"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("payload"), 0644)

		tool := &config.ToolConfig{
			Name: "symfalse-tool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"symlink":    false,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "symfalse-tool" {
			t.Errorf("expected symfalse-tool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "symfalse-tool")
		info, err := fsys.Lstat(destPath)
		if err != nil {
			t.Fatalf("lstat %s: %v", destPath, err)
		}
		if !info.Mode().IsRegular() {
			t.Errorf("expected regular file at %s, mode is %v", destPath, info.Mode())
		}
	})

	t.Run("Install replaces existing copy with symlink on next install", func(t *testing.T) {
		srcPath := "/src/switch-to-link"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("switch-payload"), 0755)

		toolCopy := &config.ToolConfig{
			Name: "switchtool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"copy":       true,
			},
		}
		if _, err := inst.Install(context.Background(), toolCopy); err != nil {
			t.Fatalf("first install (copy) failed: %v", err)
		}
		destPath := filepath.Join(inst.BinDir, "switchtool")
		info, err := fsys.Lstat(destPath)
		if err != nil || !info.Mode().IsRegular() {
			t.Fatalf("expected regular file after first install, mode=%v err=%v", info.Mode(), err)
		}

		toolLink := &config.ToolConfig{
			Name: "switchtool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
			},
		}
		if _, err := inst.Install(context.Background(), toolLink); err != nil {
			t.Fatalf("second install (link) failed: %v", err)
		}
		target, err := fsys.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected destPath to be a symlink after second install: %v", err)
		}
		if target != srcPath {
			t.Errorf("expected symlink target %s, got %s", srcPath, target)
		}
	})

	t.Run("Install replaces existing symlink with copy on next install", func(t *testing.T) {
		srcPath := "/src/switch-to-copy"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("switch-payload"), 0755)

		toolLink := &config.ToolConfig{
			Name: "linktocopytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
			},
		}
		if _, err := inst.Install(context.Background(), toolLink); err != nil {
			t.Fatalf("first install (link) failed: %v", err)
		}
		destPath := filepath.Join(inst.BinDir, "linktocopytool")
		if _, err := fsys.Readlink(destPath); err != nil {
			t.Fatalf("expected symlink after first install: %v", err)
		}

		toolCopy := &config.ToolConfig{
			Name: "linktocopytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"copy":       true,
			},
		}
		if _, err := inst.Install(context.Background(), toolCopy); err != nil {
			t.Fatalf("second install (copy) failed: %v", err)
		}
		info, err := fsys.Lstat(destPath)
		if err != nil || !info.Mode().IsRegular() {
			t.Fatalf("expected regular file after second install, mode=%v err=%v", info.Mode(), err)
		}
	})

	t.Run("Install success with binaryPath and symlink true", func(t *testing.T) {
		srcPath := "/src/symlinked-binary"
		_ = fsys.MkdirAll("/src", 0755)
		_ = fsys.WriteFile(srcPath, []byte("symlink-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "symtool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"symlink":    true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "symtool" {
			t.Errorf("expected symtool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "symtool")
		target, err := fsys.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected destPath to be a symlink: %v", err)
		}
		if target != srcPath {
			t.Errorf("expected symlink target %s, got %s", srcPath, target)
		}
	})

	t.Run("Install success with binaryPath containing tilde home path and symlink true", func(t *testing.T) {
		homeFS := fs.NewResolvedFS(fs.NewMemFS(), "/home/user")
		instHome := NewManualInstaller(homeFS, nil)
		instHome.BinDir = "/home/user/.generated/binaries/claude/current"

		_ = homeFS.MkdirAll("/home/user/.local/bin", 0755)
		_ = homeFS.WriteFile("/home/user/.local/bin/claude", []byte("claude-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "claude",
			InstallParams: map[string]interface{}{
				"binaryPath": "~/.local/bin/claude",
				"symlink":    true,
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.HomeDir = "/home/user"
		projCfg.Paths.BinariesDir = "/home/user/.generated/binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := instHome.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "claude" {
			t.Errorf("expected claude, got %v", res.Binaries)
		}

		destPath := filepath.Join(instHome.BinDir, "claude")
		target, err := homeFS.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected destPath to be a symlink: %v", err)
		}
		if target != "/home/user/.local/bin/claude" {
			t.Errorf("expected symlink target /home/user/.local/bin/claude, got %s", target)
		}
	})

	t.Run("Install placeholder without binaryPath", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 0 {
			t.Errorf("expected 0 binaries returned, got %v", res.Binaries)
		}
	})

	t.Run("Install success with binaryPath containing placeholder", func(t *testing.T) {
		_ = fsys.MkdirAll(filepath.Join(inst.BinDir, "payload"), 0755)
		_ = fsys.WriteFile(filepath.Join(inst.BinDir, "payload", "mybinary"), []byte("manual-payload-placeholder"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{stagingDir}/payload/mybinary",
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := inst.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected file to be copied to %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil || string(data) != "manual-payload-placeholder" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Install binaryPath with stagingDir copies staged file instead of current", func(t *testing.T) {
		memFS := fs.NewMemFS()
		instStaging := NewManualInstaller(memFS, nil)
		stagingDir := "/home/user/.binaries/mytool/.staging"
		currentDir := "/home/user/.binaries/mytool/current"
		instStaging.BinDir = stagingDir

		// Seed current with old file
		_ = memFS.MkdirAll(filepath.Join(currentDir, "payload"), 0755)
		_ = memFS.WriteFile(filepath.Join(currentDir, "payload", "mybinary"), []byte("old-current-payload"), 0755)

		// Seed staging with new file
		_ = memFS.MkdirAll(filepath.Join(stagingDir, "payload"), 0755)
		_ = memFS.WriteFile(filepath.Join(stagingDir, "payload", "mybinary"), []byte("staged-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{stagingDir}/payload/mybinary",
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := instStaging.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Fatalf("expected [mytool], got %v", res.Binaries)
		}

		destPath := filepath.Join(stagingDir, "mytool")
		data, err := memFS.ReadFile(destPath)
		if err != nil {
			t.Fatalf("reading copied binary: %v", err)
		}
		if string(data) != "staged-payload" {
			t.Errorf("copied content = %q, want %q (staged-payload)", string(data), "staged-payload")
		}
	})

	t.Run("Install binaryPath with stagingDir succeeds on first install when current does not exist", func(t *testing.T) {
		memFS := fs.NewMemFS()
		instStaging := NewManualInstaller(memFS, nil)
		stagingDir := "/home/user/.binaries/mytool/.staging"
		instStaging.BinDir = stagingDir

		// Only staging has the payload
		_ = memFS.MkdirAll(filepath.Join(stagingDir, "payload"), 0755)
		_ = memFS.WriteFile(filepath.Join(stagingDir, "payload", "mybinary"), []byte("first-install-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{stagingDir}/payload/mybinary",
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := instStaging.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Fatalf("expected [mytool], got %v", res.Binaries)
		}

		destPath := filepath.Join(stagingDir, "mytool")
		data, err := memFS.ReadFile(destPath)
		if err != nil {
			t.Fatalf("reading copied binary: %v", err)
		}
		if string(data) != "first-install-payload" {
			t.Errorf("copied content = %q, want %q", string(data), "first-install-payload")
		}
	})

	t.Run("Install binaryPath symlink with stagingDir uses relative link surviving promotion", func(t *testing.T) {
		memFS := fs.NewMemFS()
		instStaging := NewManualInstaller(memFS, nil)
		stagingDir := "/home/user/.binaries/mytool/.staging"
		instStaging.BinDir = stagingDir

		_ = memFS.MkdirAll(filepath.Join(stagingDir, "payload"), 0755)
		_ = memFS.WriteFile(filepath.Join(stagingDir, "payload", "mybinary"), []byte("symlink-payload"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{stagingDir}/payload/mybinary",
				"symlink":    true,
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		res, err := instStaging.Install(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Fatalf("expected [mytool], got %v", res.Binaries)
		}

		linkPath := filepath.Join(stagingDir, "mytool")
		target, err := memFS.Readlink(linkPath)
		if err != nil {
			t.Fatalf("readlink error: %v", err)
		}
		if target != "payload/mybinary" {
			t.Errorf("symlink target = %q, want %q", target, "payload/mybinary")
		}

		// Promotion
		currentDir := "/home/user/.binaries/mytool/current"
		if err := memFS.Rename(stagingDir, currentDir); err != nil {
			t.Fatalf("promotion error: %v", err)
		}
		promotedData, err := memFS.ReadFile(filepath.Join(currentDir, "mytool"))
		if err != nil || string(promotedData) != "symlink-payload" {
			t.Errorf("promoted content = %q, err = %v", string(promotedData), err)
		}
	})

	// {configFileDir} names a setting of the paths block that binaryPath cannot use,
	// which is how a placeholder nothing can fill reaches the installer. Left in place
	// it makes binaryPath relative, and the installer would look for the binary under
	// the directory the command was run from.
	t.Run("Install fails on a binaryPath placeholder nothing can fill", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{configFileDir}/mybinary",
			},
		}

		projCfg := &config.ProjectConfig{}
		projCfg.Paths.BinariesDir = "/home/user/.binaries"
		ctx := config.WithProjectConfig(context.Background(), projCfg)

		_, err := inst.Install(ctx, tool)
		if err == nil {
			t.Fatal("Install() = nil, want it to fail on the unresolvable placeholder")
		}
		for _, want := range []string{"mytool", "binaryPath", "{configFileDir}"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("Install() = %v, want it to name %q", err, want)
			}
		}
	})

	t.Run("Install fails missing source binary", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "/nonexistent/path",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error for missing binary, got nil")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.MkdirAll(inst.BinDir, 0755)
		_ = fsys.WriteFile(destPath, []byte("content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		err := inst.Uninstall(context.Background(), tool, Installation{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be removed")
		}
	})
}

// newManualCopyFixture seeds a non-executable source binary so that a copy which
// merely preserves the source mode cannot pass for one that makes it executable.
func newManualCopyFixture(t *testing.T) (*fs.MemFS, *config.ToolConfig) {
	t.Helper()
	fsys := fs.NewMemFS()
	if err := fsys.MkdirAll("/src", 0755); err != nil {
		t.Fatal(err)
	}
	if err := fsys.WriteFile("/src/payload", []byte("copied-payload"), 0644); err != nil {
		t.Fatal(err)
	}
	tool := &config.ToolConfig{
		Name:          "copytool",
		Binaries:      []interface{}{map[string]interface{}{"name": "copytool"}, map[string]interface{}{"name": "copytool-alias"}},
		InstallParams: map[string]interface{}{"binaryPath": "/src/payload", "copy": true},
	}
	return fsys, tool
}

func TestManualInstallerCopiesExecutableBinary(t *testing.T) {
	const binDir = "/test/bin"
	fsys, tool := newManualCopyFixture(t)
	inst := NewManualInstaller(fsys, nil)
	inst.BinDir = binDir

	res, err := inst.Install(context.Background(), tool)
	if err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	for _, name := range []string{"copytool", "copytool-alias"} {
		if !slices.Contains(res.Binaries, name) {
			t.Errorf("Install() binaries = %v, want it to contain %q", res.Binaries, name)
		}
		destPath := filepath.Join(binDir, name)
		data, err := fsys.ReadFile(destPath)
		if err != nil {
			t.Fatalf("reading %s: %v", destPath, err)
		}
		if string(data) != "copied-payload" {
			t.Errorf("%s content = %q, want %q", destPath, data, "copied-payload")
		}
		info, err := fsys.Stat(destPath)
		if err != nil {
			t.Fatalf("stat %s: %v", destPath, err)
		}
		if got := info.Mode().Perm(); got != 0755 {
			t.Errorf("%s mode = %v, want %v", destPath, got, os.FileMode(0755))
		}
	}
}

func TestManualInstallerCopyErrors(t *testing.T) {
	const binDir = "/test/bin"
	tests := []struct {
		name    string
		failOp  string
		wantErr string
	}{
		{
			name:    "copy fails",
			failOp:  "copyfile",
			wantErr: "copying binary copytool-alias from /src/payload: copyfile denied",
		},
		{
			name:    "chmod fails",
			failOp:  "chmod",
			wantErr: "making binary copytool-alias executable: chmod denied",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS, tool := newManualCopyFixture(t)
			fsys := &faultyFS{FS: memFS, failOp: tt.failOp, failPath: filepath.Join(binDir, "copytool-alias")}
			inst := NewManualInstaller(fsys, nil)
			inst.BinDir = binDir

			_, err := inst.Install(context.Background(), tool)
			if err == nil {
				t.Fatalf("Install() = nil, want %q", tt.wantErr)
			}
			if err.Error() != tt.wantErr {
				t.Errorf("Install() error = %q, want %q", err, tt.wantErr)
			}
		})
	}
}

// TestManualInstallerLeavesBinaryPathIntactWhenAHookLinkedItIntoTheStagingDir reproduces a
// before-install hook that symlinks binaryPath into the staging directory: the install
// must replace the link with a copy, never write through it into the user's file.
func TestManualInstallerLeavesBinaryPathIntactWhenAHookLinkedItIntoTheStagingDir(t *testing.T) {
	const payload = "user-owned-binary"
	root := t.TempDir()
	fsys := &fs.OSFS{}
	binaryPath := filepath.Join(root, "dotfiles", "mytool")
	binDir := filepath.Join(root, "staging")
	for _, dir := range []string{filepath.Dir(binaryPath), binDir} {
		if err := fsys.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := fsys.WriteFile(binaryPath, []byte(payload), 0644); err != nil {
		t.Fatal(err)
	}
	destPath := filepath.Join(binDir, "mytool")
	if err := fsys.Symlink(binaryPath, destPath); err != nil {
		t.Fatal(err)
	}
	inst := NewManualInstaller(fsys, nil)
	inst.BinDir = binDir
	tool := &config.ToolConfig{Name: "mytool", InstallParams: map[string]interface{}{"binaryPath": binaryPath, "copy": true}}

	if _, err := inst.Install(context.Background(), tool); err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	for path, wantMode := range map[string]os.FileMode{binaryPath: 0644, destPath: 0755} {
		info, err := fsys.Lstat(path)
		if err != nil {
			t.Fatalf("Lstat(%s): %v", path, err)
		}
		if !info.Mode().IsRegular() || info.Mode().Perm() != wantMode {
			t.Errorf("%s mode = %v, want a regular file with mode %v", path, info.Mode(), wantMode)
		}
		data, err := fsys.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%s): %v", path, err)
		}
		if string(data) != payload {
			t.Errorf("%s holds %q, want %q", path, data, payload)
		}
	}
}

func TestManualInstaller_Install_PromoteStagedBinaries(t *testing.T) {
	t.Run("promotes binary matching pattern in staging", func(t *testing.T) {
		fsys := fs.NewMemFS()
		stagingDir := "/staging"
		inst := NewManualInstaller(fsys, nil)
		inst.BinDir = stagingDir

		_ = fsys.MkdirAll(stagingDir+"/nested", 0755)
		_ = fsys.WriteFile(stagingDir+"/nested/my-app", []byte("#!/bin/sh\necho hello"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			Binaries: []interface{}{
				map[string]interface{}{"name": "mytool", "pattern": "nested/my-app"},
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("Install() unexpected error = %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Fatalf("Install() binaries = %v, want [\"mytool\"]", res.Binaries)
		}

		promotedPath := stagingDir + "/mytool"
		exists, err := fsys.Exists(promotedPath)
		if err != nil || !exists {
			t.Fatalf("promoted binary not found at %s", promotedPath)
		}
	})

	t.Run("fails when pattern matches nothing in staging", func(t *testing.T) {
		fsys := fs.NewMemFS()
		stagingDir := "/staging"
		inst := NewManualInstaller(fsys, nil)
		inst.BinDir = stagingDir

		_ = fsys.MkdirAll(stagingDir+"/nested", 0755)
		_ = fsys.WriteFile(stagingDir+"/nested/other-file", []byte("data"), 0644)

		tool := &config.ToolConfig{
			Name: "mytool",
			Binaries: []interface{}{
				map[string]interface{}{"name": "mytool", "pattern": "nested/missing-bin"},
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Fatal("expected Install() to fail when pattern matches nothing, got nil")
		}
		var notFound *BinaryNotFoundError
		if !errors.As(err, &notFound) {
			t.Fatalf("expected BinaryNotFoundError, got: %v", err)
		}
	})
}

func TestManualInstallerSymlinkClearingDestination(t *testing.T) {
	t.Run("fails when destPath is a non-empty directory", func(t *testing.T) {
		fsys := fs.NewMemFS()
		inst := NewManualInstaller(fsys, nil)
		inst.BinDir = "/test/bin"

		srcPath := "/src/mybinary"
		if err := fsys.MkdirAll("/src", 0755); err != nil {
			t.Fatal(err)
		}
		if err := fsys.WriteFile(srcPath, []byte("payload"), 0755); err != nil {
			t.Fatal(err)
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		// Create destPath as a non-empty directory
		if err := fsys.MkdirAll(filepath.Join(destPath, "subdir"), 0755); err != nil {
			t.Fatal(err)
		}
		if err := fsys.WriteFile(filepath.Join(destPath, "subdir", "file.txt"), []byte("data"), 0644); err != nil {
			t.Fatal(err)
		}

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"symlink":    true,
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		// Assert that Install returns an error wrapping the removal failure and naming destPath,
		// rather than a "file exists" error from Symlink.
		errMsg := err.Error()
		if !strings.Contains(errMsg, destPath) {
			t.Errorf("expected error to name destPath %q, got %q", destPath, errMsg)
		}
		if !strings.Contains(errMsg, "clearing") {
			t.Errorf("expected error to mention clearing destination, got %q", errMsg)
		}
		if strings.Contains(errMsg, "file exists") {
			t.Errorf("expected removal error, not symlink 'file exists' error, got %q", errMsg)
		}
		if strings.Contains(errMsg, "creating symlink") {
			t.Errorf("expected removal error, not symlink creation error, got %q", errMsg)
		}
		if !errors.Is(err, os.ErrInvalid) {
			t.Errorf("expected error to wrap removal failure (os.ErrInvalid), got %v", err)
		}
	})

	t.Run("ignores os.ErrNotExist and creates link when destPath does not exist", func(t *testing.T) {
		fsys := fs.NewMemFS()
		inst := NewManualInstaller(fsys, nil)
		inst.BinDir = "/test/bin"

		srcPath := "/src/mybinary"
		if err := fsys.MkdirAll("/src", 0755); err != nil {
			t.Fatal(err)
		}
		if err := fsys.WriteFile(srcPath, []byte("payload"), 0755); err != nil {
			t.Fatal(err)
		}

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": srcPath,
				"symlink":    true,
			},
		}

		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil {
			t.Fatal(err)
		}
		if exists {
			t.Fatalf("expected destPath %s to not exist initially", destPath)
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected [mytool], got %v", res.Binaries)
		}

		target, err := fsys.Readlink(destPath)
		if err != nil {
			t.Fatalf("expected symlink at %s, got error: %v", destPath, err)
		}
		if target != srcPath {
			t.Errorf("expected symlink target %s, got %s", srcPath, target)
		}
	})
}
