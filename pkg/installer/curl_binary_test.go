package installer

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestCurlBinaryInstaller(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("mock-binary-content"))
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewCurlBinaryInstaller(runner, fsys, dl, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "curl-binary" {
		t.Errorf("expected name to be 'curl-binary', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool binary, got %v", res.Binaries)
		}

		// Verify file was downloaded to the correct destination directory
		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected downloaded file to exist at %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil || string(data) != "mock-binary-content" {
			t.Errorf("unexpected content: %s", string(data))
		}

		// Verify mode is 0755
		fi, err := fsys.Stat(destPath)
		if err != nil {
			t.Fatalf("failed to stat downloaded binary: %v", err)
		}
		if fi.Mode().Perm() != 0o755 {
			t.Errorf("expected mode 0755, got %#o", fi.Mode().Perm())
		}

		// Verify runner was not invoked for chmod
		if len(runner.History) != 0 {
			t.Errorf("expected no runner commands, got %v", runner.History)
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.WriteFile(destPath, []byte("content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		err := inst.Uninstall(context.Background(), tool, Installation{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be uninstalled/removed")
		}
	})

	t.Run("Install fails missing URL", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing missing URL, got nil")
		}
	})

	t.Run("Install fails directory creation error", func(t *testing.T) {
		badFsys := &mockErrorFS{FS: fsys}
		badDl := downloader.NewDownloader(badFsys, nil)
		badInst := NewCurlBinaryInstaller(runner, badFsys, badDl, nil)
		badInst.BinDir = "/forbidden/dir"

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		_, err := badInst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error creating directory, got nil")
		}
	})

	t.Run("Install fails chmod error", func(t *testing.T) {
		chmodErrFS := &mockChmodErrorFS{FS: fs.NewMemFS()}
		chmodDl := downloader.NewDownloader(chmodErrFS, nil)
		chmodInst := NewCurlBinaryInstaller(runner, chmodErrFS, chmodDl, nil)
		chmodInst.BinDir = "/test/bin"

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		_, err := chmodInst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error when chmod fails, got nil")
		}
	})
}

type mockChmodErrorFS struct {
	fs.FS
}

func (m *mockChmodErrorFS) Chmod(path string, perm os.FileMode) error {
	return errors.New("chmod error")
}

type mockErrorFS struct {
	fs.FS
}

func (m *mockErrorFS) MkdirAll(path string, perm os.FileMode) error {
	return errors.New("mkdir error")
}

func (m *mockErrorFS) Create(path string) (io.WriteCloser, error) {
	return nil, errors.New("create error")
}
