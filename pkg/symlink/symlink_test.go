package symlink

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestCreateSymlink(t *testing.T) {
	t.Run("successful symlink creation", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target.txt")

		err := os.WriteFile(source, []byte("hello"), 0644)
		if err != nil {
			t.Fatalf("failed to write source: %v", err)
		}

		eval := NewEvaluator()
		wasCreated, err := eval.CreateSymlink(source, target, Options{})
		if err != nil {
			t.Fatalf("CreateSymlink failed: %v", err)
		}
		if !wasCreated {
			t.Fatalf("expected symlink to be created")
		}

		// Verify it works
		content, err := os.ReadFile(target)
		if err != nil {
			t.Fatalf("failed to read from target symlink: %v", err)
		}
		if string(content) != "hello" {
			t.Errorf("expected target content to be 'hello', got %q", string(content))
		}
	})

	t.Run("source does not exist", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "nonexistent.txt")
		target := filepath.Join(tmp, "target.txt")

		eval := NewEvaluator()
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error when source does not exist")
		}
	})

	t.Run("target already exists as correct symlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target.txt")

		err := os.WriteFile(source, []byte("hello"), 0644)
		if err != nil {
			t.Fatalf("failed to write source: %v", err)
		}

		eval := NewEvaluator()
		_, err = eval.CreateSymlink(source, target, Options{})
		if err != nil {
			t.Fatalf("first creation failed: %v", err)
		}

		// Try again
		wasCreated, err := eval.CreateSymlink(source, target, Options{})
		if err != nil {
			t.Fatalf("second creation failed: %v", err)
		}
		if wasCreated {
			t.Errorf("expected no action since symlink is already correct")
		}
	})

	t.Run("target is a wrong symlink and overwrite is true", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		wrongSource := filepath.Join(tmp, "wrong_source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(wrongSource, []byte("wrong"), 0644)

		eval := NewEvaluator()
		_, _ = eval.CreateSymlink(wrongSource, target, Options{})

		// Try to symlink target to source with overwrite = true
		wasCreated, err := eval.CreateSymlink(source, target, Options{Overwrite: true})
		if err != nil {
			t.Fatalf("overwriting symlink failed: %v", err)
		}
		if !wasCreated {
			t.Errorf("expected symlink to be updated")
		}

		content, _ := os.ReadFile(target)
		if string(content) != "hello" {
			t.Errorf("expected overwritten symlink to point to 'hello', got %q", string(content))
		}
	})

	t.Run("target is a wrong symlink and overwrite is false", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		wrongSource := filepath.Join(tmp, "wrong_source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(wrongSource, []byte("wrong"), 0644)

		eval := NewEvaluator()
		_, _ = eval.CreateSymlink(wrongSource, target, Options{})

		// Try to symlink target to source with overwrite = false
		_, err := eval.CreateSymlink(source, target, Options{Overwrite: false})
		if err == nil {
			t.Fatal("expected error when overwrite is false on existing symlink")
		}
	})

	t.Run("target is a regular file and overwrite is true", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(target, []byte("existing"), 0644)

		eval := NewEvaluator()
		wasCreated, err := eval.CreateSymlink(source, target, Options{Overwrite: true})
		if err != nil {
			t.Fatalf("overwriting file failed: %v", err)
		}
		if !wasCreated {
			t.Errorf("expected symlink to be created after overwriting file")
		}
	})

	t.Run("target is a regular file and backup is true", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(target, []byte("existing"), 0644)

		eval := NewEvaluator()
		wasCreated, err := eval.CreateSymlink(source, target, Options{Backup: true})
		if err != nil {
			t.Fatalf("backup failed: %v", err)
		}
		if !wasCreated {
			t.Errorf("expected symlink to be created after backup")
		}

		// Verify backup exists
		backupContent, err := os.ReadFile(target + ".bak")
		if err != nil {
			t.Fatalf("failed to read backup: %v", err)
		}
		if string(backupContent) != "existing" {
			t.Errorf("backup content mismatch: got %q", string(backupContent))
		}
	})

	t.Run("target is a regular file and overwrite/backup are false", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(target, []byte("existing"), 0644)

		eval := NewEvaluator()
		_, err := eval.CreateSymlink(source, target, Options{Overwrite: false, Backup: false})
		if err == nil {
			t.Fatal("expected error because target already exists")
		}
	})

	t.Run("target is a directory and overwrite is true", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.MkdirAll(target, 0755)

		eval := NewEvaluator()
		wasCreated, err := eval.CreateSymlink(source, target, Options{Overwrite: true})
		if err != nil {
			t.Fatalf("overwriting directory failed: %v", err)
		}
		if !wasCreated {
			t.Errorf("expected symlink to be created after overwriting directory")
		}
	})
}

