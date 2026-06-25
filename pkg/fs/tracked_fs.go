package fs

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/google/uuid"
)

// TrackedFileSystem wraps any FS and automatically registers filesystem modifications (writes, removes, chmods, mkdirs) in the database registry.
type TrackedFileSystem struct {
	fs          FS
	reg         *registry.Registry
	tx          *sql.Tx
	ctx         context.Context
	toolName    string
	fileType    string // e.g., "file", "shim", "symlink"
	operationID string
}

// NewTrackedFileSystem instantiates a new TrackedFileSystem wrapper.
func NewTrackedFileSystem(fsys FS, reg *registry.Registry, toolName string) *TrackedFileSystem {
	return &TrackedFileSystem{
		fs:          fsys,
		reg:         reg,
		ctx:         context.Background(),
		toolName:    toolName,
		fileType:    "file",
		operationID: uuid.New().String(),
	}
}

// WithTx yields a copy of the TrackedFileSystem bound to a transaction and context.
func (t *TrackedFileSystem) WithTx(ctx context.Context, tx *sql.Tx) *TrackedFileSystem {
	return &TrackedFileSystem{
		fs:          t.fs,
		reg:         t.reg,
		tx:          tx,
		ctx:         ctx,
		toolName:    t.toolName,
		fileType:    t.fileType,
		operationID: t.operationID,
	}
}

// WithFileType yields a copy of the TrackedFileSystem with a specific fileType.
func (t *TrackedFileSystem) WithFileType(fileType string) *TrackedFileSystem {
	return &TrackedFileSystem{
		fs:          t.fs,
		reg:         t.reg,
		tx:          t.tx,
		ctx:         t.ctx,
		toolName:    t.toolName,
		fileType:    fileType,
		operationID: t.operationID,
	}
}

// WithToolName yields a copy of the TrackedFileSystem with a specific toolName.
func (t *TrackedFileSystem) WithToolName(toolName string) *TrackedFileSystem {
	return &TrackedFileSystem{
		fs:          t.fs,
		reg:         t.reg,
		tx:          t.tx,
		ctx:         t.ctx,
		toolName:    toolName,
		fileType:    t.fileType,
		operationID: t.operationID,
	}
}

// RecordExistingSymlink logs an already correct symlink to the registry.
func (t *TrackedFileSystem) RecordExistingSymlink(target string, linkPath string) error {
	return t.recordOperation("symlink", linkPath, &target, nil, nil)
}

func (t *TrackedFileSystem) recordOperation(opType string, path string, targetPath *string, sizeBytes *int64, permissions *string) error {
	if t.tx == nil || t.reg == nil {
		return nil
	}
	now := time.Now().UnixMilli()
	record := &registry.FileOperationRecord{
		ToolName:      t.toolName,
		OperationType: opType,
		FilePath:      path,
		TargetPath:    targetPath,
		FileType:      t.fileType,
		SizeBytes:     sizeBytes,
		Permissions:   permissions,
		CreatedAt:     now,
		OperationID:   t.operationID,
	}
	return t.reg.RecordFileOperation(t.ctx, t.tx, record)
}

// FS Interface Implementations:

func (t *TrackedFileSystem) ReadFile(path string) ([]byte, error) {
	return t.fs.ReadFile(path)
}

func (t *TrackedFileSystem) WriteFile(path string, data []byte, perm os.FileMode) error {
	err := t.fs.WriteFile(path, data, perm)
	if err != nil {
		return err
	}
	sizeBytes := int64(len(data))
	permStr := fmt.Sprintf("0%o", perm&os.ModePerm)
	return t.recordOperation("writeFile", path, nil, &sizeBytes, &permStr)
}

func (t *TrackedFileSystem) Remove(path string) error {
	existed, err := t.fs.Exists(path)
	if err != nil {
		existed = false
	}
	err = t.fs.Remove(path)
	if err != nil {
		return err
	}
	if existed {
		return t.recordOperation("rm", path, nil, nil, nil)
	}
	return nil
}

func (t *TrackedFileSystem) Exists(path string) (bool, error) {
	return t.fs.Exists(path)
}

func (t *TrackedFileSystem) MkdirAll(path string, perm os.FileMode) error {
	existed, err := t.fs.Exists(path)
	if err != nil {
		existed = false
	}
	err = t.fs.MkdirAll(path, perm)
	if err != nil {
		return err
	}
	if !existed {
		return t.recordOperation("mkdir", path, nil, nil, nil)
	}
	return nil
}

type trackedFileWriter struct {
	io.WriteCloser
	t    *TrackedFileSystem
	path string
	size int64
}

func (w *trackedFileWriter) Write(p []byte) (int, error) {
	n, err := w.WriteCloser.Write(p)
	w.size += int64(n)
	return n, err
}

func (w *trackedFileWriter) Close() error {
	err := w.WriteCloser.Close()
	if err != nil {
		return err
	}
	size := w.size
	permStr := "0644"
	return w.t.recordOperation("writeFile", w.path, nil, &size, &permStr)
}

func (t *TrackedFileSystem) Create(path string) (io.WriteCloser, error) {
	wc, err := t.fs.Create(path)
	if err != nil {
		return nil, err
	}
	return &trackedFileWriter{
		WriteCloser: wc,
		t:           t,
		path:        path,
	}, nil
}

func (t *TrackedFileSystem) Open(path string) (io.ReadCloser, error) {
	return t.fs.Open(path)
}

func (t *TrackedFileSystem) ReadDir(path string) ([]string, error) {
	return t.fs.ReadDir(path)
}

func (t *TrackedFileSystem) Chmod(path string, perm os.FileMode) error {
	err := t.fs.Chmod(path, perm)
	if err != nil {
		return err
	}
	permStr := fmt.Sprintf("0%o", perm&os.ModePerm)
	return t.recordOperation("chmod", path, nil, nil, &permStr)
}

func (t *TrackedFileSystem) Rename(oldname, newname string) error {
	err := t.fs.Rename(oldname, newname)
	if err != nil {
		return err
	}
	return t.recordOperation("rename", newname, &oldname, nil, nil)
}
