package registry

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

// recordOps writes every record inside one transaction, in the order given.
func recordOps(t *testing.T, reg *Registry, records ...*FileOperationRecord) {
	t.Helper()
	ctx := context.Background()
	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		for _, record := range records {
			if err := reg.RecordFileOperation(ctx, tx, record); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("recording file operations: %v", err)
	}
}

// TestFileOperationRoundTripsDriftFields checks that the three drift attributes
// survive a write and a read. They are what tells an upstream change from a local
// edit, so a column that silently drops its value would make every file look in sync.
func TestFileOperationRoundTripsDriftFields(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	recordOps(t, reg, &FileOperationRecord{
		ToolName:      "ssh",
		OperationType: "block",
		FilePath:      "/home/user/.ssh/config",
		FileType:      "file",
		CreatedAt:     time.Now().UnixMilli(),
		OperationID:   "op-1",
		ContentHash:   ptr("f1d2d2f924e986ac86fdf7b36c94bcdf32beec15"),
		BlockID:       ptr("ssh-includes"),
		TargetMode:    ptr(Permission("0600")),
	})

	ops, err := reg.GetFileOperations(ctx, FileOperationFilter{ToolName: "ssh"})
	if err != nil {
		t.Fatalf("reading file operations: %v", err)
	}
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	got := ops[0]
	if got.ContentHash == nil || *got.ContentHash != "f1d2d2f924e986ac86fdf7b36c94bcdf32beec15" {
		t.Errorf("content hash = %v, want the recorded hash", got.ContentHash)
	}
	if got.BlockID == nil || *got.BlockID != "ssh-includes" {
		t.Errorf("block id = %v, want %q", got.BlockID, "ssh-includes")
	}
	if got.TargetMode == nil || *got.TargetMode != Permission("0600") {
		t.Errorf("target mode = %v, want 0600", got.TargetMode)
	}
}

// TestFileOperationOmitsDriftFields covers the ordinary operation that carries none
// of them: a symlink has no content of its own, and most declarations state no mode.
// Those have to come back as nil rather than as an empty string a comparison would
// then treat as a real recorded value.
func TestFileOperationOmitsDriftFields(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	recordOps(t, reg, &FileOperationRecord{
		ToolName:      "bat",
		OperationType: "symlink",
		FilePath:      "/home/user/.config/bat/config",
		TargetPath:    ptr("/repo/tools/bat/config"),
		FileType:      "symlink",
		CreatedAt:     time.Now().UnixMilli(),
		OperationID:   "op-2",
	})

	ops, err := reg.GetFileOperations(ctx, FileOperationFilter{ToolName: "bat"})
	if err != nil {
		t.Fatalf("reading file operations: %v", err)
	}
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}
	if ops[0].ContentHash != nil {
		t.Errorf("content hash = %v, want nil for a symlink", *ops[0].ContentHash)
	}
	if ops[0].BlockID != nil {
		t.Errorf("block id = %v, want nil", *ops[0].BlockID)
	}
	if ops[0].TargetMode != nil {
		t.Errorf("target mode = %v, want nil", *ops[0].TargetMode)
	}
}

