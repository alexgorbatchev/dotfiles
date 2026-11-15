package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

func TestOrchestrator_CleanupMountPoint_UninstallRefusesWhenDetachFails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	// Register an Hdiutil that fails detach even with -force
	archivetest.Hdiutil{
		FS:     fsys,
		Detach: func(force bool) error { return archivetest.ErrResourceBusy },
	}.Register(runner)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name: "slack",
	}

	// Create a mount point under the tool's binaries directory
	mountPoint := "/home/user/binaries/slack/current/slack-mount"
	volumeFile := filepath.Join(mountPoint, "Slack.app", "Contents", "MacOS", "slack")
	if err := fsys.MkdirAll(filepath.Dir(volumeFile), 0755); err != nil {
		t.Fatalf("creating volume dirs: %v", err)
	}
	if err := fsys.WriteFile(volumeFile, []byte("app-binary"), 0755); err != nil {
		t.Fatalf("writing volume file: %v", err)
	}

	// UninstallTool should fail because detach failed
	err = orch.UninstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected UninstallTool to fail when mount point cannot be detached, got nil")
	}

	// Error must name the mount point and instruct hdiutil detach -force
	if !strings.Contains(err.Error(), mountPoint) {
		t.Fatalf("expected error to name mount point %q, got: %v", mountPoint, err)
	}
	if !strings.Contains(err.Error(), "hdiutil detach -force") {
		t.Fatalf("expected error to instruct 'hdiutil detach -force', got: %v", err)
	}

	// Most importantly: RemoveAll must NOT have descended into the mounted volume!
	exists, err := fsys.Exists(volumeFile)
	if err != nil || !exists {
		t.Fatalf("expected volume file %q to be preserved, but it was deleted", volumeFile)
	}
}

func TestOrchestrator_CleanupMountPoint_UninstallDetachesAndRemoves(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	// Register an Hdiutil where detach succeeds
	archivetest.Hdiutil{
		FS: fsys,
	}.Register(runner)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name: "slack",
	}

	// Create mount point under tool's binaries dir
	mountPoint := "/home/user/binaries/slack/current/slack-mount"
	volumeFile := filepath.Join(mountPoint, "Slack.app", "Contents", "MacOS", "slack")
	if err := fsys.MkdirAll(filepath.Dir(volumeFile), 0755); err != nil {
		t.Fatalf("creating volume dirs: %v", err)
	}
	if err := fsys.WriteFile(volumeFile, []byte("app-binary"), 0755); err != nil {
		t.Fatalf("writing volume file: %v", err)
	}

	// UninstallTool should succeed
	err = orch.UninstallTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("expected UninstallTool to succeed, got: %v", err)
	}

	// Verify hdiutil detach was called
	calls := archivetest.Calls(runner)
	detached := false
	for _, call := range calls {
		if len(call) >= 2 && call[0] == "detach" && call[1] == mountPoint {
			detached = true
			break
		}
	}
	if !detached {
		t.Fatalf("expected hdiutil detach call on %s, calls: %v", mountPoint, calls)
	}

	// Verify the tool binaries directory is completely removed
	exists, err := fsys.Exists("/home/user/binaries/slack")
	if err != nil || exists {
		t.Fatalf("expected tool binaries dir to be removed, exists: %v", exists)
	}
}

