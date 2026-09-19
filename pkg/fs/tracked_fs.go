package fs

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
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
	// blockID names the managed block the writes made through this filesystem own,
	// and is empty when they own the whole file.
	blockID string
	// targetMode is the permission the tool declared for what it writes, which the
	// drift engine later measures the file on disk against.
	targetMode *registry.Permission
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

// clone yields a copy every With* configurator then adjusts one field of. Copying
// rather than mutating is what keeps a mode or a block scoped to the writes the
// caller configured it for.
func (t *TrackedFileSystem) clone() *TrackedFileSystem {
	copied := *t
	return &copied
}

// WithTx yields a copy of the TrackedFileSystem bound to a transaction and context.
func (t *TrackedFileSystem) WithTx(ctx context.Context, tx *sql.Tx) *TrackedFileSystem {
	next := t.clone()
	next.ctx = ctx
	next.tx = tx
	return next
}

// WithFileType yields a copy of the TrackedFileSystem with a specific fileType.
func (t *TrackedFileSystem) WithFileType(fileType string) *TrackedFileSystem {
	next := t.clone()
	next.fileType = fileType
	return next
}

// WithToolName yields a copy of the TrackedFileSystem with a specific toolName.
func (t *TrackedFileSystem) WithToolName(toolName string) *TrackedFileSystem {
	next := t.clone()
	next.toolName = toolName
	return next
}

// WithBlock yields a copy whose operations are recorded as owning one managed block
// of the file they write, rather than the whole file.
func (t *TrackedFileSystem) WithBlock(blockID string) *TrackedFileSystem {
	next := t.clone()
	next.blockID = blockID
	return next
}

// WithTargetMode yields a copy that records the permission the tool declared
// alongside every operation, so a mode drifting away from its declaration can be
// noticed later.
func (t *TrackedFileSystem) WithTargetMode(mode os.FileMode) *TrackedFileSystem {
	next := t.clone()
	perm := registry.Permission(fmt.Sprintf("0%o", mode&os.ModePerm))
	next.targetMode = &perm
	return next
}

// RecordExistingSymlink logs an already correct symlink to the registry.
func (t *TrackedFileSystem) RecordExistingSymlink(target string, linkPath string) error {
	return t.recordOperation(operationDetails{opType: "symlink", path: linkPath, targetPath: &target})
}

// RecordExistingFile logs a file that already holds the wanted content to the registry
// as if it had just been written, without touching it. It is the file counterpart of
// RecordExistingSymlink: the tool owns the file either way, and an unrecorded one would
// escape the stale cleanup once its declaration disappears.
//
// The hash is read back off the disk rather than assumed, because this is the path a
// repeated generate takes and the file still has to carry a base version.
func (t *TrackedFileSystem) RecordExistingFile(path string) error {
	details := operationDetails{opType: "writeFile", path: path}
	if info, err := t.fs.Lstat(path); err == nil {
		size := info.Size()
		details.sizeBytes = &size
		perm := registry.Permission(fmt.Sprintf("0%o", info.Mode().Perm()))
		details.permissions = &perm
	}
	if data, err := t.fs.ReadFile(path); err == nil {
		details.contentHash = ptrTo(HashContent(data))
		details.metadata = ptrTo(string(data))
	}
	return t.recordOperation(details)
}

// operationDetails is what one recorded operation says about itself beyond the tool
// and transaction the filesystem already carries.
type operationDetails struct {
	opType      string
	path        string
	targetPath  *string
	metadata    *string
	sizeBytes   *int64
	permissions *registry.Permission
	contentHash *string
}

