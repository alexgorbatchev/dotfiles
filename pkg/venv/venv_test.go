package venv

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

	// Case 5: Delete valid env on real OSFS when it contains nested tools and .generated files
	osTmp := t.TempDir()
	osMgr := NewManager(fs.NewOSFS())
	osInfo, err := osMgr.Create(osTmp, "osenv", false)
	if err != nil {
		t.Fatalf("osMgr.Create failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(osInfo.ToolsDir, "foo.tool.ts"), []byte("export default {};"), 0644); err != nil {
		t.Fatalf("writing nested tool: %v", err)
	}
	genDir := filepath.Join(osInfo.EnvDir, ".generated", "shell-scripts")
	if err := os.MkdirAll(genDir, 0755); err != nil {
		t.Fatalf("mkdir .generated: %v", err)
	}
	if err := os.WriteFile(filepath.Join(genDir, "main.zsh"), []byte("# init"), 0644); err != nil {
		t.Fatalf("writing main.zsh: %v", err)
	}
	if err := osMgr.Delete(osInfo.EnvDir); err != nil {
		t.Fatalf("Delete on OSFS with nested files failed: %v", err)
	}
	if _, err := os.Stat(osInfo.EnvDir); !os.IsNotExist(err) {
		t.Errorf("expected %s to be completely removed, stat err = %v", osInfo.EnvDir, err)
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

func (e *ErroringFS) RemoveAll(path string) error {
	if e.errOnRemove {
		return fmt.Errorf("mock removeall error")
	}
	return e.FS.RemoveAll(path)
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

	t.Run("remove fails in Create with force", func(t *testing.T) {
		memFS := fs.NewMemFS()
		mgr := NewManager(memFS)
		_, _ = mgr.Create("/home/user/.dotfiles", "testenv", false)

		errFS := &ErroringFS{FS: memFS, errOnRemove: true}
		mgrErr := NewManager(errFS)
		_, err := mgrErr.Create("/home/user/.dotfiles", "testenv", true)
		if err == nil {
			t.Fatal("expected error on RemoveAll in Create with force")
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

func TestManager_GetEnvInfo_DetectEnv_GetActiveEnv(t *testing.T) {
	mem := fs.NewMemFS()
	mgr := NewManager(mem)

	// Case 1: GetEnvInfo on empty string and non-existent env
	infoEmpty, err := mgr.GetEnvInfo("")
	if err != nil || infoEmpty != nil {
		t.Fatalf("GetEnvInfo(\"\") should return nil, nil, got info=%v, err=%v", infoEmpty, err)
	}

	info, err := mgr.GetEnvInfo("/home/user/.dotfiles/nonexistent")
	if err != nil {
		t.Fatalf("GetEnvInfo failed: %v", err)
	}
	if info != nil {
		t.Errorf("expected nil info for nonexistent env")
	}

	// Case 1b: GetEnvInfo and DetectEnv with IsValidEnv error
	errFS := &ErroringFS{FS: mem, errOnExists: true}
	mgrErr := NewManager(errFS)
	_, err = mgrErr.GetEnvInfo("/home/user/.dotfiles/someenv")
	if err == nil {
		t.Fatal("expected GetEnvInfo to return error when IsValidEnv fails")
	}
	_, err = mgrErr.DetectEnv("/home/user/.dotfiles", "someenv")
	if err == nil {
		t.Fatal("expected DetectEnv to return error when IsValidEnv fails")
	}

	// Case 1c: GetActiveEnv with nil getter
	_ = os.Unsetenv(EnvDirVar)
	_ = os.Unsetenv(EnvNameVar)
	activeNil := GetActiveEnv(nil)
	if activeNil.Active {
		t.Errorf("expected GetActiveEnv(nil) to be inactive when env vars unset")
	}

	// Case 2: Create env and test GetEnvInfo and DetectEnv
	created, err := mgr.Create("/home/user/.dotfiles", "myenv", false)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	// Check POSIX source content
	srcContent, err := mem.ReadFile(filepath.Join(created.EnvDir, SourceFile))
	if err != nil {
		t.Fatalf("failed reading POSIX source: %v", err)
	}
	for _, want := range []string{
		"_DOTFILES_OLD_PATH",
		"user-bin",
		"https://alexgorbatchev.github.io/dotfiles/install.sh",
		"main.zsh",
		"main.bash",
	} {
		if !strings.Contains(string(srcContent), want) {
			t.Errorf("POSIX source script missing %q:\n%s", want, string(srcContent))
		}
	}

	// Check PowerShell source content
	psContent, err := mem.ReadFile(filepath.Join(created.EnvDir, PowerShellFile))
	if err != nil {
		t.Fatalf("failed reading PowerShell source: %v", err)
	}
	for _, want := range []string{
		"_DOTFILES_OLD_PATH",
		"user-bin",
		"main.ps1",
	} {
		if !strings.Contains(string(psContent), want) {
			t.Errorf("PowerShell source script missing %q:\n%s", want, string(psContent))
		}
	}

	info, err = mgr.GetEnvInfo(created.EnvDir)
	if err != nil {
		t.Fatalf("GetEnvInfo failed: %v", err)
	}
	if info == nil || info.EnvName != "myenv" || info.ConfigPath == "" {
		t.Errorf("GetEnvInfo returned unexpected info: %+v", info)
	}

	// DetectEnv with custom name
	detect, err := mgr.DetectEnv("/home/user/.dotfiles", "myenv")
	if err != nil {
		t.Fatalf("DetectEnv failed: %v", err)
	}
	if !detect.Found || detect.EnvDir != created.EnvDir {
		t.Errorf("DetectEnv failed: %+v", detect)
	}

	// DetectEnv with default name when env exists
	_, _ = mgr.Create("/home/user/.dotfiles", DefaultEnvName, false)
	detectDefault, err := mgr.DetectEnv("/home/user/.dotfiles", "")
	if err != nil {
		t.Fatalf("DetectEnv default failed: %v", err)
	}
	if !detectDefault.Found || detectDefault.EnvName != DefaultEnvName {
		t.Errorf("DetectEnv default name failed: %+v", detectDefault)
	}

	// Case 3: GetActiveEnv
	envMap := map[string]string{
		EnvDirVar:  "/home/user/.dotfiles/myenv",
		EnvNameVar: "myenv",
	}
	active := GetActiveEnv(func(k string) string { return envMap[k] })
	if !active.Active || active.EnvDir != "/home/user/.dotfiles/myenv" || active.EnvName != "myenv" {
		t.Errorf("GetActiveEnv failed: %+v", active)
	}

	inactive := GetActiveEnv(func(k string) string { return "" })
	if inactive.Active {
		t.Errorf("expected inactive environment when env vars are missing")
	}
}

func TestActivationScript_BashRuntime(t *testing.T) {
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available on PATH")
	}

	t.Run("activates with dotfiles on PATH and deactivates cleanly", func(t *testing.T) {
		tmpDir := t.TempDir()
		mgr := NewManager(fs.NewOSFS())
		info, err := mgr.Create(tmpDir, ".env", false)
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}

		fakeBinDir := filepath.Join(tmpDir, "fake-bin")
		if err := os.MkdirAll(fakeBinDir, 0755); err != nil {
			t.Fatalf("mkdir fake-bin: %v", err)
		}

		// Fake dotfiles binary that writes .generated/shell-scripts/main.bash when state generate is called
		fakeDotfiles := filepath.Join(fakeBinDir, "dotfiles")
		fakeDotfilesScript := "#!/usr/bin/env bash\n" +
			"set -euo pipefail\n" +
			"if [[ \"$*\" == *\"state generate\"* ]]; then\n" +
			"  mkdir -p \"" + filepath.Join(info.EnvDir, ".generated", "shell-scripts") + "\"\n" +
			"  mkdir -p \"" + filepath.Join(info.EnvDir, ".generated", "user-bin") + "\"\n" +
			"  cat > \"" + filepath.Join(info.EnvDir, ".generated", "shell-scripts", "main.bash") + "\" <<'MAIN'\n" +
			"dotfiles() {\n" +
			"  echo \"wrapped-dotfiles:$*\"\n" +
			"}\n" +
			"export MY_VENV_VAR=\"from-main-bash\"\n" +
			"MAIN\n" +
			"fi\n"
		if err := os.WriteFile(fakeDotfiles, []byte(fakeDotfilesScript), 0755); err != nil {
			t.Fatalf("writing fake dotfiles: %v", err)
		}

		script := `set -euo pipefail
export PATH="` + fakeBinDir + `:/usr/bin:/bin"
export XDG_CONFIG_HOME="/original/xdg"
orig_path="$PATH"
source "` + info.SourcePath + `" >/dev/null
echo "ACTIVE_DIR=$DOTFILES_ENV_DIR"
echo "ACTIVE_NAME=$DOTFILES_ENV_NAME"
echo "ACTIVE_XDG=$XDG_CONFIG_HOME"
echo "ACTIVE_VAR=${MY_VENV_VAR:-}"
echo "ACTIVE_DOTFILES=$(dotfiles status)"
case ":$PATH:" in
  *":` + filepath.Join(info.EnvDir, ".generated", "user-bin") + `:"*) echo "USER_BIN_IN_PATH=yes" ;;
  *) echo "USER_BIN_IN_PATH=no" ;;
esac
dotfiles-deactivate >/dev/null
echo "DEACTIVATED_DIR=${DOTFILES_ENV_DIR:-unset}"
echo "DEACTIVATED_NAME=${DOTFILES_ENV_NAME:-unset}"
echo "DEACTIVATED_XDG=${XDG_CONFIG_HOME:-unset}"
if [ "$PATH" = "$orig_path" ]; then
  echo "PATH_RESTORED=yes"
else
  echo "PATH_RESTORED=no ($PATH vs $orig_path)"
fi
`
		cmd := exec.Command(bashPath, "--noprofile", "--norc", "-c", script)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("bash execution failed: %v\n%s", err, string(out))
		}
		got := string(out)
		for _, want := range []string{
			"ACTIVE_DIR=" + info.EnvDir,
			"ACTIVE_NAME=.env",
			"ACTIVE_XDG=" + filepath.Join(info.EnvDir, ".config"),
			"ACTIVE_VAR=from-main-bash",
			"ACTIVE_DOTFILES=wrapped-dotfiles:status",
			"USER_BIN_IN_PATH=yes",
			"DEACTIVATED_DIR=unset",
			"DEACTIVATED_NAME=unset",
			"DEACTIVATED_XDG=/original/xdg",
			"PATH_RESTORED=yes",
		} {
			if !strings.Contains(got, want) {
				t.Errorf("missing %q in output:\n%s", want, got)
			}
		}
	})

	t.Run("bootstraps dotfiles into env via install.sh when missing from PATH", func(t *testing.T) {
		tmpDir := t.TempDir()
		mgr := NewManager(fs.NewOSFS())
		info, err := mgr.Create(tmpDir, ".env", false)
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}

		// Provide a fake curl that outputs an installer script when invoked
		fakeCurlDir := filepath.Join(tmpDir, "curl-bin")
		if err := os.MkdirAll(fakeCurlDir, 0755); err != nil {
			t.Fatalf("mkdir curl-bin: %v", err)
		}
		fakeInstallScript := filepath.Join(tmpDir, "fake-install.sh")
		installContent := "#!/usr/bin/env bash\n" +
			"set -euo pipefail\n" +
			"mkdir -p \"${INSTALL_DIR}/.generated/binaries/dotfiles/current\"\n" +
			"mkdir -p \"${DOTFILES_TARGET_DIR}\"\n" +
			"mkdir -p \"${INSTALL_DIR}/.generated/shell-scripts\"\n" +
			"cat > \"${INSTALL_DIR}/.generated/binaries/dotfiles/current/dotfiles\" <<'BIN'\n" +
			"#!/usr/bin/env bash\n" +
			"echo \"bootstrapped-dotfiles:$*\"\n" +
			"BIN\n" +
			"chmod +x \"${INSTALL_DIR}/.generated/binaries/dotfiles/current/dotfiles\"\n" +
			"ln -sf \"${INSTALL_DIR}/.generated/binaries/dotfiles/current/dotfiles\" \"${DOTFILES_TARGET_DIR}/dotfiles\"\n" +
			"cat > \"${INSTALL_DIR}/.generated/shell-scripts/main.bash\" <<'MAIN'\n" +
			"export BOOTSTRAPPED_ENV=\"yes\"\n" +
			"MAIN\n"
		if err := os.WriteFile(fakeInstallScript, []byte(installContent), 0755); err != nil {
			t.Fatalf("writing fake-install.sh: %v", err)
		}

		fakeCurl := filepath.Join(fakeCurlDir, "curl")
		curlContent := "#!/usr/bin/env bash\ncat \"" + fakeInstallScript + "\"\n"
		if err := os.WriteFile(fakeCurl, []byte(curlContent), 0755); err != nil {
			t.Fatalf("writing fake curl: %v", err)
		}

		script := `set -euo pipefail
export PATH="` + fakeCurlDir + `:/usr/bin:/bin"
export DOTFILES_INSTALL_SCRIPT_URL="https://example.invalid/install.sh"
source "` + info.SourcePath + `" >/dev/null
echo "BOOTSTRAPPED_ENV=${BOOTSTRAPPED_ENV:-no}"
echo "WHICH_DOTFILES=$(command -v dotfiles)"
echo "RUN_DOTFILES=$(dotfiles self version)"
`
		cmd := exec.Command(bashPath, "--noprofile", "--norc", "-c", script)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("bash bootstrap execution failed: %v\n%s", err, string(out))
		}
		got := string(out)
		for _, want := range []string{
			"BOOTSTRAPPED_ENV=yes",
			"WHICH_DOTFILES=" + filepath.Join(info.EnvDir, ".generated", "user-bin", "dotfiles"),
			"RUN_DOTFILES=bootstrapped-dotfiles:self version",
		} {
			if !strings.Contains(got, want) {
				t.Errorf("missing %q in output:\n%s", want, got)
			}
		}
	})
}