func TestOrchestrator_CleanupMountPoint_StaleStagingRefusesWhenDetachFails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	archivetest.Hdiutil{
		FS:     fsys,
		Detach: func(force bool) error { return archivetest.ErrResourceBusy },
	}.Register(runner)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.DefaultRegistry()

	orch := NewOrchestrator(nil, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:     "/home/user",
			TargetDir:   "/home/user/bin",
			BinariesDir: "/home/user/binaries",
		},
	}

	tool := &config.ToolConfig{
		Name:               "slack",
		InstallationMethod: "github-release",
		InstallParams:      map[string]any{"repo": "owner/repo"},
	}

	// Sibling mount point (from DMG extraction)
	stagingDir := "/home/user/binaries/slack/.staging"
	mountPoint := "/home/user/binaries/slack/..staging.dmg-mount"
	volumeFile := filepath.Join(mountPoint, "Slack.app", "Contents", "MacOS", "slack")
	if err := fsys.MkdirAll(filepath.Dir(volumeFile), 0755); err != nil {
		t.Fatalf("creating volume dirs: %v", err)
	}
	if err := fsys.WriteFile(volumeFile, []byte("app-binary"), 0755); err != nil {
		t.Fatalf("writing volume file: %v", err)
	}
	if err := fsys.MkdirAll(stagingDir, 0755); err != nil {
		t.Fatalf("creating staging dir: %v", err)
	}

	// InstallTool should fail in stale staging cleanup
	err = orch.InstallTool(ctx, tool, projCfg)
	if err == nil {
		t.Fatal("expected InstallTool to fail on stale staging cleanup when detach fails, got nil")
	}

	if !strings.Contains(err.Error(), mountPoint) {
		t.Fatalf("expected error to name mount point %q, got: %v", mountPoint, err)
	}
	if !strings.Contains(err.Error(), "hdiutil detach -force") {
		t.Fatalf("expected error to instruct 'hdiutil detach -force', got: %v", err)
	}

	// Volume file must still exist
	exists, err := fsys.Exists(volumeFile)
	if err != nil || !exists {
		t.Fatalf("expected volume file %q to be preserved, but it was deleted", volumeFile)
	}
}

func TestOrchestrator_CleanupMountPoint_DiscardStagingProtectsMountPoint(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	archivetest.Hdiutil{
		FS:     fsys,
		Detach: func(force bool) error { return archivetest.ErrResourceBusy },
	}.Register(runner)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(nil, fsys, runner, reg, nil)
	stagingDir := "/home/user/binaries/slack/.staging"
	mountPoint := filepath.Join(stagingDir, "sub-mount")
	volumeFile := filepath.Join(mountPoint, "some-volume-file")
	if err := fsys.MkdirAll(filepath.Dir(volumeFile), 0755); err != nil {
		t.Fatalf("creating dirs: %v", err)
	}
	if err := fsys.WriteFile(volumeFile, []byte("data"), 0755); err != nil {
		t.Fatalf("writing file: %v", err)
	}

	orch.discardStaging(ctx, "slack", stagingDir)

	// Because detach failed, discardStaging must NOT have removed the mount point or descended into it
	exists, err := fsys.Exists(volumeFile)
	if err != nil || !exists {
		t.Fatalf("expected volume file %q to be preserved after discardStaging, but it was deleted", volumeFile)
	}
}

