package venv

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestManager_Create(t *testing.T) {
	tests := []struct {
		name        string
		parentDir   string
		envName     string
		force       bool
		setupFS     func() fs.FS
		wantErr     bool
		wantEnvDir  string
		wantEnvName string
	}{
		{
			name:      "successful create",
			parentDir: "/home/user/.dotfiles",
			envName:   "myenv",
			force:     false,
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			wantErr:     false,
			wantEnvDir:  "/home/user/.dotfiles/myenv",
			wantEnvName: "myenv",
		},
		{
			name:      "already exists error",
			parentDir: "/home/user/.dotfiles",
			envName:   "myenv",
			force:     false,
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user/.dotfiles/myenv", 0755)
				return mem
			},
			wantErr: true,
		},
		{
			name:      "already exists with force success",
			parentDir: "/home/user/.dotfiles",
			envName:   "myenv",
			force:     true,
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user/.dotfiles/myenv", 0755)
				_ = mem.WriteFile("/home/user/.dotfiles/myenv/source", []byte("some old content"), 0755)
				return mem
			},
			wantErr:     false,
			wantEnvDir:  "/home/user/.dotfiles/myenv",
			wantEnvName: "myenv",
		},
		{
			name:      "empty parent dir error",
			parentDir: "",
			envName:   "myenv",
			force:     false,
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			wantErr: true,
		},
		{
			name:      "empty env name error",
			parentDir: "/home/user/.dotfiles",
			envName:   "",
			force:     false,
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mem := tt.setupFS()
			mgr := NewManager(mem)
			info, err := mgr.Create(tt.parentDir, tt.envName, tt.force)

			if (err != nil) != tt.wantErr {
				t.Fatalf("Create() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr {
				if info.EnvDir != tt.wantEnvDir {
					t.Errorf("Create() EnvDir = %q, want %q", info.EnvDir, tt.wantEnvDir)
				}
				if info.EnvName != tt.wantEnvName {
					t.Errorf("Create() EnvName = %q, want %q", info.EnvName, tt.wantEnvName)
				}

				// Verify files were created
				exists, _ := mem.Exists(fmt.Sprintf("%s/%s", tt.wantEnvDir, SourceFile))
				if !exists {
					t.Errorf("expected source activation file to exist")
				}
				exists, _ = mem.Exists(fmt.Sprintf("%s/%s", tt.wantEnvDir, PowerShellFile))
				if !exists {
					t.Errorf("expected PowerShell activation file to exist")
				}
				exists, _ = mem.Exists(fmt.Sprintf("%s/%s", tt.wantEnvDir, ConfigFile))
				if !exists {
					t.Errorf("expected config file to exist")
				}
			}
		})
	}
}

func TestManager_IsValidEnv_AndDelete(t *testing.T) {
	mem := fs.NewMemFS()
	mgr := NewManager(mem)

	// Case 1: Empty or nonexistent env is invalid
	valid, err := mgr.IsValidEnv("")
	if err != nil {
		t.Fatalf("IsValidEnv failed: %v", err)
	}
	if valid {
		t.Errorf("expected empty string not to be valid env")
	}

	valid, err = mgr.IsValidEnv("/home/user/.dotfiles/nonexistent")
	if err != nil {
		t.Fatalf("IsValidEnv failed: %v", err)
	}
	if valid {
		t.Errorf("expected nonexistent path not to be valid env")
	}

	// Case 2: Create a valid env, verify it's valid
	info, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	valid, err = mgr.IsValidEnv(info.EnvDir)
	if err != nil {
		t.Fatalf("IsValidEnv failed: %v", err)
	}
	if !valid {
		t.Errorf("expected created env to be valid")
	}

	// Case 3: Delete invalid env causes error
	err = mgr.Delete("/home/user/.dotfiles/nonexistent")
	if err == nil {
		t.Fatal("expected error deleting nonexistent env")
	}

	// Case 4: Delete valid env succeeds
	err = mgr.Delete(info.EnvDir)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// Verify it's gone
	valid, _ = mgr.IsValidEnv(info.EnvDir)
	if valid {
		t.Errorf("expected env to be invalid after deletion")
	}
}

type ErroringFS struct {
	fs.FS
	errOnExists      bool
	failOnExistsPath string
	errOnReadFile    bool
	errOnWriteFile   bool
	failOnWritePath  string
	errOnMkdirAll    bool
	failOnMkdirPath  string
	errOnRemove      bool
}

