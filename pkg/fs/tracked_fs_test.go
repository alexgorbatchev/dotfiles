package fs

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestTrackedFileSystemOperations(t *testing.T) {
	ctx := context.Background()
	// Create an in-memory database
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, "my-tool")

	// Verify operations within a transaction
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		txTfs := tfs.WithTx(ctx, tx)

		// 1. MkdirAll
		err := txTfs.MkdirAll("/workspace", 0755)
		if err != nil {
			return err
		}

		// 2. WriteFile
		err = txTfs.WriteFile("/workspace/foo.txt", []byte("hello world"), 0644)
		if err != nil {
			return err
		}

		// 3. Chmod
		err = txTfs.Chmod("/workspace/foo.txt", 0755)
		if err != nil {
			return err
		}

		// 4. Create (writeFile)
		wc, err := txTfs.Create("/workspace/bar.txt")
		if err != nil {
			return err
		}
		_, err = io.WriteString(wc, "some data")
		if err != nil {
			return err
		}
		err = wc.Close()
		if err != nil {
			return err
		}

		// 5. Remove (rm)
		err = txTfs.Remove("/workspace/bar.txt")
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		t.Fatalf("Failed during tracked operations: %v", err)
	}

	// Now query file operations and verify the transactional records!
	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{})
	if err != nil {
		t.Fatalf("Failed to fetch file operations: %v", err)
	}

	// Let's print or verify the ops
	// Expected operations (in reverse order due to GetFileOperations ordering by CreatedAt DESC):
	// 5. rm /workspace/bar.txt
	// 4. writeFile /workspace/bar.txt
	// 3. chmod /workspace/foo.txt
	// 2. writeFile /workspace/foo.txt
	// 1. mkdir /workspace
	if len(ops) != 5 {
		t.Fatalf("Expected 5 file operations recorded, got %d", len(ops))
	}

	// We can map them by operation type + path for easier assertions
	opMap := make(map[string]*registry.FileOperationRecord)
	for _, op := range ops {
		key := fmt.Sprintf("%s:%s", op.OperationType, op.FilePath)
		opMap[key] = op
	}

	// Assertions:
	// 1. mkdir /workspace
	mkdirOp, ok := opMap["mkdir:/workspace"]
	if !ok {
		t.Errorf("Missing mkdir operation for /workspace")
	} else {
		if mkdirOp.ToolName != "my-tool" || mkdirOp.FileType != "file" {
			t.Errorf("Unexpected mkdir op state: %+v", mkdirOp)
		}
	}

	// 2. writeFile /workspace/foo.txt
	writeOp, ok := opMap["writeFile:/workspace/foo.txt"]
	if !ok {
		t.Errorf("Missing writeFile operation for /workspace/foo.txt")
	} else {
		if writeOp.SizeBytes == nil || *writeOp.SizeBytes != 11 {
			t.Errorf("Expected size 11, got %v", writeOp.SizeBytes)
		}
		// Since we unmarshal permissions back to octal format in-memory:
		if writeOp.Permissions == nil || *writeOp.Permissions != "0644" {
			t.Errorf("Expected permissions '0644', got %v", writeOp.Permissions)
		}
	}

	// 3. chmod /workspace/foo.txt
	chmodOp, ok := opMap["chmod:/workspace/foo.txt"]
	if !ok {
		t.Errorf("Missing chmod operation for /workspace/foo.txt")
	} else {
		if chmodOp.Permissions == nil || *chmodOp.Permissions != "0755" {
			t.Errorf("Expected permissions '0755', got %v", chmodOp.Permissions)
		}
	}

	// 4. writeFile /workspace/bar.txt
	writeBarOp, ok := opMap["writeFile:/workspace/bar.txt"]
	if !ok {
		t.Errorf("Missing writeFile operation for /workspace/bar.txt")
	} else {
		if writeBarOp.SizeBytes == nil || *writeBarOp.SizeBytes != 9 {
			t.Errorf("Expected size 9, got %v", writeBarOp.SizeBytes)
		}
	}

	// 5. rm /workspace/bar.txt
	_, ok = opMap["rm:/workspace/bar.txt"]
	if !ok {
		t.Errorf("Missing rm operation for /workspace/bar.txt")
	}

	// Verify database content representation directly is in decimal base-10
	var dbChmodPerm string
	err = database.QueryRowContext(ctx, "SELECT permissions FROM file_operations WHERE operation_type = 'chmod' AND file_path = '/workspace/foo.txt'").Scan(&dbChmodPerm)
	if err != nil {
		t.Fatalf("Failed to query raw db permissions: %v", err)
	}
	if dbChmodPerm != "493" {
		t.Errorf("Expected raw db permissions for chmod to be '493', got '%s'", dbChmodPerm)
	}
}

