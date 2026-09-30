package fs

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
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
	tfs := NewTrackedFileSystem(mem, reg, nil, "my-tool")

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

		// 6. Link
		err = txTfs.Link("/workspace/foo.txt", "/workspace/foo_link.txt")
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		t.Fatalf("Failed during tracked operations: %v", err)
	}

	// Query file operations and verify the transactional records.
	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{})
	if err != nil {
		t.Fatalf("Failed to fetch file operations: %v", err)
	}

	// Expected operations (in reverse order due to GetFileOperations ordering by CreatedAt DESC):
	// 6. link /workspace/foo_link.txt
	// 5. rm /workspace/bar.txt
	// 4. writeFile /workspace/bar.txt
	// 3. chmod /workspace/foo.txt
	// 2. writeFile /workspace/foo.txt
	// 1. mkdir /workspace
	if len(ops) != 6 {
		t.Fatalf("Expected 6 file operations recorded, got %d", len(ops))
	}

	// Map operations by operation type + path for assertions.
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

	// 6. link /workspace/foo_link.txt
	linkOp, ok := opMap["link:/workspace/foo_link.txt"]
	if !ok {
		t.Errorf("Missing link operation for /workspace/foo_link.txt")
	} else {
		if linkOp.TargetPath == nil || *linkOp.TargetPath != "/workspace/foo.txt" {
			t.Errorf("Expected target path '/workspace/foo.txt', got %v", linkOp.TargetPath)
		}
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
	tfs := NewTrackedFileSystem(mem, reg, nil, "my-tool")

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
	tfs := NewTrackedFileSystem(mem, reg, nil, "guard-tool")

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
	tfs := NewTrackedFileSystem(mem, reg, nil, "rmall-tool")

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

func TestTrackedFS_Logging(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)

	// Create MemFS and wrap in ResolvedFS so homeDir is set to /home/testuser
	mem := NewMemFS()
	rfs := NewResolvedFS(mem, "/home/testuser")
	err = rfs.MkdirAll("/home/testuser", 0755)
	if err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	var buf bytes.Buffer
	testLog := logger.New(logger.Config{
		Level:  logger.LogLevelDefault,
		Writer: &buf,
	})

	tfs := NewTrackedFileSystem(rfs, reg, testLog, "log-tool")

	// 1. WriteFile
	err = tfs.WriteFile("/home/testuser/test.txt", []byte("hello"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// 2. Symlink
	err = tfs.Symlink("/home/testuser/test.txt", "/home/testuser/test_link.txt")
	if err != nil {
		t.Fatalf("Symlink failed: %v", err)
	}

	// 2b. Link (hard link)
	err = tfs.Link("/home/testuser/test.txt", "/home/testuser/test_hardlink.txt")
	if err != nil {
		t.Fatalf("Link failed: %v", err)
	}

	// 3. Remove
	err = tfs.Remove("/home/testuser/test_link.txt")
	if err != nil {
		t.Fatalf("Remove failed: %v", err)
	}

	logOutput := buf.String()

	// Check log format:
	// It should log:
	// INFO	write ~/test.txt
	// INFO	ln -s ~/test.txt ~/test_link.txt
	// INFO	ln ~/test.txt ~/test_hardlink.txt
	// INFO	rm ~/test_link.txt
	if !strings.Contains(logOutput, "write ~/test.txt") {
		t.Errorf("Expected log containing 'write ~/test.txt', got:\n%s", logOutput)
	}
	if !strings.Contains(logOutput, "ln -s ~/test.txt ~/test_link.txt") {
		t.Errorf("Expected log containing 'ln -s ~/test.txt ~/test_link.txt', got:\n%s", logOutput)
	}
	if !strings.Contains(logOutput, "ln ~/test.txt ~/test_hardlink.txt") {
		t.Errorf("Expected log containing 'ln ~/test.txt ~/test_hardlink.txt', got:\n%s", logOutput)
	}
	if !strings.Contains(logOutput, "rm ~/test_link.txt") {
		t.Errorf("Expected log containing 'rm ~/test_link.txt', got:\n%s", logOutput)
	}
}

func TestTrackedFS_ChunkedComparison(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, nil, "compare-tool")

	// Pre-populate parent directory in MemFS
	_ = mem.MkdirAll("/workspace", 0755)

	// Write initial file
	err = tfs.WriteFile("/workspace/comp.txt", []byte("abcdefg"), 0644)
	if err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// 1. Identical file
	identical, err := tfs.compareContentChunked("/workspace/comp.txt", []byte("abcdefg"))
	if err != nil {
		t.Fatalf("compareContentChunked failed: %v", err)
	}
	if !identical {
		t.Errorf("Expected identical to be true for same content")
	}

	// 2. Different size (smaller)
	identical, err = tfs.compareContentChunked("/workspace/comp.txt", []byte("abc"))
	if err != nil {
		t.Fatalf("compareContentChunked failed: %v", err)
	}
	if identical {
		t.Errorf("Expected identical to be false for different size")
	}

	// 3. Different size (larger)
	identical, err = tfs.compareContentChunked("/workspace/comp.txt", []byte("abcdefghijk"))
	if err != nil {
		t.Fatalf("compareContentChunked failed: %v", err)
	}
	if identical {
		t.Errorf("Expected identical to be false for different size")
	}

	// 4. Same size but differing content
	identical, err = tfs.compareContentChunked("/workspace/comp.txt", []byte("abcXefg"))
	if err != nil {
		t.Fatalf("compareContentChunked failed: %v", err)
	}
	if identical {
		t.Errorf("Expected identical to be false for differing content of same size")
	}
}

// RecordExistingFile registers a file the tool owns without rewriting it, the way
// RecordExistingSymlink does for a link that is already correct, so a target that
// already matches its source is still tracked and reaped once its declaration goes.
func TestTrackedFileSystemRecordExistingFile(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	_ = mem.MkdirAll("/home", 0755)
	_ = mem.WriteFile("/home/config.toml", []byte("managed"), 0600)
	tfs := NewTrackedFileSystem(mem, reg, nil, "copy-tool").WithFileType("copy")

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return tfs.WithTx(ctx, tx).RecordExistingFile("/home/config.toml")
	})
	if err != nil {
		t.Fatalf("RecordExistingFile: %v", err)
	}

	states, err := reg.GetFileStatesForTool(ctx, "copy-tool")
	if err != nil {
		t.Fatalf("GetFileStatesForTool: %v", err)
	}
	if len(states) != 1 {
		t.Fatalf("expected one recorded state, got %d", len(states))
	}
	state := states[0]
	if state.FilePath != "/home/config.toml" || state.FileType != "copy" || state.LastOperation != "writeFile" {
		t.Errorf("unexpected state %+v", state)
	}
	if state.SizeBytes == nil || *state.SizeBytes != int64(len("managed")) {
		t.Errorf("expected size %d to be recorded, got %v", len("managed"), state.SizeBytes)
	}
	if state.Permissions == nil || *state.Permissions != registry.Permission("0600") {
		t.Errorf("expected permissions 0600 to be recorded, got %v", state.Permissions)
	}

	got, _ := mem.ReadFile("/home/config.toml")
	if string(got) != "managed" {
		t.Errorf("RecordExistingFile rewrote the file: %q", string(got))
	}
}