func TestOrchestrator_SafeRemoveAll_EdgeCases(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()
	orch := NewOrchestrator(nil, fsys, runner, nil, nil)
	t.Run("dry run preserves host mounts", func(t *testing.T) {
		const mountPath = "/dry-run/example.dmg-mount"
		if err := fsys.MkdirAll(mountPath, 0755); err != nil {
			t.Fatal(err)
		}
		if err := orch.safeRemoveAll(config.WithDryRun(ctx, true), fsys, mountPath); err != nil {
			t.Fatal(err)
		}
		if len(runner.History) != 0 {
			t.Fatalf("dry run invoked mount detachment: %+v", runner.History)
		}
		if exists, _ := fsys.Exists(mountPath); exists {
			t.Fatal("dry run did not remove simulated mount directory")
		}
	})

	// 1. Empty path returns nil
	if err := orch.safeRemoveAll(ctx, fsys, ""); err != nil {
		t.Fatalf("expected nil for empty path, got: %v", err)
	}

	// 2. Non-existent path returns nil
	if err := orch.safeRemoveAll(ctx, fsys, "/does/not/exist"); err != nil {
		t.Fatalf("expected nil for non-existent path, got: %v", err)
	}

	// 3. Regular file removes file
	filePath := "/tmp/testfile"
	if err := fsys.MkdirAll("/tmp", 0755); err != nil {
		t.Fatalf("creating tmp dir: %v", err)
	}
	if err := fsys.WriteFile(filePath, []byte("hello"), 0644); err != nil {
		t.Fatalf("writing file: %v", err)
	}
	if err := orch.safeRemoveAll(ctx, fsys, filePath); err != nil {
		t.Fatalf("expected file to be removed, got: %v", err)
	}
	if exists, _ := fsys.Exists(filePath); exists {
		t.Fatal("expected file to be gone")
	}

	// 4. Runner nil when mount point exists returns error
	mountPath := "/tmp/foo-mount"
	if err := fsys.MkdirAll(mountPath, 0755); err != nil {
		t.Fatalf("creating mount dir: %v", err)
	}
	orchNilRunner := NewOrchestrator(nil, fsys, nil, nil, nil)
	err := orchNilRunner.safeRemoveAll(ctx, fsys, mountPath)
	if err == nil || !strings.Contains(err.Error(), "hdiutil detach -force") {
		t.Fatalf("expected nil runner to refuse removal with hdiutil detach -force, got: %v", err)
	}

	// 5. Path itself is a mount point and detaching succeeds
	archivetest.Hdiutil{FS: fsys}.Register(runner)
	if err := orch.safeRemoveAll(ctx, fsys, mountPath); err != nil {
		t.Fatalf("expected mount point itself to be safely detached and removed, got: %v", err)
	}
	if exists, _ := fsys.Exists(mountPath); exists {
		t.Fatal("expected mount point to be gone")
	}

	// 6. Tree with symlink and normal files and nested mount point
	treeDir := "/tmp/tree"
	subDir := filepath.Join(treeDir, "sub")
	nestedMount := filepath.Join(subDir, "app.dmg-mount")
	normalFile := filepath.Join(treeDir, "file.txt")
	symlinkPath := filepath.Join(treeDir, "link")

	if err := fsys.MkdirAll(nestedMount, 0755); err != nil {
		t.Fatalf("creating dirs: %v", err)
	}
	if err := fsys.WriteFile(normalFile, []byte("data"), 0644); err != nil {
		t.Fatalf("writing normal file: %v", err)
	}
	if err := fsys.Symlink(normalFile, symlinkPath); err != nil {
		t.Fatalf("creating symlink: %v", err)
	}

	if err := orch.safeRemoveAll(ctx, fsys, treeDir); err != nil {
		t.Fatalf("expected tree with mount to be safely detached and removed, got: %v", err)
	}
	if exists, _ := fsys.Exists(treeDir); exists {
		t.Fatal("expected treeDir to be removed")
	}
}

func TestOrchestrator_IsMountPoint_Cases(t *testing.T) {
	t.Parallel()
	fsys := newMemFS()

	// Non-existent path is false
	if isMountPoint(fsys, "/nonexistent") {
		t.Fatal("expected false for nonexistent path")
	}

	// Regular file is false
	file := "/file.txt"
	_ = fsys.WriteFile(file, []byte("hi"), 0644)
	if isMountPoint(fsys, file) {
		t.Fatal("expected false for regular file")
	}

	// Normal directory is false
	dir := "/normal"
	_ = fsys.MkdirAll(dir, 0755)
	if isMountPoint(fsys, dir) {
		t.Fatal("expected false for normal dir")
	}

	// Directory ending in -mount is true
	mountDir := "/normal/tool-mount"
	_ = fsys.MkdirAll(mountDir, 0755)
	if !isMountPoint(fsys, mountDir) {
		t.Fatal("expected true for -mount dir")
	}

	// Directory ending in .dmg-mount is true
	dmgMountDir := "/normal/..staging.dmg-mount"
	_ = fsys.MkdirAll(dmgMountDir, 0755)
	if !isMountPoint(fsys, dmgMountDir) {
		t.Fatal("expected true for .dmg-mount dir")
	}

	// fileDev nil info
	if _, ok := fileDev(nil); ok {
		t.Fatal("expected false for nil info")
	}
}

type safeRemoveAllErrFS struct {
	fs.FS
	existsErr  error
	lstatErr   error
	readDirErr error
}