// TestFileStateCarriesLatestDriftFields checks the folded view the drift engine
// actually reads. A later operation that says nothing about a field must leave the
// previous value standing, the way the other attributes already behave, so that a
// chmod does not erase the hash the write before it recorded.
func TestFileStateCarriesLatestDriftFields(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	const path = "/home/user/.gitconfig"
	now := time.Now().UnixMilli()

	recordOps(t, reg,
		&FileOperationRecord{
			ToolName:      "git",
			OperationType: "writeFile",
			FilePath:      path,
			FileType:      "file",
			CreatedAt:     now,
			OperationID:   "op-1",
			ContentHash:   ptr("first"),
			TargetMode:    ptr(Permission("0644")),
		},
		&FileOperationRecord{
			ToolName:      "git",
			OperationType: "writeFile",
			FilePath:      path,
			FileType:      "file",
			CreatedAt:     now + 1,
			OperationID:   "op-2",
			ContentHash:   ptr("second"),
		},
		&FileOperationRecord{
			ToolName:      "git",
			OperationType: "chmod",
			FilePath:      path,
			FileType:      "file",
			CreatedAt:     now + 2,
			OperationID:   "op-3",
		},
	)

	state, err := reg.GetFileState(ctx, path)
	if err != nil {
		t.Fatalf("reading file state: %v", err)
	}
	if state == nil {
		t.Fatal("expected a file state")
	}
	if state.ContentHash == nil || *state.ContentHash != "second" {
		t.Errorf("content hash = %v, want the hash of the most recent write", state.ContentHash)
	}
	if state.TargetMode == nil || *state.TargetMode != Permission("0644") {
		t.Errorf("target mode = %v, want the declared 0644 to survive later operations", state.TargetMode)
	}
}

// TestGetFileStatesForBlock returns the states of the managed blocks in one file.
// A file can hold blocks belonging to several tools, so the drift engine needs each
// block's own base hash rather than one state per path.
func TestGetFileStatesForBlock(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	const path = "/home/user/.ssh/config"
	now := time.Now().UnixMilli()

	recordOps(t, reg,
		&FileOperationRecord{
			ToolName:      "ssh",
			OperationType: "block",
			FilePath:      path,
			FileType:      "file",
			CreatedAt:     now,
			OperationID:   "op-1",
			ContentHash:   ptr("ssh-hash"),
			BlockID:       ptr("ssh-includes"),
		},
		&FileOperationRecord{
			ToolName:      "work",
			OperationType: "block",
			FilePath:      path,
			FileType:      "file",
			CreatedAt:     now + 1,
			OperationID:   "op-2",
			ContentHash:   ptr("work-hash"),
			BlockID:       ptr("work-hosts"),
		},
	)

	state, err := reg.GetBlockState(ctx, path, "ssh-includes")
	if err != nil {
		t.Fatalf("reading block state: %v", err)
	}
	if state == nil {
		t.Fatal("expected a state for the ssh-includes block")
	}
	if state.ContentHash == nil || *state.ContentHash != "ssh-hash" {
		t.Errorf("content hash = %v, want the hash recorded for ssh-includes", state.ContentHash)
	}
	if state.ToolName != "ssh" {
		t.Errorf("tool name = %q, want %q", state.ToolName, "ssh")
	}

	missing, err := reg.GetBlockState(ctx, path, "nothing-owns-this")
	if err != nil {
		t.Fatalf("reading an unknown block: %v", err)
	}
	if missing != nil {
		t.Errorf("expected nil for a block nothing recorded, got %+v", missing)
	}
}

func TestRenameFileOperationPrefix(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	recordOps(t, reg,
		&FileOperationRecord{
			ToolName:      "test",
			OperationType: "writeFile",
			FilePath:      "/old/prefix/file1.txt",
			FileType:      "file",
			CreatedAt:     100,
			OperationID:   "op1",
		},
		&FileOperationRecord{
			ToolName:      "test",
			OperationType: "writeFile",
			FilePath:      "/old/prefix/sub/file2.txt",
			FileType:      "file",
			CreatedAt:     101,
			OperationID:   "op2",
		},
	)

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RenameFileOperationPrefix(ctx, tx, "/old/prefix", "/new/prefix")
	})
	if err != nil {
		t.Fatalf("RenameFileOperationPrefix failed: %v", err)
	}

	ops, err := reg.GetFileOperations(ctx, FileOperationFilter{})
	if err != nil {
		t.Fatalf("reading ops: %v", err)
	}
	if len(ops) != 2 {
		t.Fatalf("expected 2 ops, got %d", len(ops))
	}
	for _, op := range ops {
		if op.FilePath[:11] != "/new/prefix" {
			t.Errorf("expected new prefix /new/prefix, got %s", op.FilePath)
		}
	}
}