type spyReadFileFS struct {
	FS
	readFileCalls map[string]int
}

func (s *spyReadFileFS) ReadFile(path string) ([]byte, error) {
	if s.readFileCalls == nil {
		s.readFileCalls = make(map[string]int)
	}
	s.readFileCalls[path]++
	return s.FS.ReadFile(path)
}

func TestCopyFileWithoutTxDoesNotReadBackDestination(t *testing.T) {
	mem := NewMemFS()
	spy := &spyReadFileFS{FS: mem}
	reg := registry.NewRegistry(nil)
	tfs := NewTrackedFileSystem(spy, reg, nil, "test-tool")

	if err := mem.WriteFile("/src.txt", []byte("file content to copy"), 0644); err != nil {
		t.Fatalf("writing source file: %v", err)
	}

	if err := tfs.CopyFile("/src.txt", "/dest.txt"); err != nil {
		t.Fatalf("CopyFile failed: %v", err)
	}

	if calls := spy.readFileCalls["/dest.txt"]; calls != 0 {
		t.Errorf("expected 0 ReadFile calls on destination without transaction, got %d", calls)
	}
}

func TestCopyFileAndRecordExistingFileDoNotStoreMetadataForCopies(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, nil, "copy-tool").WithFileType("copy")

	const src = "/source.txt"
	const destCopy = "/dest_copied.txt"
	const existing = "/existing.txt"
	content := "sensitive secret configuration content\n"

	if err := mem.WriteFile(src, []byte(content), 0600); err != nil {
		t.Fatalf("writing source: %v", err)
	}
	if err := mem.WriteFile(existing, []byte(content), 0600); err != nil {
		t.Fatalf("writing existing: %v", err)
	}

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		txTfs := tfs.WithTx(ctx, tx)
		if err := txTfs.CopyFile(src, destCopy); err != nil {
			return err
		}
		return txTfs.RecordExistingFile(existing)
	})
	if err != nil {
		t.Fatalf("transaction failed: %v", err)
	}

	// Verify CopyFile operation
	copyOps, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{FilePath: destCopy})
	if err != nil || len(copyOps) == 0 {
		t.Fatalf("fetching copy op failed: %v", err)
	}
	if copyOps[0].Metadata != nil && *copyOps[0].Metadata != "" {
		t.Errorf("CopyFile stored file content in metadata: %q, want nil", *copyOps[0].Metadata)
	}
	if copyOps[0].ContentHash == nil || *copyOps[0].ContentHash != HashContent([]byte(content)) {
		t.Errorf("CopyFile content hash = %v, want %q", copyOps[0].ContentHash, HashContent([]byte(content)))
	}
	if copyOps[0].SizeBytes == nil || *copyOps[0].SizeBytes != int64(len(content)) {
		t.Errorf("CopyFile size = %v, want %d", copyOps[0].SizeBytes, len(content))
	}

	// Verify RecordExistingFile operation for copy
	existingOps, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{FilePath: existing})
	if err != nil || len(existingOps) == 0 {
		t.Fatalf("fetching existing op failed: %v", err)
	}
	if existingOps[0].Metadata != nil && *existingOps[0].Metadata != "" {
		t.Errorf("RecordExistingFile for copy stored file content in metadata: %q, want nil", *existingOps[0].Metadata)
	}
	if existingOps[0].ContentHash == nil || *existingOps[0].ContentHash != HashContent([]byte(content)) {
		t.Errorf("RecordExistingFile content hash = %v, want %q", existingOps[0].ContentHash, HashContent([]byte(content)))
	}
}