func (s *safeRemoveAllErrFS) Exists(path string) (bool, error) {
	if s.existsErr != nil {
		return false, s.existsErr
	}
	return s.FS.Exists(path)
}

func (s *safeRemoveAllErrFS) Lstat(path string) (os.FileInfo, error) {
	if s.lstatErr != nil {
		return nil, s.lstatErr
	}
	return s.FS.Lstat(path)
}

func (s *safeRemoveAllErrFS) ReadDir(path string) ([]string, error) {
	if s.readDirErr != nil {
		return nil, s.readDirErr
	}
	return s.FS.ReadDir(path)
}

func TestOrchestrator_SafeRemoveAll_Errors(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	memFS := newMemFS()
	runner := exec.NewMockRunner()

	// Exists error
	errFS := &safeRemoveAllErrFS{FS: memFS, existsErr: errors.New("exists failed")}
	orch := NewOrchestrator(nil, errFS, runner, nil, nil)
	if err := orch.safeRemoveAll(ctx, errFS, "/some/path"); err == nil || !strings.Contains(err.Error(), "exists failed") {
		t.Fatalf("expected exists failed error, got: %v", err)
	}

	// Lstat error
	_ = memFS.MkdirAll("/some/dir", 0755)
	errFS = &safeRemoveAllErrFS{FS: memFS, lstatErr: errors.New("lstat failed")}
	orch = NewOrchestrator(nil, errFS, runner, nil, nil)
	if err := orch.safeRemoveAll(ctx, errFS, "/some/dir"); err == nil || !strings.Contains(err.Error(), "lstat failed") {
		t.Fatalf("expected lstat failed error, got: %v", err)
	}

	// ReadDir error in findMountPoints
	errFS = &safeRemoveAllErrFS{FS: memFS, readDirErr: errors.New("readdir failed")}
	orch = NewOrchestrator(nil, errFS, runner, nil, nil)
	if err := orch.safeRemoveAll(ctx, errFS, "/some/dir"); err == nil || !strings.Contains(err.Error(), "readdir failed") {
		t.Fatalf("expected readdir failed error, got: %v", err)
	}
}

func TestOrchestrator_FileDev_Host(t *testing.T) {
	t.Parallel()
	if info, err := os.Stat("."); err == nil {
		dev, ok := fileDev(info)
		if !ok || dev == 0 {
			t.Fatalf("expected valid dev from host os.Stat, got %d, %v", dev, ok)
		}
	}
}

func TestRemoveAllAndHealthCheckEdgeCases(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// 1. removeAll non-existent
	err = memFS.RemoveAll("/nonexistent/path")
	if err != nil {
		t.Errorf("removeAll non-existent returned error: %v", err)
	}

	// 2. removeAll existing
	_ = memFS.MkdirAll("/dir-to-rm", 0755)
	_ = memFS.WriteFile("/dir-to-rm/f.txt", []byte("a"), 0644)
	err = memFS.RemoveAll("/dir-to-rm")
	if err != nil {
		t.Errorf("removeAll existing failed: %v", err)
	}

	// 3. isExistingInstallationHealthy with missing install path
	tool := &config.ToolConfig{
		Name:     "bat",
		Binaries: testutil.DeclaredBinaries("bat"),
	}
	instRecordMissingPath := &registry.ToolInstallationRecord{
		ToolName:    "bat",
		InstallPath: "/nonexistent/install/path/bat",
	}
	if orch.isExistingInstallationHealthy(ctx, "bat", instRecordMissingPath, tool, projCfg) {
		t.Error("expected unhealthy for missing install path")
	}

	// 4. isExistingInstallationHealthy with missing current dir
	_ = memFS.MkdirAll("/opt/bat", 0755)
	_ = memFS.WriteFile("/opt/bat/bat", []byte("bin"), 0755)
	instRecordValidPath := &registry.ToolInstallationRecord{
		ToolName:    "bat",
		InstallPath: "/opt/bat/bat",
	}
	if orch.isExistingInstallationHealthy(ctx, "bat", instRecordValidPath, tool, projCfg) {
		t.Error("expected unhealthy for missing current dir")
	}

	// 5. isExistingInstallationHealthy with missing binary in current dir
	_ = memFS.MkdirAll("/home/test/.binaries/bat/current", 0755)
	if orch.isExistingInstallationHealthy(ctx, "bat", instRecordValidPath, tool, projCfg) {
		t.Error("expected unhealthy for missing binary in current dir")
	}

	// 6. Healthy installation when binary exists in current dir
	_ = memFS.WriteFile("/home/test/.binaries/bat/current/bat", []byte("bin"), 0755)
	if !orch.isExistingInstallationHealthy(ctx, "bat", instRecordValidPath, tool, projCfg) {
		t.Error("expected healthy for valid binary in current dir")
	}
}

