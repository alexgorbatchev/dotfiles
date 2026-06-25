package shellinit

import (
	"fmt"
	"os"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestInjector_Inject(t *testing.T) {
	tests := []struct {
		name        string
		setupFS     func() fs.FS
		opts        InjectOptions
		wantUpdated bool
		wantContent string
		wantErr     bool
	}{
		{
			name: "inject into new file",
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.zshrc",
				Shell:       "zsh",
				ScriptPath:  "/home/user/.dotfiles/init.sh",
			},
			wantUpdated: true,
			wantContent: "# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/init.sh\"\n",
		},
		{
			name: "inject into existing empty file",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				_ = mem.WriteFile("/home/user/.bashrc", []byte(""), 0644)
				return mem
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.bashrc",
				Shell:       "bash",
				ScriptPath:  "/home/user/.dotfiles/init.sh",
			},
			wantUpdated: true,
			wantContent: "# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/init.sh\"\n",
		},
		{
			name: "inject into file with existing content",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				_ = mem.WriteFile("/home/user/.zshrc", []byte("export FOO=bar\n"), 0644)
				return mem
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.zshrc",
				Shell:       "zsh",
				ScriptPath:  "/home/user/.dotfiles/init.sh",
			},
			wantUpdated: true,
			wantContent: "export FOO=bar\n\n# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/init.sh\"\n",
		},
		{
			name: "update existing block in file",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				existing := "export FOO=bar\n\n# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/old_init.sh\"\nsome other setting\n"
				_ = mem.WriteFile("/home/user/.zshrc", []byte(existing), 0644)
				return mem
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.zshrc",
				Shell:       "zsh",
				ScriptPath:  "/home/user/.dotfiles/new_init.sh",
			},
			wantUpdated: true,
			wantContent: "export FOO=bar\n\n# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/new_init.sh\"\nsome other setting\n",
		},
		{
			name: "no update needed if block matches exactly",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				existing := "export FOO=bar\n\n# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/init.sh\"\n"
				_ = mem.WriteFile("/home/user/.zshrc", []byte(existing), 0644)
				return mem
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.zshrc",
				Shell:       "zsh",
				ScriptPath:  "/home/user/.dotfiles/init.sh",
			},
			wantUpdated: false,
			wantContent: "export FOO=bar\n\n# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/init.sh\"\n",
		},
		{
			name: "no update needed if raw source pattern exists elsewhere",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				existing := "export FOO=bar\nsource \"/home/user/.dotfiles/init.sh\"\nsome setting\n"
				_ = mem.WriteFile("/home/user/.zshrc", []byte(existing), 0644)
				return mem
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.zshrc",
				Shell:       "zsh",
				ScriptPath:  "/home/user/.dotfiles/init.sh",
			},
			wantUpdated: false,
			wantContent: "export FOO=bar\nsource \"/home/user/.dotfiles/init.sh\"\nsome setting\n",
		},
		{
			name: "empty profile path causes error",
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			opts: InjectOptions{
				ProfilePath: "",
				Shell:       "zsh",
				ScriptPath:  "/home/user/.dotfiles/init.sh",
			},
			wantUpdated: false,
			wantErr:     true,
		},
		{
			name: "empty script path causes error",
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			opts: InjectOptions{
				ProfilePath: "/home/user/.zshrc",
				Shell:       "zsh",
				ScriptPath:  "",
			},
			wantUpdated: false,
			wantErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := tt.setupFS()
			inj := NewInjector(memFS)
			gotUpdated, err := inj.Inject(tt.opts)

			if (err != nil) != tt.wantErr {
				t.Fatalf("Inject() error = %v, wantErr %v", err, tt.wantErr)
			}
			if gotUpdated != tt.wantUpdated {
				t.Errorf("Inject() wasUpdated = %v, want %v", gotUpdated, tt.wantUpdated)
			}

			if !tt.wantErr {
				bytes, err := memFS.ReadFile(tt.opts.ProfilePath)
				if err != nil {
					t.Fatalf("Failed to read profile file: %v", err)
				}
				gotContent := string(bytes)
				if gotContent != tt.wantContent {
					t.Errorf("Inject() file content =\n%q\nwant =\n%q", gotContent, tt.wantContent)
				}
			}
		})
	}
}