func (e *ErroringFS) Exists(path string) (bool, error) {
	if e.errOnExists {
		if e.failOnExistsPath == "" || filepath.Base(path) == e.failOnExistsPath {
			return false, fmt.Errorf("mock exists error")
		}
	}
	return e.FS.Exists(path)
}

func (e *ErroringFS) ReadFile(path string) ([]byte, error) {
	if e.errOnReadFile {
		return nil, fmt.Errorf("mock readfile error")
	}
	return e.FS.ReadFile(path)
}

func (e *ErroringFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	if e.errOnWriteFile {
		if e.failOnWritePath == "" || filepath.Base(path) == e.failOnWritePath {
			return fmt.Errorf("mock writefile error")
		}
	}
	return e.FS.WriteFile(path, data, perm)
}

func (e *ErroringFS) MkdirAll(path string, perm os.FileMode) error {
	if e.errOnMkdirAll {
		if e.failOnMkdirPath == "" || filepath.Base(path) == e.failOnMkdirPath {
			return fmt.Errorf("mock mkdirall error")
		}
	}
	return e.FS.MkdirAll(path, perm)
}

func (e *ErroringFS) Remove(path string) error {
	if e.errOnRemove {
		return fmt.Errorf("mock remove error")
	}
	return e.FS.Remove(path)
}

func TestManager_Errors(t *testing.T) {
	mem := fs.NewMemFS()

	t.Run("checking existence fails in Create", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnExists: true}
		mgr := NewManager(errFS)
		_, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
		if err == nil {
			t.Fatal("expected error on Exists")
		}
	})

	t.Run("creating directory fails in Create", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnMkdirAll: true}
		mgr := NewManager(errFS)
		_, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
		if err == nil {
			t.Fatal("expected error on MkdirAll")
		}
	})

	t.Run("creating tools directory fails in Create", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnMkdirAll: true, failOnMkdirPath: "tools"}
		mgr := NewManager(errFS)
		_, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
		if err == nil {
			t.Fatal("expected error on MkdirAll tools")
		}
	})

	t.Run("writing file fails in Create", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnWriteFile: true}
		mgr := NewManager(errFS)
		_, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
		if err == nil {
			t.Fatal("expected error on WriteFile")
		}
	})

	t.Run("writing source.ps1 fails in Create", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnWriteFile: true, failOnWritePath: "source.ps1"}
		mgr := NewManager(errFS)
		_, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
		if err == nil {
			t.Fatal("expected error on WriteFile source.ps1")
		}
	})

	t.Run("writing dotfiles.config.ts fails in Create", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnWriteFile: true, failOnWritePath: "dotfiles.config.ts"}
		mgr := NewManager(errFS)
		_, err := mgr.Create("/home/user/.dotfiles", "testenv", false)
		if err == nil {
			t.Fatal("expected error on WriteFile dotfiles.config.ts")
		}
	})

	t.Run("exists error in IsValidEnv", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnExists: true}
		mgr := NewManager(errFS)
		_, err := mgr.IsValidEnv("/home/user/.dotfiles/testenv")
		if err == nil {
			t.Fatal("expected error on Exists")
		}
	})

	t.Run("exists error on ConfigFile in IsValidEnv", func(t *testing.T) {
		memFS := fs.NewMemFS()
		_ = memFS.MkdirAll("/home/user/.dotfiles/testenv", 0755)
		_ = memFS.WriteFile("/home/user/.dotfiles/testenv/source", []byte(""), 0755)

		errFS := &ErroringFS{FS: memFS, errOnExists: true, failOnExistsPath: "dotfiles.config.ts"}
		mgr := NewManager(errFS)
		_, err := mgr.IsValidEnv("/home/user/.dotfiles/testenv")
		if err == nil {
			t.Fatal("expected error on Exists ConfigFile")
		}
	})

	t.Run("remove fails in Delete", func(t *testing.T) {
		memFS := fs.NewMemFS()
		mgr := NewManager(memFS)
		info, _ := mgr.Create("/home/user/.dotfiles", "testenv", false)

		errFS := &ErroringFS{FS: memFS, errOnRemove: true}
		mgrErr := NewManager(errFS)
		err := mgrErr.Delete(info.EnvDir)
		if err == nil {
			t.Fatal("expected error on Remove in Delete")
		}
	})
}
