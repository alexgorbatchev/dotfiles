package fs

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
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
	log         *logger.Logger
}

// NewTrackedFileSystem instantiates a new TrackedFileSystem wrapper.
func NewTrackedFileSystem(fsys FS, reg *registry.Registry, log *logger.Logger, toolName string) *TrackedFileSystem {
	return &TrackedFileSystem{
		fs:          fsys,
		reg:         reg,
		ctx:         context.Background(),
		toolName:    toolName,
		fileType:    "file",
		operationID: uuid.New().String(),
		log:         log,
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
		log:         t.log,
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
		log:         t.log,
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
		log:         t.log,
	}
}

// RecordExistingSymlink logs an already correct symlink to the registry.
func (t *TrackedFileSystem) RecordExistingSymlink(target string, linkPath string) error {
	return t.recordOperation("symlink", linkPath, &target, nil, nil)
}

func (t *TrackedFileSystem) recordOperation(opType string, path string, targetPath *string, sizeBytes *int64, permissions *registry.Permission) error {
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
	exists, err := t.fs.Exists(path)
	if err == nil && exists {
		info, errStat := t.fs.Stat(path)
		if errStat == nil && info.Size() == int64(len(data)) {
			identical, errCompare := t.compareContentChunked(path, data)
			if errCompare == nil && identical {
				return nil
			}
		}
	}

	err = t.fs.WriteFile(path, data, perm)
	if err != nil {
		return err
	}
	if t.log != nil {
		t.log.Info(logger.Message(fmt.Sprintf("write %s", t.ContractHomePath(path))))
	}
	sizeBytes := int64(len(data))
	permVal := registry.Permission(fmt.Sprintf("0%o", perm&os.ModePerm))
	return t.recordOperation("writeFile", path, nil, &sizeBytes, &permVal)
}

func (t *TrackedFileSystem) homeDir() string {
	type homeDirProvider interface {
		HomeDir() string
	}
	if hdp, ok := t.fs.(homeDirProvider); ok {
		return hdp.HomeDir()
	}
	h, err := os.UserHomeDir()
	if err == nil {
		return h
	}
	return ""
}

func (t *TrackedFileSystem) ContractHomePath(path string) string {
	return utils.ContractHomePath(t.homeDir(), path)
}

func (t *TrackedFileSystem) compareContentChunked(path string, data []byte) (bool, error) {
	rc, err := t.fs.Open(path)
	if err != nil {
		return false, err
	}
	defer rc.Close()

	buf := make([]byte, 4096)
	offset := 0
	for {
		n, err := rc.Read(buf)
		if n > 0 {
			if offset+n > len(data) {
				return false, nil
			}
			if !bytes.Equal(buf[:n], data[offset:offset+n]) {
				return false, nil
			}
			offset += n
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return false, err
		}
	}
	return offset == len(data), nil
}

func (t *TrackedFileSystem) OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	writer, err := t.fs.OpenFile(path, flag, perm)
	if err != nil {
		return nil, err
	}
	permVal := registry.Permission(fmt.Sprintf("0%o", perm&os.ModePerm))
	_ = t.recordOperation("writeFile", path, nil, nil, &permVal)
	return writer, nil
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
		if t.log != nil {
			t.log.Info(logger.Message(fmt.Sprintf("rm %s", t.ContractHomePath(path))))
		}
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
	permVal := registry.Permission("0644")
	return w.t.recordOperation("writeFile", w.path, nil, &size, &permVal)
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
	permVal := registry.Permission(fmt.Sprintf("0%o", perm&os.ModePerm))
	return t.recordOperation("chmod", path, nil, nil, &permVal)
}

func (t *TrackedFileSystem) Rename(oldname, newname string) error {
	err := t.fs.Rename(oldname, newname)
	if err != nil {
		return err
	}
	return t.recordOperation("rename", newname, &oldname, nil, nil)
}

func (t *TrackedFileSystem) Symlink(oldname, newname string) error {
	err := t.fs.Symlink(oldname, newname)
	if err != nil {
		return err
	}
	if t.log != nil {
		t.log.Info(logger.Message(fmt.Sprintf("ln -s %s %s", t.ContractHomePath(oldname), t.ContractHomePath(newname))))
	}
	return t.recordOperation("symlink", newname, &oldname, nil, nil)
}

func (t *TrackedFileSystem) Readlink(path string) (string, error) {
	return t.fs.Readlink(path)
}

func (t *TrackedFileSystem) Lstat(path string) (os.FileInfo, error) {
	return t.fs.Lstat(path)
}

func (t *TrackedFileSystem) Stat(path string) (os.FileInfo, error) {
	return t.fs.Stat(path)
}

func (t *TrackedFileSystem) RemoveAll(path string) error {
	var toDelete []string

	existed, err := t.fs.Exists(path)
	if err != nil {
		existed = false
	}

	if existed {
		toDelete = append(toDelete, path)

		info, err := t.fs.Lstat(path)
		if err == nil && info.IsDir() {
			var walk func(string) error
			walk = func(dir string) error {
				names, err := t.fs.ReadDir(dir)
				if err != nil {
					return err
				}
				for _, name := range names {
					subPath := filepath.Join(dir, name)
					toDelete = append(toDelete, subPath)
					subInfo, err := t.fs.Lstat(subPath)
					if err == nil && subInfo.IsDir() {
						if err := walk(subPath); err != nil {
							return err
						}
					}
				}
				return nil
			}
			_ = walk(path)
		}
	}

	err = t.fs.RemoveAll(path)
	if err != nil {
		return err
	}

	if existed {
		for _, p := range toDelete {
			if t.log != nil {
				t.log.Info(logger.Message(fmt.Sprintf("rm %s", t.ContractHomePath(p))))
			}
			if err := t.recordOperation("rm", p, nil, nil, nil); err != nil {
				return err
			}
		}
	}

	return nil
}

func (t *TrackedFileSystem) Abs(path string) (string, error) {
	return t.fs.Abs(path)
}

func (t *TrackedFileSystem) CopyFile(src, dest string) error {
	err := t.fs.CopyFile(src, dest)
	if err != nil {
		return err
	}
	var sizeBytes *int64
	var permVal *registry.Permission
	info, err := t.fs.Lstat(dest)
	if err == nil {
		sz := info.Size()
		sizeBytes = &sz
		p := registry.Permission(fmt.Sprintf("0%o", info.Mode().Perm()))
		permVal = &p
	}
	return t.recordOperation("writeFile", dest, &src, sizeBytes, permVal)
}
