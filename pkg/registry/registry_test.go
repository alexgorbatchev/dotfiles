package registry

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
)

func ptr[T any](val T) *T {
	return &val
}

func setupTestDB(t *testing.T) (*sql.DB, *Registry) {
	t.Helper()
	ctx := context.Background()
	// Use isolated, named in-memory database to prevent test pollution
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	t.Cleanup(func() {
		database.Close()
	})

	// Clear tables between runs if necessary, since in-memory is shared
	_, _ = database.ExecContext(ctx, "DELETE FROM file_operations;")
	_, _ = database.ExecContext(ctx, "DELETE FROM tool_installations;")
	_, _ = database.ExecContext(ctx, "DELETE FROM tool_usage;")

	return database, NewRegistry(database)
}

func TestWriteOperationsRequireTransaction(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	fileRecord := &FileOperationRecord{
		ToolName:      "test-tool",
		OperationType: "write",
		FilePath:      "/test/path",
		FileType:      "file",
		CreatedAt:     time.Now().UnixMilli(),
		OperationID:   "op-123",
	}

	toolRecord := &ToolInstallationRecord{
		ToolName:    "test-tool",
		Version:     "1.0.0",
		InstallPath: "/install/path",
		Timestamp:   "2026-06-23",
		InstalledAt: time.Now().UnixMilli(),
		BinaryPaths: "[]",
	}

	// RecordFileOperation
	err := reg.RecordFileOperation(ctx, nil, fileRecord)
	if err != ErrTransactionRequired {
		t.Errorf("Expected ErrTransactionRequired, got: %v", err)
	}

	// RemoveFileOperationsByTool
	err = reg.RemoveFileOperationsByTool(ctx, nil, "test-tool")
	if err != ErrTransactionRequired {
		t.Errorf("Expected ErrTransactionRequired, got: %v", err)
	}

	// RecordToolInstallation
	err = reg.RecordToolInstallation(ctx, nil, toolRecord)
	if err != ErrTransactionRequired {
		t.Errorf("Expected ErrTransactionRequired, got: %v", err)
	}

	// RemoveToolInstallation
	err = reg.RemoveToolInstallation(ctx, nil, "test-tool")
	if err != ErrTransactionRequired {
		t.Errorf("Expected ErrTransactionRequired, got: %v", err)
	}
}

func TestWithTxRollbackAndCommit(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	// 1. Rollback case
	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		rec := &ToolInstallationRecord{
			ToolName:    "doomed-tool",
			Version:     "1.0.0",
			InstallPath: "/doomed",
			Timestamp:   "now",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: "[]",
		}
		if err := reg.RecordToolInstallation(ctx, tx, rec); err != nil {
			return err
		}

		// return mock error to trigger rollback
		return sql.ErrConnDone
	})

	if err != sql.ErrConnDone {
		t.Fatalf("Expected sql.ErrConnDone, got: %v", err)
	}

	// Verify not stored
	inst, err := reg.GetToolInstallation(ctx, "doomed-tool")
	if err != nil {
		t.Fatal(err)
	}
	if inst != nil {
		t.Errorf("Expected no tool installation due to rollback, got: %v", inst)
	}

	// 2. Commit case
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		rec := &ToolInstallationRecord{
			ToolName:    "saved-tool",
			Version:     "2.0.0",
			InstallPath: "/saved",
			Timestamp:   "now",
			InstalledAt: time.Now().UnixMilli(),
			BinaryPaths: "[]",
		}
		return reg.RecordToolInstallation(ctx, tx, rec)
	})

	if err != nil {
		t.Fatalf("Expected transaction commit success, got: %v", err)
	}

	// Verify stored
	inst, err = reg.GetToolInstallation(ctx, "saved-tool")
	if err != nil {
		t.Fatal(err)
	}
	if inst == nil || inst.Version != "2.0.0" {
		t.Errorf("Expected tool saved-tool with version 2.0.0, got: %v", inst)
	}
}