func TestRemoveAllNonEmptyDirectory(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
	nestedDir := "/test/dir/sub/nested"
	_ = memFS.MkdirAll(nestedDir, 0755)
	_ = memFS.WriteFile(filepath.Join(nestedDir, "file.txt"), []byte("data"), 0644)

	err := memFS.RemoveAll("/test/dir")
	if err != nil {
		t.Fatalf("removeAll failed on non-empty nested directory: %v", err)
	}

	exists, _ := memFS.Exists("/test/dir")
	if exists {
		t.Errorf("expected /test/dir to be completely removed")
	}

	// Non-existent path returns nil
	if err := memFS.RemoveAll("/non/existent"); err != nil {
		t.Errorf("expected nil for non-existent path, got: %v", err)
	}
}

func TestRemoveAllCoverage(t *testing.T) {
	memFS := newMemFS()
	_ = memFS.MkdirAll("/nested/sub/dir", 0755)
	_ = memFS.WriteFile("/nested/sub/dir/file.txt", []byte("hello"), 0644)
	_ = memFS.WriteFile("/nested/sub/file2.txt", []byte("world"), 0644)

	if err := memFS.RemoveAll("/nested"); err != nil {
		t.Fatalf("removeAll failed: %v", err)
	}
	exists, _ := memFS.Exists("/nested")
	if exists {
		t.Errorf("expected /nested to be removed")
	}

	// Non-existent path returns nil
	if err := memFS.RemoveAll("/does-not-exist"); err != nil {
		t.Errorf("expected nil for non-existent path, got: %v", err)
	}
}

func TestRequireStagedPayloadAndDiscardStaging(t *testing.T) {
	ctx := context.Background()
	memFS := newMemFS()
	orch := newTestOrchestrator(t, memFS, "")

	// 1. discardStaging with empty string returns immediately
	orch.discardStaging(ctx, "tool", "")

	// 2. requireStagedPayload on tool without before-install hook returns nil
	toolNoHook := &config.ToolConfig{Name: "no-hook"}
	if err := orch.requireStagedPayload(ctx, toolNoHook, memFS, "/staging"); err != nil {
		t.Errorf("expected nil for tool without hook, got: %v", err)
	}

	// 3. tool with before-install hook
	toolWithHook := &config.ToolConfig{
		Name: "hook-tool",
		InstallParams: map[string]interface{}{
			"hooks": []any{vm.HookBeforeInstall},
		},
	}

	// 3a. ReadDir fails on unreadable/missing staging directory
	if err := orch.requireStagedPayload(ctx, toolWithHook, memFS, "/missing-staging"); err == nil {
		t.Error("expected error when staging dir does not exist")
	}

	// 3b. Staging dir exists but is empty
	_ = memFS.MkdirAll("/empty-staging", 0755)
	if err := orch.requireStagedPayload(ctx, toolWithHook, memFS, "/empty-staging"); err == nil {
		t.Error("expected error when staging dir is empty")
	}

	// 3c. Staging dir exists and has files
	_ = memFS.MkdirAll("/pop-staging", 0755)
	_ = memFS.WriteFile("/pop-staging/bin", []byte("data"), 0755)
	if err := orch.requireStagedPayload(ctx, toolWithHook, memFS, "/pop-staging"); err != nil {
		t.Errorf("expected nil when staging dir has payload, got: %v", err)
	}
}