func TestInjector_Remove(t *testing.T) {
	tests := []struct {
		name        string
		setupFS     func() fs.FS
		profilePath string
		wantUpdated bool
		wantContent string
		wantErr     bool
	}{
		{
			name: "remove existing block",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				content := "export FOO=bar\n\n# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/init.sh\"\nsome other setting\n"
				_ = mem.WriteFile("/home/user/.zshrc", []byte(content), 0644)
				return mem
			},
			profilePath: "/home/user/.zshrc",
			wantUpdated: true,
			wantContent: "export FOO=bar\n\nsome other setting\n",
		},
		{
			name: "no block present",
			setupFS: func() fs.FS {
				mem := fs.NewMemFS()
				_ = mem.MkdirAll("/home/user", 0755)
				content := "export FOO=bar\n"
				_ = mem.WriteFile("/home/user/.zshrc", []byte(content), 0644)
				return mem
			},
			profilePath: "/home/user/.zshrc",
			wantUpdated: false,
			wantContent: "export FOO=bar\n",
		},
		{
			name: "file does not exist",
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			profilePath: "/home/user/.zshrc",
			wantUpdated: false,
			wantContent: "",
		},
		{
			name: "empty profile path error",
			setupFS: func() fs.FS {
				return fs.NewMemFS()
			},
			profilePath: "",
			wantUpdated: false,
			wantErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memFS := tt.setupFS()
			inj := NewInjector(memFS)
			gotUpdated, err := inj.Remove(tt.profilePath)

			if (err != nil) != tt.wantErr {
				t.Fatalf("Remove() error = %v, wantErr %v", err, tt.wantErr)
			}
			if gotUpdated != tt.wantUpdated {
				t.Errorf("Remove() wasUpdated = %v, want %v", gotUpdated, tt.wantUpdated)
			}

			if !tt.wantErr && tt.profilePath != "" {
				exists, _ := memFS.Exists(tt.profilePath)
				if exists {
					bytes, err := memFS.ReadFile(tt.profilePath)
					if err != nil {
						t.Fatalf("Failed to read profile file: %v", err)
					}
					gotContent := string(bytes)
					if gotContent != tt.wantContent {
						t.Errorf("Remove() file content =\n%q\nwant =\n%q", gotContent, tt.wantContent)
					}
				}
			}
		})
	}
}

type ErroringFS struct {
	fs.FS
	errOnExists    bool
	errOnReadFile  bool
	errOnWriteFile bool
	errOnMkdirAll  bool
}

func (e *ErroringFS) Exists(path string) (bool, error) {
	if e.errOnExists {
		return false, javaError("exists error")
	}
	return e.FS.Exists(path)
}

func (e *ErroringFS) ReadFile(path string) ([]byte, error) {
	if e.errOnReadFile {
		return nil, javaError("readfile error")
	}
	return e.FS.ReadFile(path)
}

func (e *ErroringFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	if e.errOnWriteFile {
		return javaError("writefile error")
	}
	return e.FS.WriteFile(path, data, perm)
}

func (e *ErroringFS) MkdirAll(path string, perm os.FileMode) error {
	if e.errOnMkdirAll {
		return javaError("mkdirall error")
	}
	return e.FS.MkdirAll(path, perm)
}

func javaError(msg string) error {
	return fmt.Errorf("mock %s", msg)
}