func TestFileOperationsTracking(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	var record1, record2 *FileOperationRecord

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		record1 = &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/home/alex/.config/bat/config",
			FileType:      "file",
			Metadata:      ptr(`{"checksum":"abc"}`),
			SizeBytes:     ptr(int64(45)),
			Permissions:   ptr("0644"),
			CreatedAt:     1000,
			OperationID:   "op-1",
		}
		if err := reg.RecordFileOperation(ctx, tx, record1); err != nil {
			return err
		}

		record2 = &FileOperationRecord{
			ToolName:      "ripgrep",
			OperationType: "symlink",
			FilePath:      "/home/alex/.local/bin/rg",
			TargetPath:    ptr("/home/alex/.local/bin/rg-bin"),
			FileType:      "symlink",
			CreatedAt:     2000,
			OperationID:   "op-2",
		}
		return reg.RecordFileOperation(ctx, tx, record2)
	})

	if err != nil {
		t.Fatalf("Failed to write test records: %v", err)
	}

	// Assert auto-increment IDs were updated
	if record1.ID == 0 || record2.ID == 0 {
		t.Errorf("IDs not populated: record1.ID=%d, record2.ID=%d", record1.ID, record2.ID)
	}

	// Test general query
	ops, err := reg.GetFileOperations(ctx, FileOperationFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(ops) != 2 {
		t.Fatalf("Expected 2 records, got: %d", len(ops))
	}
	// We order by CreatedAt DESC, so record2 (2000) is first
	if ops[0].ToolName != "ripgrep" || ops[1].ToolName != "bat" {
		t.Errorf("Wrong ordering or contents: ops[0]=%s, ops[1]=%s", ops[0].ToolName, ops[1].ToolName)
	}

	// Test filters
	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{ToolName: "bat"})
	if err != nil || len(ops) != 1 || ops[0].ToolName != "bat" {
		t.Errorf("Filter ToolName failed: err=%v, count=%d", err, len(ops))
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{OperationType: "symlink"})
	if err != nil || len(ops) != 1 || ops[0].OperationType != "symlink" {
		t.Errorf("Filter OperationType failed: err=%v, count=%d", err, len(ops))
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{FileType: "symlink"})
	if err != nil || len(ops) != 1 || ops[0].FileType != "symlink" {
		t.Errorf("Filter FileType failed: err=%v, count=%d", err, len(ops))
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{FilePath: "/home/alex/.config/bat/config"})
	if err != nil || len(ops) != 1 || ops[0].FilePath != "/home/alex/.config/bat/config" {
		t.Errorf("Filter FilePath failed: err=%v, count=%d", err, len(ops))
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{CreatedAfter: 1500})
	if err != nil || len(ops) != 1 || ops[0].CreatedAt != 2000 {
		t.Errorf("Filter CreatedAfter failed: err=%v, count=%d", err, len(ops))
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{CreatedBefore: 1500})
	if err != nil || len(ops) != 1 || ops[0].CreatedAt != 1000 {
		t.Errorf("Filter CreatedBefore failed: err=%v, count=%d", err, len(ops))
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{OperationID: "op-1"})
	if err != nil || len(ops) != 1 || ops[0].OperationID != "op-1" {
		t.Errorf("Filter OperationID failed: err=%v, count=%d", err, len(ops))
	}

	// Test get registered tools
	tools, err := reg.GetRegisteredTools(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 2 || tools[0] != "bat" || tools[1] != "ripgrep" {
		t.Errorf("Wrong registered tools output: %v", tools)
	}

	// Test get stats
	stats, err := reg.GetStats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalOperations != 2 || stats.TotalFiles != 2 || stats.TotalTools != 2 || stats.OldestOperation != 1000 || stats.NewestOperation != 2000 {
		t.Errorf("Wrong stats computed: %v", stats)
	}

	// Test removal
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RemoveFileOperationsByTool(ctx, tx, "bat")
	})
	if err != nil {
		t.Fatalf("Failed to remove bat file operations: %v", err)
	}

	ops, err = reg.GetFileOperations(ctx, FileOperationFilter{ToolName: "bat"})
	if err != nil || len(ops) != 0 {
		t.Errorf("Expected 0 operations for bat after removal, got: %v", ops)
	}
}

