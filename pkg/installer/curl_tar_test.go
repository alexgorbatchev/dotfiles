package installer

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
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

func TestCurlTarInstaller(t *testing.T) {
	// Generate valid tar.gz stream containing "mytool"
	var archiveBuf bytes.Buffer
	gw := gzip.NewWriter(&archiveBuf)
	tw := tar.NewWriter(gw)

	hdr := &tar.Header{
		Name: "mytool",
		Mode: 0755,
		Size: int64(len("binary-payload")),
	}
	_ = tw.WriteHeader(hdr)
	_, _ = tw.Write([]byte("binary-payload"))
	_ = tw.Close()
	_ = gw.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(archiveBuf.Bytes())
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewCurlTarInstaller(runner, fsys, dl, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "curl-tar" {
		t.Errorf("expected name to be 'curl-tar', got %s", inst.Name())
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
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		// Verify extracted file exists in destination directory
		destPath := filepath.Join(inst.BinDir, "mytool")
		exists, err := fsys.Exists(destPath)
		if err != nil || !exists {
			t.Errorf("expected extracted file to exist at %s", destPath)
		}

		data, err := fsys.ReadFile(destPath)
		if err != nil || string(data) != "binary-payload" {
			t.Errorf("unexpected content: %s", string(data))
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.WriteFile(destPath, []byte("content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be removed")
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		tool := &config.ToolConfig{Name: "mytool"}
		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.HasUpdate {
			t.Error("expected no updates supported")
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
		badFsys := &mockTarErrorFS{FS: fsys}
		badDl := downloader.NewDownloader(badFsys, nil)
		badInst := NewCurlTarInstaller(runner, badFsys, badDl, nil)
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
}

type mockTarErrorFS struct {
	fs.FS
}

func (m *mockTarErrorFS) MkdirAll(path string, perm os.FileMode) error {
	return errors.New("mkdir error")
}

func (m *mockTarErrorFS) Create(path string) (io.WriteCloser, error) {
	return nil, errors.New("create error")
}