func TestWithStoreMetadataControlsWriteFileMetadata(t *testing.T) {
	ctx := context.Background()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := db.NewConnection(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to initialize test DB: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	mem := NewMemFS()
	tfs := NewTrackedFileSystem(mem, reg, nil, "template-tool").WithFileType("template").WithStoreMetadata(true)

	const tmplPath = "/template.txt"
	content := "template content"

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return tfs.WithTx(ctx, tx).WriteFile(tmplPath, []byte(content), 0644)
	})
	if err != nil {
		t.Fatalf("transaction failed: %v", err)
	}

	ops, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{FilePath: tmplPath})
	if err != nil || len(ops) == 0 {
		t.Fatalf("fetching op failed: %v", err)
	}
	if ops[0].Metadata == nil || *ops[0].Metadata != content {
		t.Errorf("expected metadata %q, got %v", content, ops[0].Metadata)
	}

	// Now with WithStoreMetadata(false)
	const noMetaPath = "/nometa.txt"
	tfsNoMeta := tfs.WithStoreMetadata(false)
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return tfsNoMeta.WithTx(ctx, tx).WriteFile(noMetaPath, []byte(content), 0644)
	})
	if err != nil {
		t.Fatalf("transaction failed: %v", err)
	}
	opsNoMeta, err := reg.GetFileOperations(ctx, registry.FileOperationFilter{FilePath: noMetaPath})
	if err != nil || len(opsNoMeta) == 0 {
		t.Fatalf("fetching op failed: %v", err)
	}
	if opsNoMeta[0].Metadata != nil {
		t.Errorf("expected nil metadata with WithStoreMetadata(false), got %v", *opsNoMeta[0].Metadata)
	}
}