// HashContent returns the hex-encoded SHA-256 of what was written. It is the base
// version the drift engine measures a file against on a later run.
func HashContent(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// ptrTo is the address-of helper the optional record fields need.
func ptrTo[T any](value T) *T {
	return &value
}

func (t *TrackedFileSystem) recordOperation(details operationDetails) error {
	if t.tx == nil || t.reg == nil {
		return nil
	}
	record := &registry.FileOperationRecord{
		ToolName:      t.toolName,
		OperationType: details.opType,
		FilePath:      details.path,
		TargetPath:    details.targetPath,
		FileType:      t.fileType,
		Metadata:      details.metadata,
		SizeBytes:     details.sizeBytes,
		Permissions:   details.permissions,
		CreatedAt:     time.Now().UnixMilli(),
		OperationID:   t.operationID,
		ContentHash:   details.contentHash,
		TargetMode:    t.targetMode,
	}
	if t.blockID != "" {
		record.BlockID = &t.blockID
	}
	return t.reg.RecordFileOperation(t.ctx, t.tx, record)
}

// FS Interface Implementations:

func (t *TrackedFileSystem) ReadFile(path string) ([]byte, error) {
	return t.fs.ReadFile(path)
}

func (t *TrackedFileSystem) getLogger() *logger.Logger {
	if t.log != nil {
		if t.toolName != "" {
			return t.log.WithTag(t.toolName)
		}
		return t.log
	}
	return nil
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
	l := t.getLogger()
	if l != nil {
		l.Info(logger.Message(fmt.Sprintf("write %s", t.ContractHomePath(path))))
	}
	sizeBytes := int64(len(data))
	permVal := registry.Permission(fmt.Sprintf("0%o", perm&os.ModePerm))
	return t.recordOperation(operationDetails{
		opType:      "writeFile",
		path:        path,
		metadata:    ptrTo(string(data)),
		sizeBytes:   &sizeBytes,
		permissions: &permVal,
		contentHash: ptrTo(HashContent(data)),
	})
}

// HomeDir returns the home directory path associated with the underlying filesystem, or from the OS.
func (t *TrackedFileSystem) HomeDir() string {
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
	return utils.ContractHomePath(t.HomeDir(), path)
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
	_ = t.recordOperation(operationDetails{opType: "writeFile", path: path, permissions: &permVal})
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
		l := t.getLogger()
		if l != nil {
			l.Info(logger.Message(fmt.Sprintf("rm %s", t.ContractHomePath(path))))
		}
		return t.recordOperation(operationDetails{opType: "rm", path: path})
	}
	return nil
}

func (t *TrackedFileSystem) RecordRemoved(path string) error {
	return t.recordOperation(operationDetails{opType: "rm", path: path})
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
		return t.recordOperation(operationDetails{opType: "mkdir", path: path})
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
	return w.t.recordOperation(operationDetails{opType: "writeFile", path: w.path, sizeBytes: &size, permissions: &permVal})
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
	l := t.getLogger()
	if l != nil {
		permStr := strings.TrimPrefix((perm & os.ModePerm).String(), "-")
		l.Info(logger.Message(fmt.Sprintf("chmod %s %s", permStr, t.ContractHomePath(path))))
	}
	permVal := registry.Permission(fmt.Sprintf("0%o", perm&os.ModePerm))
	return t.recordOperation(operationDetails{opType: "chmod", path: path, permissions: &permVal})
}

func (t *TrackedFileSystem) Rename(oldname, newname string) error {
	err := t.fs.Rename(oldname, newname)
	if err != nil {
		return err
	}
	if t.tx != nil && t.reg != nil {
		_ = t.reg.RenameFileOperationPrefix(t.ctx, t.tx, oldname, newname)
	}
	return t.recordOperation(operationDetails{opType: "rename", path: newname, targetPath: &oldname})
}

func (t *TrackedFileSystem) Symlink(oldname, newname string) error {
	err := t.fs.Symlink(oldname, newname)
	if err != nil {
		return err
	}
	l := t.getLogger()
	if l != nil {
		l.Info(logger.Message(fmt.Sprintf("ln -s %s %s", t.ContractHomePath(oldname), t.ContractHomePath(newname))))
	}
	return t.recordOperation(operationDetails{opType: "symlink", path: newname, targetPath: &oldname})
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
			if err := t.recordOperation(operationDetails{opType: "rm", path: p}); err != nil {
				return err
			}
		}
	}

	return nil
}

func (t *TrackedFileSystem) Abs(path string) (string, error) {
	return t.fs.Abs(path)
}

func (t *TrackedFileSystem) IsAbs(path string) bool {
	return t.fs.IsAbs(path)
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
	// Hashed from what actually landed at the destination rather than from the
	// source, so the recorded base is the bytes a later run will be comparing.
	var contentHash *string
	var metadata *string
	if data, err := t.fs.ReadFile(dest); err == nil {
		contentHash = ptrTo(HashContent(data))
		metadata = ptrTo(string(data))
	}
	return t.recordOperation(operationDetails{
		opType:      "writeFile",
		path:        dest,
		targetPath:  &src,
		metadata:    metadata,
		sizeBytes:   sizeBytes,
		permissions: permVal,
		contentHash: contentHash,
	})
}

// OperationID returns the current operation ID.
func (t *TrackedFileSystem) OperationID() string {
	return t.operationID
}

// CreatedAt returns the current millisecond timestamp.
func (t *TrackedFileSystem) CreatedAt() int64 {
	return time.Now().UnixMilli()
}