func TestRemoveSymlink(t *testing.T) {
	t.Run("remove existing symlink with source verification", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)

		eval := NewEvaluator()
		_, _ = eval.CreateSymlink(source, target, Options{})

		wasRemoved, err := eval.RemoveSymlink(target, source)
		if err != nil {
			t.Fatalf("RemoveSymlink failed: %v", err)
		}
		if !wasRemoved {
			t.Errorf("expected symlink to be removed")
		}

		// Ensure it's gone
		if _, err := os.Lstat(target); !os.IsNotExist(err) {
			t.Errorf("expected target to be deleted, got error: %v", err)
		}
	})

	t.Run("do not remove if verifySource mismatch", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		otherSource := filepath.Join(tmp, "other_source.txt")
		target := filepath.Join(tmp, "target.txt")

		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(otherSource, []byte("other"), 0644)

		eval := NewEvaluator()
		_, _ = eval.CreateSymlink(source, target, Options{})

		wasRemoved, err := eval.RemoveSymlink(target, otherSource)
		if err != nil {
			t.Fatalf("RemoveSymlink failed: %v", err)
		}
		if wasRemoved {
			t.Errorf("expected symlink not to be removed due to mismatch")
		}

		// Ensure it's still there
		if _, err := os.Lstat(target); err != nil {
			t.Errorf("expected target to still exist, got: %v", err)
		}
	})

	t.Run("not a symlink, do not remove", func(t *testing.T) {
		tmp := t.TempDir()
		target := filepath.Join(tmp, "target.txt")
		_ = os.WriteFile(target, []byte("regular file"), 0644)

		eval := NewEvaluator()
		wasRemoved, err := eval.RemoveSymlink(target, "")
		if err != nil {
			t.Fatalf("RemoveSymlink failed: %v", err)
		}
		if wasRemoved {
			t.Errorf("expected regular file not to be removed")
		}
	})

	t.Run("nonexistent target returns false", func(t *testing.T) {
		tmp := t.TempDir()
		target := filepath.Join(tmp, "nonexistent.txt")

		eval := NewEvaluator()
		wasRemoved, err := eval.RemoveSymlink(target, "")
		if err != nil {
			t.Fatalf("RemoveSymlink failed: %v", err)
		}
		if wasRemoved {
			t.Errorf("expected false for nonexistent target")
		}
	})

	t.Run("creating target parent directory fails", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		parentFile := filepath.Join(tmp, "file_parent")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		_ = os.WriteFile(parentFile, []byte("not a dir"), 0644)

		target := filepath.Join(parentFile, "target.txt")

		eval := NewEvaluator()
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error because parent is a file, so MkdirAll should fail")
		}
	})

	t.Run("stat source fails due to null byte", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source\x00.txt")
		target := filepath.Join(tmp, "target.txt")

		eval := NewEvaluator()
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error due to null byte in source path")
		}
	})

	t.Run("lstat target fails due to null byte", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target\x00.txt")

		eval := NewEvaluator()
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error due to null byte in target path")
		}
	})

	t.Run("lstat target fails in RemoveSymlink due to null byte", func(t *testing.T) {
		target := "target\x00.txt"
		eval := NewEvaluator()
		_, err := eval.RemoveSymlink(target, "")
		if err == nil {
			t.Fatal("expected error due to null byte in target path")
		}
	})

	t.Run("remove symlink fails due to permission", func(t *testing.T) {
		if os.Getuid() == 0 {
			t.Skip("skipping permission test for root user")
		}

		tmp := t.TempDir()
		dir := filepath.Join(tmp, "restricted")
		_ = os.MkdirAll(dir, 0755)

		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)

		target := filepath.Join(dir, "target.txt")

		eval := NewEvaluator()
		_, _ = eval.CreateSymlink(source, target, Options{})

		_ = os.Chmod(dir, 0500)
		defer os.Chmod(dir, 0755)

		_, err := eval.RemoveSymlink(target, "")
		if err == nil {
			t.Fatal("expected error removing symlink from restricted directory")
		}
	})
}

type mockFS struct {
	fs.FS
	errAbs       error
	errStat      error
	errLstat     error
	errReadlink  error
	errRemove    error
	errRemoveAll error
	errMkdirAll  error
	errSymlink   error
	errRename    error
}

func (m *mockFS) init() {
	if m.FS == nil {
		m.FS = fs.NewOSFS()
	}
}

func (m *mockFS) Abs(path string) (string, error) {
	if m.errAbs != nil {
		return "", m.errAbs
	}
	m.init()
	return m.FS.Abs(path)
}

func (m *mockFS) Stat(path string) (os.FileInfo, error) {
	if m.errStat != nil {
		return nil, m.errStat
	}
	m.init()
	return m.FS.Stat(path)
}

func (m *mockFS) Lstat(path string) (os.FileInfo, error) {
	if m.errLstat != nil {
		return nil, m.errLstat
	}
	m.init()
	return m.FS.Lstat(path)
}

func (m *mockFS) Readlink(path string) (string, error) {
	if m.errReadlink != nil {
		return "", m.errReadlink
	}
	m.init()
	return m.FS.Readlink(path)
}

