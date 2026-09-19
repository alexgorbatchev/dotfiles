package fs

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// newTrackedTestFS wires a tracked filesystem over an in-memory database and an
// in-memory disk, and returns both it and the registry so a test can read back what
// the operations recorded.
func newTrackedTestFS(t *testing.T) (*MemFS, *registry.Registry, *TrackedFileSystem) {
	t.Helper()
	ctx := context.Background()
	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("initializing test database: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	// MemFS refuses a write whose parent is missing, exactly as a real disk does.
	for _, dir := range []string{"/home/user", "/home/user/.ssh", "/home/user/.config", "/home/user/.config/bat", "/repo/tools/bat"} {
		if err := mem.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
	}
	return mem, reg, NewTrackedFileSystem(mem, reg, nil, "test-tool")
}

// inTx runs fn against a transaction-bound copy of the tracked filesystem.
func inTx(t *testing.T, reg *registry.Registry, tfs *TrackedFileSystem, fn func(*TrackedFileSystem) error) {
	t.Helper()
	ctx := context.Background()
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error { return fn(tfs.WithTx(ctx, tx)) }); err != nil {
		t.Fatalf("running tracked operation: %v", err)
	}
}

// sha256Hex is what the recorded hash is compared against, computed independently of
// the production helper so that a change to the algorithm shows up as a failure
// rather than agreeing with itself.
func sha256Hex(data string) string {
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

// latestOp returns the most recent operation recorded for a path.
func latestOp(t *testing.T, reg *registry.Registry, path string) *registry.FileOperationRecord {
	t.Helper()
	ops, err := reg.GetFileOperations(context.Background(), registry.FileOperationFilter{FilePath: path})
	if err != nil {
		t.Fatalf("reading file operations: %v", err)
	}
	if len(ops) == 0 {
		t.Fatalf("no operation recorded for %s", path)
	}
	return ops[0]
}

// TestWriteFileRecordsContentHash pins the base version a later run compares
// against. Without it, an edited file is indistinguishable from an untouched one.
func TestWriteFileRecordsContentHash(t *testing.T) {
	_, reg, tfs := newTrackedTestFS(t)

	const path = "/home/user/.tmux.conf"
	const content = "set -g mouse on\n"
	inTx(t, reg, tfs, func(tracked *TrackedFileSystem) error {
		return tracked.WriteFile(path, []byte(content), 0644)
	})

	op := latestOp(t, reg, path)
	if op.ContentHash == nil {
		t.Fatal("writeFile recorded no content hash")
	}
	if *op.ContentHash != sha256Hex(content) {
		t.Errorf("content hash = %q, want %q", *op.ContentHash, sha256Hex(content))
	}
}

// TestCopyFileRecordsContentHash covers .copy() targets, which are the declarations
// the .bak rotation used to overwrite blindly.
func TestCopyFileRecordsContentHash(t *testing.T) {
	mem, reg, tfs := newTrackedTestFS(t)

	const source = "/repo/tools/bat/config"
	const target = "/home/user/.config/bat/config"
	const content = "--theme=ansi\n"
	if err := mem.WriteFile(source, []byte(content), 0644); err != nil {
		t.Fatalf("writing source: %v", err)
	}

	inTx(t, reg, tfs, func(tracked *TrackedFileSystem) error {
		return tracked.CopyFile(source, target)
	})

	op := latestOp(t, reg, target)
	if op.ContentHash == nil {
		t.Fatal("copyFile recorded no content hash")
	}
	if *op.ContentHash != sha256Hex(content) {
		t.Errorf("content hash = %q, want %q", *op.ContentHash, sha256Hex(content))
	}
}

// TestRecordExistingFileRecordsContentHash covers the path a repeated generate
// takes: the file already holds the wanted bytes and is registered without being
// rewritten. It still needs a base hash, or the second run would leave the file
// tracked but unmeasurable.
func TestRecordExistingFileRecordsContentHash(t *testing.T) {
	mem, reg, tfs := newTrackedTestFS(t)

	const path = "/home/user/.config/bat/config"
	const content = "--theme=ansi\n"
	if err := mem.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing file: %v", err)
	}

	inTx(t, reg, tfs, func(tracked *TrackedFileSystem) error {
		return tracked.RecordExistingFile(path)
	})

	op := latestOp(t, reg, path)
	if op.ContentHash == nil {
		t.Fatal("recordExistingFile recorded no content hash")
	}
	if *op.ContentHash != sha256Hex(content) {
		t.Errorf("content hash = %q, want %q", *op.ContentHash, sha256Hex(content))
	}
}

// TestSymlinkRecordsNoContentHash states the deliberate exception. A symlink has no
// content of its own; what it points at is already recorded as the target path, and
// inventing a hash for it would make an empty value look like a real measurement.
func TestSymlinkRecordsNoContentHash(t *testing.T) {
	_, reg, tfs := newTrackedTestFS(t)

	const link = "/home/user/.config/starship.toml"
	inTx(t, reg, tfs, func(tracked *TrackedFileSystem) error {
		return tracked.Symlink("/repo/tools/starship/starship.toml", link)
	})

	op := latestOp(t, reg, link)
	if op.ContentHash != nil {
		t.Errorf("symlink recorded content hash %q, want none", *op.ContentHash)
	}
}

// TestDeclaredAttributesReachTheRecord checks that the mode an author declared and
// the block a write belongs to are carried onto every operation the configured
// filesystem records, since that is how the drift engine later finds them.
func TestDeclaredAttributesReachTheRecord(t *testing.T) {
	_, reg, tfs := newTrackedTestFS(t)

	const path = "/home/user/.ssh/config"
	inTx(t, reg, tfs, func(tracked *TrackedFileSystem) error {
		return tracked.
			WithTargetMode(0600).
			WithBlock("ssh-includes").
			WriteFile(path, []byte("Include /repo/tools/ssh/config\n"), 0600)
	})

	op := latestOp(t, reg, path)
	if op.TargetMode == nil || *op.TargetMode != registry.Permission("0600") {
		t.Errorf("target mode = %v, want 0600", op.TargetMode)
	}
	if op.BlockID == nil || *op.BlockID != "ssh-includes" {
		t.Errorf("block id = %v, want %q", op.BlockID, "ssh-includes")
	}
}

// TestDeclaredAttributesAreScopedToTheirCopy checks that configuring a mode or a
// block yields a new filesystem rather than mutating the shared one, so a tool that
// declares a 0600 file does not silently impose it on every later write.
func TestDeclaredAttributesAreScopedToTheirCopy(t *testing.T) {
	_, reg, tfs := newTrackedTestFS(t)

	const strict = "/home/user/.ssh/config"
	const ordinary = "/home/user/.tmux.conf"
	inTx(t, reg, tfs, func(tracked *TrackedFileSystem) error {
		if err := tracked.WithTargetMode(0600).WithBlock("ssh-includes").WriteFile(strict, []byte("a"), 0600); err != nil {
			return err
		}
		return tracked.WriteFile(ordinary, []byte("b"), 0644)
	})

	op := latestOp(t, reg, ordinary)
	if op.TargetMode != nil {
		t.Errorf("target mode leaked onto an unrelated write: %v", *op.TargetMode)
	}
	if op.BlockID != nil {
		t.Errorf("block id leaked onto an unrelated write: %v", *op.BlockID)
	}
}