func TestFileStatesComputation(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		// 1. Create file 1
		err := reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/test/bat.conf",
			FileType:      "file",
			CreatedAt:     100,
			OperationID:   "op-1",
		})
		if err != nil {
			return err
		}

		// 2. Create file 2
		err = reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "symlink",
			FilePath:      "/test/bat-sym",
			FileType:      "symlink",
			CreatedAt:     200,
			OperationID:   "op-2",
		})
		if err != nil {
			return err
		}

		// 3. Remove file 1
		err = reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "rm",
			FilePath:      "/test/bat.conf",
			FileType:      "file",
			CreatedAt:     300,
			OperationID:   "op-3",
		})
		return err
	})

	if err != nil {
		t.Fatalf("Setup operations failed: %v", err)
	}

	// Assert states for bat (should return in sorted stable order)
	states, err := reg.GetFileStatesForTool(ctx, "bat")
	if err != nil {
		t.Fatal(err)
	}

	// /test/bat.conf should be deleted (due to rm), so only /test/bat-sym is active
	if len(states) != 1 {
		t.Fatalf("Expected 1 active file state, got %d", len(states))
	}
	if states[0].FilePath != "/test/bat-sym" || states[0].LastOperation != "symlink" {
		t.Errorf("Wrong state details: %v", states[0])
	}

	// Test individual GetFileState
	stateDeleted, err := reg.GetFileState(ctx, "/test/bat.conf")
	if err != nil {
		t.Fatal(err)
	}
	if stateDeleted != nil {
		t.Errorf("Expected /test/bat.conf state to be nil (deleted), got %v", stateDeleted)
	}

	// Verify getting latest state when there are multiple operations on same file
	stateActive, err := reg.GetFileState(ctx, "/test/bat-sym")
	if err != nil {
		t.Fatal(err)
	}
	if stateActive == nil || stateActive.LastOperation != "symlink" {
		t.Errorf("Expected active symlink state, got %v", stateActive)
	}

	// Non-existent path
	stateNone, err := reg.GetFileState(ctx, "/non-existent")
	if err != nil {
		t.Fatal(err)
	}
	if stateNone != nil {
		t.Errorf("Expected nil state for non-existent path, got %v", stateNone)
	}
}

func TestToolInstallationsTracking(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	binPathsJSON, _ := json.Marshal([]string{"/bin/bat", "/bin/bat-cache"})

	rec := &ToolInstallationRecord{
		ToolName:          "bat",
		Version:           "0.24.0",
		InstallPath:       "/home/alex/.cargo/bin/bat",
		Timestamp:         "2026-06-23T12:00:00Z",
		InstalledAt:       1000,
		BinaryPaths:       string(binPathsJSON),
		DownloadURL:       ptr("https://github.com/sharkdp/bat/releases/v0.24.0"),
		AssetName:         ptr("bat-v0.24.0-x86_64-unknown-linux-gnu.tar.gz"),
		ConfiguredVersion: ptr("0.24.0"),
		OriginalTag:       ptr("v0.24.0"),
		InstallMethod:     ptr("cargo"),
	}

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, rec)
	})

	if err != nil {
		t.Fatalf("RecordToolInstallation failed: %v", err)
	}

	// Test Retrieve
	tool, err := reg.GetToolInstallation(ctx, "bat")
	if err != nil {
		t.Fatal(err)
	}
	if tool == nil {
		t.Fatal("Expected tool bat, got nil")
	}

	if tool.Version != "0.24.0" || tool.InstallPath != "/home/alex/.cargo/bin/bat" || *tool.InstallMethod != "cargo" {
		t.Errorf("Tool installation fields don't match input: %v", tool)
	}

	// Test Non-Existent Retrieve
	none, err := reg.GetToolInstallation(ctx, "non-existent")
	if err != nil {
		t.Fatal(err)
	}
	if none != nil {
		t.Errorf("Expected nil for non-existent tool, got: %v", none)
	}

	// Test Get All
	all, err := reg.GetAllToolInstallations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0].ToolName != "bat" {
		t.Errorf("GetAllToolInstallations failed: %v", all)
	}

	// Test Remove
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RemoveToolInstallation(ctx, tx, "bat")
	})
	if err != nil {
		t.Fatalf("RemoveToolInstallation failed: %v", err)
	}

	toolRemoved, err := reg.GetToolInstallation(ctx, "bat")
	if err != nil {
		t.Fatal(err)
	}
	if toolRemoved != nil {
		t.Errorf("Expected nil tool after removal, got: %v", toolRemoved)
	}
}

