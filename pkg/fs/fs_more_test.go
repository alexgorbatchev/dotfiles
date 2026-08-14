package fs

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestResolvedFSAllMethods(t *testing.T) {
	mem := NewMemFS()
	rFS := NewResolvedFS(mem, "/home/testuser")

	rFS.SetHomeDir("/home/testuser")
	if rFS.HomeDir() != "/home/testuser" {
		t.Errorf("HomeDir mismatch: %q", rFS.HomeDir())
	}

	// 1. MkdirAll and WriteFile with ~/
	err := rFS.MkdirAll("~/workspace/sub", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	err = rFS.WriteFile("~/workspace/sub/f1.txt", []byte("data1"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// 2. ReadFile, Exists, Stat, Lstat
	data, err := rFS.ReadFile("~/workspace/sub/f1.txt")
	if err != nil || string(data) != "data1" {
		t.Errorf("ReadFile failed: %v, %q", err, string(data))
	}

	exists, err := rFS.Exists("~/workspace/sub/f1.txt")
	if err != nil || !exists {
		t.Errorf("Exists failed: %v, %v", err, exists)
	}

	st, err := rFS.Stat("~/workspace/sub/f1.txt")
	if err != nil || st.Size() != 5 {
		t.Errorf("Stat failed: %v", err)
	}

	lst, err := rFS.Lstat("~/workspace/sub/f1.txt")
	if err != nil || lst.Size() != 5 {
		t.Errorf("Lstat failed: %v", err)
	}

	// 3. Create, Open, ReadDir, Chmod
	wc, err := rFS.Create("~/workspace/sub/f2.txt")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	_, _ = wc.Write([]byte("data2"))
	_ = wc.Close()

	rc, err := rFS.Open("~/workspace/sub/f2.txt")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	_ = rc.Close()

	entries, err := rFS.ReadDir("~/workspace/sub")
	if err != nil || len(entries) != 2 {
		t.Errorf("ReadDir failed: %v, len=%d", err, len(entries))
	}

	err = rFS.Chmod("~/workspace/sub/f2.txt", 0755)
	if err != nil {
		t.Errorf("Chmod failed: %v", err)
	}

	// 4. Symlink, Readlink, CopyFile, Rename, Abs
	err = rFS.Symlink("f1.txt", "~/workspace/sub/link.txt")
	if err != nil {
		t.Errorf("Symlink failed: %v", err)
	}

	linkTarget, err := rFS.Readlink("~/workspace/sub/link.txt")
	if err != nil || linkTarget != "f1.txt" {
		t.Errorf("Readlink failed: %v, %q", err, linkTarget)
	}

	err = rFS.CopyFile("~/workspace/sub/f1.txt", "~/workspace/sub/f1_copy.txt")
	if err != nil {
		t.Errorf("CopyFile failed: %v", err)
	}

	err = rFS.Rename("~/workspace/sub/f1_copy.txt", "~/workspace/sub/f1_renamed.txt")
	if err != nil {
		t.Errorf("Rename failed: %v", err)
	}

	absPath, err := rFS.Abs("~/workspace/sub/f1_renamed.txt")
	if err != nil || absPath == "" {
		t.Errorf("Abs failed: %v, %q", err, absPath)
	}

	// 5. OpenFile, Remove, RemoveAll
	wc2, err := rFS.OpenFile("~/workspace/sub/f3.txt", os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatalf("OpenFile failed: %v", err)
	}
	_ = wc2.Close()

	err = rFS.Remove("~/workspace/sub/f3.txt")
	if err != nil {
		t.Errorf("Remove failed: %v", err)
	}

	err = rFS.RemoveAll("~/workspace/sub")
	if err != nil {
		t.Errorf("RemoveAll failed: %v", err)
	}
}

func TestOSFSAllMethods(t *testing.T) {
	tmpDir := t.TempDir()
	osFS := NewOSFS()

	f1 := filepath.Join(tmpDir, "f1.txt")
	_ = osFS.WriteFile(f1, []byte("osfs-data"), 0644)

	// 1. OpenFile, ReadDir
	wc, err := osFS.OpenFile(filepath.Join(tmpDir, "f2.txt"), os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatalf("OSFS OpenFile failed: %v", err)
	}
	_ = wc.Close()

	entries, err := osFS.ReadDir(tmpDir)
	if err != nil || len(entries) < 2 {
		t.Errorf("OSFS ReadDir failed: %v, len=%d", err, len(entries))
	}

	// 2. Symlink, Readlink, Lstat, Stat
	linkPath := filepath.Join(tmpDir, "f1_link.txt")
	err = osFS.Symlink(f1, linkPath)
	if err != nil {
		t.Fatalf("OSFS Symlink failed: %v", err)
	}

	target, err := osFS.Readlink(linkPath)
	if err != nil || target != f1 {
		t.Errorf("OSFS Readlink failed: %v, %q", err, target)
	}

	st, err := osFS.Stat(f1)
	if err != nil || st.Size() != 9 {
		t.Errorf("OSFS Stat failed: %v", err)
	}

	lst, err := osFS.Lstat(linkPath)
	if err != nil || lst == nil {
		t.Errorf("OSFS Lstat failed: %v", err)
	}

	// 3. CopyFile, Rename, Abs, RemoveAll
	copyPath := filepath.Join(tmpDir, "f1_copy.txt")
	err = osFS.CopyFile(f1, copyPath)
	if err != nil {
		t.Errorf("OSFS CopyFile failed: %v", err)
	}

	renamedPath := filepath.Join(tmpDir, "f1_renamed.txt")
	err = osFS.Rename(copyPath, renamedPath)
	if err != nil {
		t.Errorf("OSFS Rename failed: %v", err)
	}

	absPath, err := osFS.Abs(renamedPath)
	if err != nil || absPath == "" {
		t.Errorf("OSFS Abs failed: %v, %q", err, absPath)
	}

	err = osFS.RemoveAll(tmpDir)
	if err != nil {
		t.Errorf("OSFS RemoveAll failed: %v", err)
	}
}

func TestTrackedFileSystemMethods(t *testing.T) {
	mem := NewMemFS()
	tFS := NewTrackedFileSystem(mem, nil, nil, "toolA")

	// Set context options
	tFS = tFS.WithToolName("toolA").WithFileType("file")

	_ = tFS.MkdirAll("/workspace", 0755)

	// WriteFile, ReadFile, Exists, Open, ReadDir
	err := tFS.WriteFile("/workspace/f1.txt", []byte("tracked-data"), 0644)
	if err != nil {
		t.Fatalf("TrackedFS WriteFile failed: %v", err)
	}

	data, err := tFS.ReadFile("/workspace/f1.txt")
	if err != nil || string(data) != "tracked-data" {
		t.Errorf("TrackedFS ReadFile failed: %v, %q", err, string(data))
	}

	exists, err := tFS.Exists("/workspace/f1.txt")
	if err != nil || !exists {
		t.Errorf("TrackedFS Exists failed: %v, %v", err, exists)
	}

	rc, err := tFS.Open("/workspace/f1.txt")
	if err != nil {
		t.Fatalf("TrackedFS Open failed: %v", err)
	}
	_ = rc.Close()

	entries, err := tFS.ReadDir("/workspace")
	if err != nil || len(entries) != 1 {
		t.Errorf("TrackedFS ReadDir failed: %v, len=%d", err, len(entries))
	}

	// Symlink, Readlink, Lstat, Stat, Abs, CopyFile, Rename
	err = tFS.Symlink("/workspace/f1.txt", "/workspace/link.txt")
	if err != nil {
		t.Errorf("TrackedFS Symlink failed: %v", err)
	}

	linkTarget, err := tFS.Readlink("/workspace/link.txt")
	if err != nil || linkTarget != "/workspace/f1.txt" {
		t.Errorf("TrackedFS Readlink failed: %v, %q", err, linkTarget)
	}

	st, err := tFS.Stat("/workspace/f1.txt")
	if err != nil || st.Size() != 12 {
		t.Errorf("TrackedFS Stat failed: %v", err)
	}

	lst, err := tFS.Lstat("/workspace/link.txt")
	if err != nil || lst == nil {
		t.Errorf("TrackedFS Lstat failed: %v", err)
	}

	absPath, err := tFS.Abs("/workspace/f1.txt")
	if err != nil || absPath == "" {
		t.Errorf("TrackedFS Abs failed: %v, %q", err, absPath)
	}

	err = tFS.CopyFile("/workspace/f1.txt", "/workspace/f1_copy.txt")
	if err != nil {
		t.Errorf("TrackedFS CopyFile failed: %v", err)
	}

	err = tFS.Rename("/workspace/f1_copy.txt", "/workspace/f1_renamed.txt")
	if err != nil {
		t.Errorf("TrackedFS Rename failed: %v", err)
	}

	// RecordExistingSymlink, RemoveAll, Remove
	err = tFS.RecordExistingSymlink("/workspace/link.txt", "/workspace/f1.txt")
	if err != nil {
		t.Errorf("RecordExistingSymlink failed: %v", err)
	}

	err = tFS.Remove("/workspace/f1_renamed.txt")
	if err != nil {
		t.Errorf("TrackedFS Remove failed: %v", err)
	}

	err = tFS.RemoveAll("/workspace")
	if err != nil {
		t.Errorf("TrackedFS RemoveAll failed: %v", err)
	}
}

func TestMemFSRenameDirectoryAndReadlinkErr(t *testing.T) {
	mem := NewMemFS()
	_ = mem.MkdirAll("/old_dir/sub", 0755)
	_ = mem.WriteFile("/old_dir/sub/file.txt", []byte("data"), 0644)

	// Rename directory
	err := mem.Rename("/old_dir", "/new_dir")
	if err != nil {
		t.Fatalf("Rename directory failed: %v", err)
	}

	exists, err := mem.Exists("/new_dir/sub/file.txt")
	if err != nil || !exists {
		t.Errorf("expected moved file in renamed directory to exist, got %v, err=%v", exists, err)
	}

	// Readlink on regular file
	_, err = mem.Readlink("/new_dir/sub/file.txt")
	if err == nil {
		t.Error("expected error calling Readlink on regular file")
	}

	info, err := mem.Lstat("/new_dir/sub/file.txt")
	if err == nil {
		_ = info.Mode()
		_ = info.ModTime()
		_ = info.Sys()
	}
}

func TestOSFSCopyFile(t *testing.T) {
	tmpDir := t.TempDir()
	osFS := NewOSFS()

	srcPath := filepath.Join(tmpDir, "src.txt")
	dstPath := filepath.Join(tmpDir, "sub", "dst.txt")

	_ = osFS.WriteFile(srcPath, []byte("osfs-copy-data"), 0644)
	err := osFS.CopyFile(srcPath, dstPath)
	if err != nil {
		t.Fatalf("OSFS CopyFile failed: %v", err)
	}

	data, err := osFS.ReadFile(dstPath)
	if err != nil || string(data) != "osfs-copy-data" {
		t.Errorf("OSFS CopyFile result mismatch: %v, %q", err, string(data))
	}
}

func TestTrackedFSHomeDirFallback(t *testing.T) {
	mem := NewMemFS()
	tFS := NewTrackedFileSystem(mem, nil, nil, "toolA")

	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		contracted := tFS.ContractHomePath(filepath.Join(home, "myconfig.txt"))
		if contracted != "~/myconfig.txt" {
			t.Errorf("expected ~/myconfig.txt, got %q", contracted)
		}
	}
}

func TestNewResolvedFSDefaultHome(t *testing.T) {
	mem := NewMemFS()
	rFS := NewResolvedFS(mem, "")
	if rFS.HomeDir() == "" {
		t.Errorf("expected default HomeDir from os.UserHomeDir(), got empty string")
	}
}

func TestTrackedFSWithRegistryAndTx(t *testing.T) {
	ctx := context.Background()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("db.NewConnection failed: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tFS := NewTrackedFileSystem(mem, reg, nil, "tool_tracked")

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		tFSTx := tFS.WithTx(ctx, tx)

		// 1. MkdirAll
		_ = tFSTx.MkdirAll("/tracked_dir", 0755)

		// 2. WriteFile, OpenFile, Create
		_ = tFSTx.WriteFile("/tracked_dir/f1.txt", []byte("content1"), 0644)
		_ = tFSTx.WriteFile("/tracked_dir/f1.txt", []byte("different-content"), 0644) // overwrite with different content
		_ = tFSTx.WriteFile("/tracked_dir/f1.txt", []byte("different-content"), 0644) // overwrite with identical content
		wc, errOf := tFSTx.OpenFile("/tracked_dir/f1_of.txt", os.O_CREATE|os.O_WRONLY, 0644)
		if errOf == nil {
			_, _ = wc.Write([]byte("of-content"))
			_ = wc.Close()
		}
		wcCr, errCr := tFSTx.Create("/tracked_dir/f1_cr.txt")
		if errCr == nil {
			_, _ = wcCr.Write([]byte("cr-content"))
			_ = wcCr.Close()
		}

		// 3. Chmod
		_ = tFSTx.Chmod("/tracked_dir/f1.txt", 0755)

		// 4. Symlink
		_ = tFSTx.Symlink("/tracked_dir/f1.txt", "/tracked_dir/f1_link.txt")

		// 5. Rename
		_ = tFSTx.Rename("/tracked_dir/f1_link.txt", "/tracked_dir/f1_renamed.txt")

		// 6. Remove
		_ = tFSTx.Remove("/tracked_dir/f1_renamed.txt")
		_ = tFSTx.Remove("/tracked_dir/nonexistent_file.txt")

		// 7. RemoveAll
		return tFSTx.RemoveAll("/tracked_dir")
	})

	if err != nil {
		t.Fatalf("TrackedFS with Tx operations failed: %v", err)
	}
}