func TestRemoveAllLogsSingleINFOLineForTree(t *testing.T) {
	mem := NewMemFS()
	reg := registry.NewRegistry(nil)
	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelDefault})
	tfs := NewTrackedFileSystem(mem, reg, testLog, "test-tool")

	if err := mem.MkdirAll("/dir/sub/nested", 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := mem.WriteFile("/dir/sub/nested/file1.txt", []byte("a"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := mem.WriteFile("/dir/sub/file2.txt", []byte("b"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := mem.WriteFile("/dir/file3.txt", []byte("c"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if err := tfs.RemoveAll("/dir"); err != nil {
		t.Fatalf("RemoveAll: %v", err)
	}

	output := logBuf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")
	infoLines := 0
	for _, l := range lines {
		if strings.Contains(l, "INFO") && strings.Contains(l, "rm") {
			infoLines++
		}
	}
	if infoLines != 1 {
		t.Errorf("expected exactly 1 INFO line for rm tree, got %d. Log output:\n%s", infoLines, output)
	}
}

func TestCopyTreeLogsSingleINFOLineForTree(t *testing.T) {
	mem := NewMemFS()
	reg := registry.NewRegistry(nil)
	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelDefault})
	tfs := NewTrackedFileSystem(mem, reg, testLog, "test-tool")

	if err := mem.MkdirAll("/src/sub/nested", 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := mem.WriteFile("/src/sub/nested/file1.txt", []byte("a"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := mem.WriteFile("/src/sub/file2.txt", []byte("b"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := mem.Symlink("/src/sub/file2.txt", "/src/sub/link.txt"); err != nil {
		t.Fatalf("Symlink: %v", err)
	}

	if err := CopyTree(tfs, "/src", "/dest"); err != nil {
		t.Fatalf("CopyTree failed: %v", err)
	}

	output := logBuf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")
	infoLines := 0
	for _, l := range lines {
		if strings.Contains(l, "INFO") {
			infoLines++
			if !strings.Contains(l, "cp -R /src /dest") {
				t.Errorf("unexpected INFO line during CopyTree: %s", l)
			}
		}
	}
	if infoLines != 1 {
		t.Errorf("expected exactly 1 INFO line for CopyTree, got %d. Log output:\n%s", infoLines, output)
	}

	// Verify entries exist in dest
	exists, err := mem.Exists("/dest/sub/nested/file1.txt")
	if err != nil || !exists {
		t.Errorf("dest file does not exist")
	}
	linkTarget, err := mem.Readlink("/dest/sub/link.txt")
	if err != nil || linkTarget != "/src/sub/file2.txt" {
		t.Errorf("dest symlink target = %q, want /src/sub/file2.txt", linkTarget)
	}
}

func TestCopyTreeVerboseLogsPerEntryAtDebug(t *testing.T) {
	mem := NewMemFS()
	reg := registry.NewRegistry(nil)
	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelVerbose})
	tfs := NewTrackedFileSystem(mem, reg, testLog, "test-tool")

	if err := mem.MkdirAll("/src/sub", 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := mem.WriteFile("/src/sub/file.txt", []byte("data"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := mem.Symlink("/src/sub/file.txt", "/src/sub/link.txt"); err != nil {
		t.Fatalf("Symlink: %v", err)
	}

	if err := CopyTree(tfs, "/src", "/dest"); err != nil {
		t.Fatalf("CopyTree failed: %v", err)
	}

	output := logBuf.String()
	if !strings.Contains(output, "INFO") || !strings.Contains(output, "cp -R /src /dest") {
		t.Errorf("expected tree INFO log line in output:\n%s", output)
	}
	if !strings.Contains(output, "DEBUG") {
		t.Errorf("expected per-entry DEBUG lines in verbose output:\n%s", output)
	}
	if !strings.Contains(output, "ln -s") {
		t.Errorf("expected symlink debug line in output:\n%s", output)
	}
}

func TestWithSuppressLoggingDirectOperations(t *testing.T) {
	mem := NewMemFS()
	var logBuf bytes.Buffer
	testLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelDefault})
	tfs := NewTrackedFileSystem(mem, nil, testLog, "test-tool").WithSuppressLogging(true)

	if err := tfs.WriteFile("/suppressed.txt", []byte("test"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := tfs.Chmod("/suppressed.txt", 0600); err != nil {
		t.Fatalf("Chmod: %v", err)
	}
	if err := tfs.Symlink("/suppressed.txt", "/link.txt"); err != nil {
		t.Fatalf("Symlink: %v", err)
	}
	if err := tfs.Remove("/link.txt"); err != nil {
		t.Fatalf("Remove: %v", err)
	}

	// At LogLevelDefault, suppressed logs (which go to Debug) should produce 0 output lines
	if logBuf.Len() != 0 {
		t.Errorf("expected 0 log output for suppressed operations at default log level, got: %q", logBuf.String())
	}
}

type spyReadDirFS struct {
	FS
	readDirCalls int
}

func (s *spyReadDirFS) ReadDir(path string) ([]string, error) {
	s.readDirCalls++
	return s.FS.ReadDir(path)
}

func TestRemoveAllWithoutTxOrDebugDoesNotWalkTree(t *testing.T) {
	mem := NewMemFS()
	spy := &spyReadDirFS{FS: mem}
	tfs := NewTrackedFileSystem(spy, nil, nil, "test-tool")

	if err := mem.MkdirAll("/dir/sub/nested", 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := mem.WriteFile("/dir/sub/nested/file.txt", []byte("a"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if err := tfs.RemoveAll("/dir"); err != nil {
		t.Fatalf("RemoveAll failed: %v", err)
	}

	if spy.readDirCalls != 0 {
		t.Errorf("expected 0 ReadDir calls when removing without tx or debug log, got %d", spy.readDirCalls)
	}

	// Now with debug/verbose logging enabled, it should walk the tree to log per-entry
	if err := mem.MkdirAll("/dir2/sub/nested", 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := mem.WriteFile("/dir2/sub/nested/file.txt", []byte("a"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	var logBuf bytes.Buffer
	debugLog := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelVerbose})
	tfsDebug := NewTrackedFileSystem(spy, nil, debugLog, "test-tool")

	if err := tfsDebug.RemoveAll("/dir2"); err != nil {
		t.Fatalf("RemoveAll failed: %v", err)
	}

	if spy.readDirCalls == 0 {
		t.Errorf("expected > 0 ReadDir calls when removing with debug log enabled, got %d", spy.readDirCalls)
	}
}