func TestErrorPathways(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	// Close the DB to force error paths
	reg.db.Close()

	if _, err := reg.GetFileOperations(ctx, FileOperationFilter{}); err == nil {
		t.Error("Expected error from GetFileOperations with closed DB")
	}

	if _, err := reg.GetFileStatesForTool(ctx, "bat"); err == nil {
		t.Error("Expected error from GetFileStatesForTool with closed DB")
	}

	if _, err := reg.GetFileState(ctx, "/some/path"); err == nil {
		t.Error("Expected error from GetFileState with closed DB")
	}

	if _, err := reg.GetRegisteredTools(ctx); err == nil {
		t.Error("Expected error from GetRegisteredTools with closed DB")
	}

	if _, err := reg.GetStats(ctx); err == nil {
		t.Error("Expected error from GetStats with closed DB")
	}

	if _, err := reg.GetToolInstallation(ctx, "bat"); err == nil {
		t.Error("Expected error from GetToolInstallation with closed DB")
	}

	if _, err := reg.GetAllToolInstallations(ctx); err == nil {
		t.Error("Expected error from GetAllToolInstallations with closed DB")
	}
}

func TestToolUsageUpsert(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		u1 := &ToolUsageRecord{
			ToolName:   "fzf",
			BinaryName: "fzf",
			UsageCount: 1,
			LastUsedAt: 1000,
		}
		return reg.RecordToolUsage(ctx, tx, u1)
	})
	if err != nil {
		t.Fatalf("Failed to record first tool usage: %v", err)
	}

	u, err := reg.GetToolUsage(ctx, "fzf", "fzf")
	if err != nil {
		t.Fatalf("Failed to get tool usage: %v", err)
	}
	if u == nil {
		t.Fatal("Expected tool usage record, got nil")
	}
	if u.UsageCount != 1 || u.LastUsedAt != 1000 {
		t.Errorf("Unexpected usage record state: %+v", u)
	}

	// Increment with a second record
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		u2 := &ToolUsageRecord{
			ToolName:   "fzf",
			BinaryName: "fzf",
			UsageCount: 2,
			LastUsedAt: 2000,
		}
		return reg.RecordToolUsage(ctx, tx, u2)
	})
	if err != nil {
		t.Fatalf("Failed to record second tool usage: %v", err)
	}

	u, err = reg.GetToolUsage(ctx, "fzf", "fzf")
	if err != nil {
		t.Fatalf("Failed to get tool usage: %v", err)
	}
	if u == nil {
		t.Fatal("Expected tool usage record, got nil")
	}
	if u.UsageCount != 3 || u.LastUsedAt != 2000 {
		t.Errorf("Unexpected usage record state after increment: %+v", u)
	}
}

func TestPermissionsSerializationDecimalMismatch(t *testing.T) {
	database, reg := setupTestDB(t)
	ctx := context.Background()

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		r := &FileOperationRecord{
			ToolName:      "test-permissions",
			OperationType: "write",
			FilePath:      "/test/permissions.txt",
			FileType:      "file",
			Permissions:   ptr("0755"),
			CreatedAt:     1000,
			OperationID:   "op-perm-1",
		}
		return reg.RecordFileOperation(ctx, tx, r)
	})
	if err != nil {
		t.Fatalf("Failed to record operation: %v", err)
	}

	// 1. Direct query checking the DB storage contains decimal "493"
	var dbPerm string
	err = database.QueryRowContext(ctx, "SELECT permissions FROM file_operations WHERE tool_name = ?", "test-permissions").Scan(&dbPerm)
	if err != nil {
		t.Fatalf("Failed to query raw db permissions: %v", err)
	}
	if dbPerm != "493" {
		t.Errorf("Expected database permissions column to be '493', got '%s'", dbPerm)
	}

	// 2. Querying back using the registry, verifying it got converted back to "0755"
	ops, err := reg.GetFileOperations(ctx, FileOperationFilter{ToolName: "test-permissions"})
	if err != nil {
		t.Fatalf("Failed to query file operations: %v", err)
	}
	if len(ops) != 1 {
		t.Fatalf("Expected 1 operation, got %d", len(ops))
	}
	if ops[0].Permissions == nil || *ops[0].Permissions != "0755" {
		t.Errorf("Expected retrieved permissions to be '0755', got '%v'", ops[0].Permissions)
	}

	// 3. Test helpers: FileModeToDecimalString and DecimalStringToMode
	importMode, err := DecimalStringToMode("420")
	if err != nil {
		t.Fatalf("Failed to convert decimal string to FileMode: %v", err)
	}
	if importMode != 0644 {
		t.Errorf("Expected FileMode to be 0644, got %o", importMode)
	}

	exportStr := FileModeToDecimalString(0755)
	if exportStr != "493" {
		t.Errorf("Expected decimal string to be '493', got '%s'", exportStr)
	}
}