func (m *mockFS) Remove(path string) error {
	if m.errRemove != nil {
		return m.errRemove
	}
	m.init()
	return m.FS.Remove(path)
}

func (m *mockFS) RemoveAll(path string) error {
	if m.errRemoveAll != nil {
		return m.errRemoveAll
	}
	m.init()
	return m.FS.RemoveAll(path)
}

func (m *mockFS) MkdirAll(path string, perm os.FileMode) error {
	if m.errMkdirAll != nil {
		return m.errMkdirAll
	}
	m.init()
	return m.FS.MkdirAll(path, perm)
}

func (m *mockFS) Symlink(oldname, newname string) error {
	if m.errSymlink != nil {
		return m.errSymlink
	}
	m.init()
	return m.FS.Symlink(oldname, newname)
}

func (m *mockFS) Rename(oldname, newname string) error {
	if m.errRename != nil {
		return m.errRename
	}
	m.init()
	return m.FS.Rename(oldname, newname)
}

func TestCreateSymlinkMockErrors(t *testing.T) {
	mockErr := os.ErrPermission

	t.Run("Abs source error", func(t *testing.T) {
		m := &mockFS{errAbs: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink("a", "b", Options{})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Abs target error", func(t *testing.T) {
		m := &mockFS{}
		// Make Abs error only on target
		m.errAbs = nil
		eval := NewEvaluatorWithFS(&errorAbsOnTargetFS{m})
		_, err := eval.CreateSymlink("a", "b", Options{})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Stat error other than not exist", func(t *testing.T) {
		m := &mockFS{errStat: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink("a", "b", Options{})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Symlink error", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")

		m := &mockFS{errSymlink: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Lstat target error in CreateSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")

		m := &mockFS{errLstat: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Readlink target error in CreateSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")

		// Create a real symlink first so Lstat identifies it as a symlink
		_ = os.Symlink(source, target)

		m := &mockFS{errReadlink: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Remove existing wrong symlink error in CreateSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		other := filepath.Join(tmp, "other.txt")
		_ = os.WriteFile(other, []byte("other"), 0644)
		target := filepath.Join(tmp, "target.txt")

		_ = os.Symlink(other, target)

		m := &mockFS{errRemove: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{Overwrite: true})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Rename backup error in CreateSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")
		_ = os.WriteFile(target, []byte("hello"), 0644)

		m := &mockFS{errRename: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{Backup: true})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Remove target error in CreateSymlink (overwrite file)", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")
		_ = os.WriteFile(target, []byte("hello"), 0644)

		m := &mockFS{errRemove: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{Overwrite: true})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("RemoveAll target error in CreateSymlink (overwrite dir)", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target_dir")
		_ = os.MkdirAll(target, 0755)

		m := &mockFS{errRemoveAll: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.CreateSymlink(source, target, Options{Overwrite: true})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Abs target error in RemoveSymlink", func(t *testing.T) {
		m := &mockFS{errAbs: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.RemoveSymlink("target", "")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Lstat error in RemoveSymlink", func(t *testing.T) {
		m := &mockFS{errLstat: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.RemoveSymlink("target", "")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Readlink error in RemoveSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")
		_ = os.Symlink(source, target)

		m := &mockFS{errReadlink: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.RemoveSymlink(target, source)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Remove error in RemoveSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")
		_ = os.Symlink(source, target)

		m := &mockFS{errRemove: mockErr}
		eval := NewEvaluatorWithFS(m)
		_, err := eval.RemoveSymlink(target, source)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Abs source error in RemoveSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")
		_ = os.Symlink(source, target)

		m := &mockFS{}
		eval := NewEvaluatorWithFS(&errorAbsOnSpecificFS{m, "source.txt"})
		_, err := eval.RemoveSymlink(target, source)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("Abs resolved link target error in RemoveSymlink", func(t *testing.T) {
		tmp := t.TempDir()
		source := filepath.Join(tmp, "source.txt")
		_ = os.WriteFile(source, []byte("hello"), 0644)
		target := filepath.Join(tmp, "target.txt")
		_ = os.Symlink(source, target)

		m := &mockFS{}
		eval := NewEvaluatorWithFS(&errorAbsOnSpecificFS{m, "source.txt"})
		_, err := eval.RemoveSymlink(target, "other.txt")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

type errorAbsOnTargetFS struct {
	*mockFS
}

func (e *errorAbsOnTargetFS) Abs(path string) (string, error) {
	if filepath.Base(path) == "b" {
		return "", os.ErrPermission
	}
	e.mockFS.init()
	return e.mockFS.FS.Abs(path)
}

type errorAbsOnSpecificFS struct {
	*mockFS
	failOn string
}

func (e *errorAbsOnSpecificFS) Abs(path string) (string, error) {
	if filepath.Base(path) == e.failOn {
		return "", os.ErrPermission
	}
	e.mockFS.init()
	return e.mockFS.FS.Abs(path)
}