func TestInjector_Errors(t *testing.T) {
	baseMem := fs.NewMemFS()
	_ = baseMem.MkdirAll("/home/user", 0755)
	_ = baseMem.WriteFile("/home/user/.zshrc", []byte("export FOO=bar\n"), 0644)

	t.Run("exists error in Inject", func(t *testing.T) {
		errFS := &ErroringFS{FS: baseMem, errOnExists: true}
		inj := NewInjector(errFS)
		_, err := inj.Inject(InjectOptions{
			ProfilePath: "/home/user/.zshrc",
			Shell:       "zsh",
			ScriptPath:  "/home/user/.dotfiles/init.sh",
		})
		if err == nil {
			t.Fatal("expected error on Exists")
		}
	})

	t.Run("read error in Inject", func(t *testing.T) {
		errFS := &ErroringFS{FS: baseMem, errOnReadFile: true}
		inj := NewInjector(errFS)
		_, err := inj.Inject(InjectOptions{
			ProfilePath: "/home/user/.zshrc",
			Shell:       "zsh",
			ScriptPath:  "/home/user/.dotfiles/init.sh",
		})
		if err == nil {
			t.Fatal("expected error on ReadFile")
		}
	})

	t.Run("write error in Inject - existing block update", func(t *testing.T) {
		mem := fs.NewMemFS()
		_ = mem.MkdirAll("/home/user", 0755)
		existing := "# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/old.sh\"\n"
		_ = mem.WriteFile("/home/user/.zshrc", []byte(existing), 0644)

		errFS := &ErroringFS{FS: mem, errOnWriteFile: true}
		inj := NewInjector(errFS)
		_, err := inj.Inject(InjectOptions{
			ProfilePath: "/home/user/.zshrc",
			Shell:       "zsh",
			ScriptPath:  "/home/user/.dotfiles/new.sh",
		})
		if err == nil {
			t.Fatal("expected error on WriteFile")
		}
	})

	t.Run("mkdir error in Inject", func(t *testing.T) {
		mem := fs.NewMemFS()
		errFS := &ErroringFS{FS: mem, errOnMkdirAll: true}
		inj := NewInjector(errFS)
		_, err := inj.Inject(InjectOptions{
			ProfilePath: "/home/user/subdir/.zshrc",
			Shell:       "zsh",
			ScriptPath:  "/home/user/.dotfiles/new.sh",
		})
		if err == nil {
			t.Fatal("expected error on MkdirAll")
		}
	})

	t.Run("write error in Inject - new file", func(t *testing.T) {
		mem := fs.NewMemFS()
		errFS := &ErroringFS{FS: mem, errOnWriteFile: true}
		inj := NewInjector(errFS)
		_, err := inj.Inject(InjectOptions{
			ProfilePath: "/home/user/.zshrc",
			Shell:       "zsh",
			ScriptPath:  "/home/user/.dotfiles/new.sh",
		})
		if err == nil {
			t.Fatal("expected error on WriteFile")
		}
	})

	t.Run("exists error in Remove", func(t *testing.T) {
		errFS := &ErroringFS{FS: baseMem, errOnExists: true}
		inj := NewInjector(errFS)
		_, err := inj.Remove("/home/user/.zshrc")
		if err == nil {
			t.Fatal("expected error on Exists")
		}
	})

	t.Run("read error in Remove", func(t *testing.T) {
		errFS := &ErroringFS{FS: baseMem, errOnReadFile: true}
		inj := NewInjector(errFS)
		_, err := inj.Remove("/home/user/.zshrc")
		if err == nil {
			t.Fatal("expected error on ReadFile")
		}
	})

	t.Run("write error in Remove", func(t *testing.T) {
		mem := fs.NewMemFS()
		_ = mem.MkdirAll("/home/user", 0755)
		existing := "# Generated via dotfiles generator - do not modify\n# ------------------------------------------------------------------------------\nsource \"/home/user/.dotfiles/old.sh\"\n"
		_ = mem.WriteFile("/home/user/.zshrc", []byte(existing), 0644)

		errFS := &ErroringFS{FS: mem, errOnWriteFile: true}
		inj := NewInjector(errFS)
		_, err := inj.Remove("/home/user/.zshrc")
		if err == nil {
			t.Fatal("expected error on WriteFile")
		}
	})
}
