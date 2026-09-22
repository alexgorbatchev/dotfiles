package installer

import (
	"context"
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

	t.Run("Install success with binaryPath", func(t *testing.T) {
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
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected file to be copied to %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil || string(data) != "manual-payload" {
			t.Errorf("unexpected content: %s", string(data))
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
		_ = fsys.MkdirAll("/home/user/.binaries/mytool/current", 0755)
		_ = fsys.WriteFile("/home/user/.binaries/mytool/current/mybinary", []byte("manual-payload-placeholder"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"binaryPath": "{stagingDir}/mybinary",
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

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be removed")
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "mytool"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil || res.Outdated != nil || res.LatestVersion != "" {
			t.Errorf("unexpected: %v, %v", res, err)
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
		InstallParams: map[string]interface{}{"binaryPath": "/src/payload"},
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
