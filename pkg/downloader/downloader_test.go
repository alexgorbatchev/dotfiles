package downloader

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestDownloader(t *testing.T) {
	fullContent := "Hello, dotfiles installer down resume standard verification!"
	hash := sha256.Sum256([]byte(fullContent))
	correctHash := hex.EncodeToString(hash[:])

	// Create a test HTTP server with Range support
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rangeHeader := r.Header.Get("Range")
		if rangeHeader == "" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(fullContent))
			return
		}

		if !strings.HasPrefix(rangeHeader, "bytes=") {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		parts := strings.Split(rangeHeader[6:], "-")
		start, err := strconv.Atoi(parts[0])
		if err != nil || start < 0 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		if start > len(fullContent) {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}

		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write([]byte(fullContent[start:]))
	}))
	defer server.Close()

	t.Run("Standard Download (200 OK)", func(t *testing.T) {
		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", correctHash)
		if err != nil {
			t.Fatalf("unexpected download error: %v", err)
		}

		data, err := memFS.ReadFile("/test-file")
		if err != nil {
			t.Fatalf("unexpected readFile error: %v", err)
		}

		if string(data) != fullContent {
			t.Errorf("expected content %q, got %q", fullContent, string(data))
		}
	})

	t.Run("Resumed Download (206 Partial Content)", func(t *testing.T) {
		memFS := fs.NewMemFS()
		prefix := "Hello, dotfiles"
		err := memFS.WriteFile("/test-file", []byte(prefix), 0644)
		if err != nil {
			t.Fatalf("failed to pre-populate file: %v", err)
		}

		d := NewDownloader(memFS, nil)
		err = d.Download(context.Background(), server.URL, "/test-file", correctHash)
		if err != nil {
			t.Fatalf("unexpected resume error: %v", err)
		}

		data, err := memFS.ReadFile("/test-file")
		if err != nil {
			t.Fatalf("unexpected readFile error: %v", err)
		}

		if string(data) != fullContent {
			t.Errorf("expected resumed content %q, got %q", fullContent, string(data))
		}
	})

	t.Run("Checksum Mismatch (Deletes File)", func(t *testing.T) {
		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", "incorrecthash123")
		if err == nil {
			t.Fatal("expected checksum mismatch error, got nil")
		}

		if !strings.Contains(err.Error(), "checksum mismatch") {
			t.Errorf("expected checksum mismatch, got %v", err)
		}

		exists, err := memFS.Exists("/test-file")
		if err != nil {
			t.Fatalf("unexpected exists error: %v", err)
		}
		if exists {
			t.Error("file should have been cleaned up after checksum mismatch")
		}
	})

	t.Run("Range Out of Bounds Recovery (416 Fallback to 200)", func(t *testing.T) {
		memFS := fs.NewMemFS()
		// Write data larger than total content to trigger 416
		largePrefix := "this is some large content that exceeds the size of fullContent"
		err := memFS.WriteFile("/test-file", []byte(largePrefix), 0644)
		if err != nil {
			t.Fatalf("failed to pre-populate large file: %v", err)
		}

		d := NewDownloader(memFS, nil)
		err = d.Download(context.Background(), server.URL, "/test-file", correctHash)
		if err != nil {
			t.Fatalf("unexpected range out-of-bounds recovery error: %v", err)
		}

		data, err := memFS.ReadFile("/test-file")
		if err != nil {
			t.Fatalf("unexpected readFile error: %v", err)
		}

		if string(data) != fullContent {
			t.Errorf("expected recovered content %q, got %q", fullContent, string(data))
		}
	})

	t.Run("Cancellation Context Support", func(t *testing.T) {
		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		ctx, cancel := context.WithCancel(context.Background())
		cancel() // cancel immediately

		err := d.Download(ctx, server.URL, "/test-file", "")
		if err == nil {
			t.Fatal("expected context cancelled error, got nil")
		}

		if !strings.Contains(err.Error(), "context canceled") {
			t.Errorf("expected context cancelled, got %v", err)
		}
	})

	t.Run("HTTP Error Handling", func(t *testing.T) {
		errorServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer errorServer.Close()

		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		err := d.Download(context.Background(), errorServer.URL, "/test-file", "")
		if err == nil {
			t.Fatal("expected error with 404 response, got nil")
		}

		if !strings.Contains(err.Error(), "status 404") {
			t.Errorf("expected download failed with status 404, got %v", err)
		}
	})

	t.Run("Filesystem Exists Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		errFS := &errorFS{FS: memFS, existsErr: fmt.Errorf("exists failed")}
		d := NewDownloader(errFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", "")
		if err == nil {
			t.Fatal("expected exists error, got nil")
		}
		if !strings.Contains(err.Error(), "exists failed") {
			t.Errorf("expected exists failed error, got %v", err)
		}
	})

	t.Run("Filesystem ReadFile Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		_ = memFS.WriteFile("/test-file", []byte("some data"), 0644)
		errFS := &errorFS{FS: memFS, readFileErr: fmt.Errorf("readfile failed")}
		d := NewDownloader(errFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", "")
		if err == nil {
			t.Fatal("expected readfile error, got nil")
		}
		if !strings.Contains(err.Error(), "readfile failed") {
			t.Errorf("expected readfile failed error, got %v", err)
		}
	})

	t.Run("Filesystem WriteFile Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		errFS := &errorFS{FS: memFS, writeFileErr: fmt.Errorf("writefile failed")}
		d := NewDownloader(errFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", "")
		if err == nil {
			t.Fatal("expected writefile error, got nil")
		}
		if !strings.Contains(err.Error(), "writefile failed") {
			t.Errorf("expected writefile failed error, got %v", err)
		}
	})

	t.Run("HTTP Client Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		client := &http.Client{
			Transport: &errorRoundTripper{err: fmt.Errorf("roundtrip failed")},
		}
		d := NewDownloader(memFS, client)

		err := d.Download(context.Background(), server.URL, "/test-file", "")
		if err == nil {
			t.Fatal("expected roundtrip error, got nil")
		}
		if !strings.Contains(err.Error(), "roundtrip failed") {
			t.Errorf("expected roundtrip failed error, got %v", err)
		}
	})
}

type errorFS struct {
	fs.FS
	existsErr    error
	readFileErr  error
	writeFileErr error
}

func (e *errorFS) Exists(path string) (bool, error) {
	if e.existsErr != nil {
		return false, e.existsErr
	}
	return e.FS.Exists(path)
}

func (e *errorFS) ReadFile(path string) ([]byte, error) {
	if e.readFileErr != nil {
		return nil, e.readFileErr
	}
	return e.FS.ReadFile(path)
}

func (e *errorFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	if e.writeFileErr != nil {
		return e.writeFileErr
	}
	return e.FS.WriteFile(path, data, perm)
}

func (e *errorFS) Create(path string) (io.WriteCloser, error) {
	if e.writeFileErr != nil {
		return nil, e.writeFileErr
	}
	return e.FS.Create(path)
}

type errorRoundTripper struct {
	err error
}

func (e *errorRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return nil, e.err
}

func TestDownloaderTimeoutCancellation(t *testing.T) {
	// Server that delays response to test cancellation
	slowServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("slow response"))
	}))
	defer slowServer.Close()

	memFS := fs.NewMemFS()
	d := NewDownloader(memFS, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()

	err := d.Download(ctx, slowServer.URL, "/test-file", "")
	if err == nil {
		t.Fatal("expected context timeout error, got nil")
	}

	if !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Errorf("expected context deadline exceeded, got %v", err)
	}
}
