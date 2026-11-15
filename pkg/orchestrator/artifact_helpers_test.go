package orchestrator

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// artifactFailureFS models a failed operation on one owned path while allowing
// unrelated tools in the batch to proceed normally.
type artifactFailureFS struct {
	fs.FS
	operation, path string
	err             error
}

func (f *artifactFailureFS) Remove(path string) error {
	if f.operation == "remove" && path == f.path {
		return f.err
	}
	return f.FS.Remove(path)
}
func (f *artifactFailureFS) Lstat(path string) (os.FileInfo, error) {
	if f.operation == "lstat" && path == f.path {
		return nil, f.err
	}
	return f.FS.Lstat(path)
}
func (f *artifactFailureFS) ReadFile(path string) ([]byte, error) {
	if f.operation == "read" && path == f.path {
		return nil, f.err
	}
	return f.FS.ReadFile(path)
}

func (f *artifactFailureFS) Exists(path string) (bool, error) {
	if f.operation == "exists" && path == f.path {
		return false, f.err
	}
	return f.FS.Exists(path)
}
func (f *artifactFailureFS) Symlink(source, target string) error {
	if f.operation == "symlink" && target == f.path {
		return f.err
	}
	return f.FS.Symlink(source, target)
}

func seedStaleArtifact(t *testing.T, o *Orchestrator, mem *fs.MemFS, tool, path, kind string) {
	t.Helper()
	operation := "write"
	if kind == "symlink" {
		operation = "symlink"
		if err := mem.Symlink("/missing-source", path); err != nil {
			t.Fatal(err)
		}
	} else {
		writeDecl(t, mem, path, "stale artifact")
	}
	hash := fs.HashContent([]byte("stale artifact"))
	if err := o.reg.WithTx(context.Background(), func(tx *sql.Tx) error {
		return o.reg.RecordFileOperation(context.Background(), tx, &registry.FileOperationRecord{
			ToolName: tool, FilePath: path, FileType: kind, OperationType: operation, ContentHash: &hash,
		})
	}); err != nil {
		t.Fatal(err)
	}
}