func TestTrackedFileSystemWithCustomContexts(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, "my-tool")

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		// Create cloned instance with file type and custom tools
		txTfs := tfs.WithTx(ctx, tx).WithFileType("shim").WithToolName("fzf")

		err := txTfs.WriteFile("/fzf-shim", []byte("fzf-shim"), 0755)
		if err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Failed during tracked operations: %v", err)
	}

	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{})
	if err != nil {
		t.Fatalf("Failed to fetch file operations: %v", err)
	}
	if len(ops) != 1 {
		t.Fatalf("Expected 1 recorded operation, got %d", len(ops))
	}
	op := ops[0]
	if op.ToolName != "fzf" || op.FileType != "shim" {
		t.Errorf("Expected WithFileType and WithToolName context overrides to be applied, got %+v", op)
	}
}

func TestTrackedFileSystemWriteFileIdenticalContentGuard(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, "guard-tool")

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		txTfs := tfs.WithTx(ctx, tx)

		// First write (different/new file)
		err := txTfs.WriteFile("/guard.txt", []byte("initial"), 0644)
		if err != nil {
			return err
		}

		// Second write with identical content
		err = txTfs.WriteFile("/guard.txt", []byte("initial"), 0644)
		if err != nil {
			return err
		}

		// Third write with different content
		err = txTfs.WriteFile("/guard.txt", []byte("updated"), 0644)
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		t.Fatalf("Failed during operations: %v", err)
	}

	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: "guard-tool"})
	if err != nil {
		t.Fatalf("Failed to fetch file operations: %v", err)
	}

	// We expect exactly 2 operations recorded:
	// 1. Initial write
	// 2. Updated write
	// The identical write should have been skipped.
	if len(ops) != 2 {
		t.Errorf("Expected exactly 2 operations recorded, got %d", len(ops))
	}
}

func TestTrackedFileSystemRecursiveRemoveAll(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, "rmall-tool")

	// Set up nested files & directories
	err = mem.MkdirAll("/dir/sub", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	err = mem.WriteFile("/dir/sub/file1.txt", []byte("one"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}
	err = mem.WriteFile("/dir/file2.txt", []byte("two"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// Now run RemoveAll within a transaction
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		txTfs := tfs.WithTx(ctx, tx)
		return txTfs.RemoveAll("/dir")
	})
	if err != nil {
		t.Fatalf("RemoveAll failed: %v", err)
	}

	// Query file operations
	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: "rmall-tool"})
	if err != nil {
		t.Fatalf("Failed to fetch operations: %v", err)
	}

	// We expect 4 "rm" operations:
	// - /dir
	// - /dir/sub
	// - /dir/sub/file1.txt
	// - /dir/file2.txt
	expectedPaths := map[string]bool{
		"/dir":               true,
		"/dir/sub":           true,
		"/dir/sub/file1.txt": true,
		"/dir/file2.txt":     true,
	}

	for _, op := range ops {
		if op.OperationType != "rm" {
			t.Errorf("Expected only 'rm' operations, got %s", op.OperationType)
		}
		if !expectedPaths[op.FilePath] {
			t.Errorf("Unexpected deleted path logged: %s", op.FilePath)
		}
		delete(expectedPaths, op.FilePath)
	}

	if len(expectedPaths) > 0 {
		t.Errorf("Not all deleted paths were logged. Remaining: %v", expectedPaths)
	}
}
