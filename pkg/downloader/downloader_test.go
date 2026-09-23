package downloader

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
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

	t.Run("Partial Download Stat Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		statErr := &os.PathError{Op: "stat", Path: "/test-file", Err: os.ErrPermission}
		errFS := &errorFS{FS: memFS, statErr: statErr}
		d := NewDownloader(errFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", "")
		if !errors.Is(err, os.ErrPermission) {
			t.Fatalf("expected the stat error to be returned, got %v", err)
		}
		if !strings.Contains(err.Error(), "checking partial download size") {
			t.Errorf("expected the stat error to carry its context, got %v", err)
		}
	})

	t.Run("Partial Download Append Open Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		prefix := "Hello, dotfiles"
		_ = memFS.WriteFile("/test-file", []byte(prefix), 0644)
		openErr := &os.PathError{Op: "open", Path: "/test-file", Err: os.ErrPermission}
		errFS := &errorFS{FS: memFS, openFileErr: openErr}
		d := NewDownloader(errFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", correctHash)
		if !errors.Is(err, os.ErrPermission) {
			t.Fatalf("expected the append-open error to be returned, got %v", err)
		}
		if !strings.Contains(err.Error(), "opening partial download for append") {
			t.Errorf("expected the append-open error to carry its context, got %v", err)
		}

		data, readErr := memFS.ReadFile("/test-file")
		if readErr != nil {
			t.Fatalf("unexpected readFile error: %v", readErr)
		}
		if string(data) != prefix {
			t.Errorf("expected the partial file to stay %q, got %q", prefix, string(data))
		}
	})

	t.Run("Filesystem Create Error", func(t *testing.T) {
		memFS := fs.NewMemFS()
		createErr := errors.New("create failed")
		errFS := &errorFS{FS: memFS, createErr: createErr}
		d := NewDownloader(errFS, nil)

		err := d.Download(context.Background(), server.URL, "/test-file", "")
		if !errors.Is(err, createErr) {
			t.Fatalf("expected the create error to be returned, got %v", err)
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

// errorFS wraps a real file system and fails the one operation a test names.
type errorFS struct {
	fs.FS
	statErr     error
	openFileErr error
	createErr   error
}

func (e *errorFS) Stat(path string) (os.FileInfo, error) {
	if e.statErr != nil {
		return nil, e.statErr
	}
	return e.FS.Stat(path)
}

func (e *errorFS) Create(path string) (io.WriteCloser, error) {
	if e.createErr != nil {
		return nil, e.createErr
	}
	return e.FS.Create(path)
}

func (e *errorFS) OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	if e.openFileErr != nil {
		return nil, e.openFileErr
	}
	return e.FS.OpenFile(path, flag, perm)
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

func TestDownloader_OptionsAndRetries(t *testing.T) {
	t.Run("Headers Propagation", func(t *testing.T) {
		headerValue := ""
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			headerValue = r.Header.Get("Authorization")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
		}))
		defer server.Close()

		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		opts := DownloadOptions{
			Headers: map[string]string{
				"Authorization": "Bearer supertoken",
			},
		}

		err := d.Download(context.Background(), server.URL, "/test-auth", "", opts)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if headerValue != "Bearer supertoken" {
			t.Errorf("expected header 'Bearer supertoken', got %q", headerValue)
		}
	})

	t.Run("Progress Callback", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("1234567890"))
		}))
		defer server.Close()

		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		var progressCalls int
		var maxBytes int64
		opts := DownloadOptions{
			OnProgress: func(downloaded int64, total int64) {
				progressCalls++
				if downloaded > maxBytes {
					maxBytes = downloaded
				}
			},
		}

		err := d.Download(context.Background(), server.URL, "/test-progress", "", opts)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if progressCalls == 0 {
			t.Error("expected progress callback to be called")
		}
		if maxBytes != 10 {
			t.Errorf("expected max progress bytes to be 10, got %d", maxBytes)
		}
	})

	t.Run("Retry with Backoff", func(t *testing.T) {
		attempts := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attempts++
			if attempts < 3 {
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("recovered"))
		}))
		defer server.Close()

		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)

		opts := DownloadOptions{
			RetryCount: 3,
			RetryDelay: 1 * time.Millisecond,
		}

		err := d.Download(context.Background(), server.URL, "/test-retry", "", opts)
		if err != nil {
			t.Fatalf("unexpected error after retry: %v", err)
		}

		if attempts != 3 {
			t.Errorf("expected 3 attempts before success, got %d", attempts)
		}
	})
}

func TestNewDownloader_DefaultTimeout(t *testing.T) {
	memFS := fs.NewMemFS()
	d := NewDownloader(memFS, nil)

	if d.client == nil {
		t.Fatal("expected non-nil HTTP client")
	}
	if d.client.Timeout != 0 {
		t.Errorf("expected client.Timeout to be 0 (unbounded body streaming), got %v", d.client.Timeout)
	}
	tr, ok := d.client.Transport.(*http.Transport)
	if !ok {
		t.Fatal("expected client.Transport to be *http.Transport")
	}
	expectedHeaderTimeout := 30 * time.Second
	if tr.ResponseHeaderTimeout != expectedHeaderTimeout {
		t.Errorf("expected ResponseHeaderTimeout %v, got %v", expectedHeaderTimeout, tr.ResponseHeaderTimeout)
	}
}

func getCachePath(cacheDir string, url string, headers map[string]string) string {
	keyStr := getCacheKey(url, headers)
	return filepath.Join(cacheDir, keyStr)
}

func TestDownloaderCaching(t *testing.T) {
	mem := fs.NewMemFS()
	dl := NewDownloader(mem, nil)
	dl.CacheEnabled = true
	dl.CacheDir = "/test_cache"
	dl.CacheTTL = time.Hour

	// Mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "" {
			_, _ = w.Write([]byte("my-cached-data-" + auth))
		} else {
			_, _ = w.Write([]byte("my-cached-data"))
		}
	}))
	defer server.Close()

	dest := "/test-file"
	ctx := context.Background()

	// First download (Cache Miss)
	err := dl.Download(ctx, server.URL, dest, "")
	if err != nil {
		t.Fatalf("first download failed: %v", err)
	}

	// Check if cached file exists
	cachePath := getCachePath(dl.CacheDir, server.URL, nil)
	exists, err := mem.Exists(cachePath)
	if err != nil || !exists {
		t.Fatalf("expected cache file to be created, exists=%v, err=%v", exists, err)
	}

	// Remove the downloaded file to force a cache hit test
	_ = mem.Remove(dest)

	// Second download (Cache Hit)
	err = dl.Download(ctx, server.URL, dest, "")
	if err != nil {
		t.Fatalf("cached download failed: %v", err)
	}

	// Read dest file to verify it was copied from cache
	destBytes, err := mem.ReadFile(dest)
	if err != nil {
		t.Fatalf("reading destination file: %v", err)
	}
	if string(destBytes) != "my-cached-data" {
		t.Errorf("expected my-cached-data, got %q", string(destBytes))
	}

	// Third download with custom headers - should create a distinct cache entry
	headersA := map[string]string{"Authorization": "TokenA"}
	headersB := map[string]string{"Authorization": "TokenB"}

	destA := "/test-file-a"
	err = dl.Download(ctx, server.URL, destA, "", DownloadOptions{Headers: headersA})
	if err != nil {
		t.Fatalf("download with headersA failed: %v", err)
	}

	destB := "/test-file-b"
	err = dl.Download(ctx, server.URL, destB, "", DownloadOptions{Headers: headersB})
	if err != nil {
		t.Fatalf("download with headersB failed: %v", err)
	}

	cachePathA := getCachePath(dl.CacheDir, server.URL, headersA)
	cachePathB := getCachePath(dl.CacheDir, server.URL, headersB)

	if cachePathA == cachePathB {
		t.Errorf("expected distinct cache paths for headersA and headersB, got identical path %q", cachePathA)
	}

	existsA, errA := mem.Exists(cachePathA)
	existsB, errB := mem.Exists(cachePathB)
	if !existsA || errA != nil || !existsB || errB != nil {
		t.Errorf("expected both distinct cache files to exist: existsA=%v, existsB=%v", existsA, existsB)
	}
}

func TestProgressBar_RenderProgressFrame(t *testing.T) {
	filename := "test-tool"
	totalBytes := int64(1000000)

	// Render with progress bar
	bar := NewProgressBar(totalBytes, filename)
	bar.bytesDownloaded = int64(500000)
	bar.startTime = time.Now().Add(-time.Second)

	frame := bar.RenderFrame()
	if !strings.Contains(frame, "50.00%") {
		t.Errorf("expected 50%% in progress frame, got %q", frame)
	}
}

func TestUserAgentHeader(t *testing.T) {
	var capturedUserAgent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUserAgent = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	t.Run("Default User-Agent Header", func(t *testing.T) {
		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)
		capturedUserAgent = ""

		err := d.Download(context.Background(), server.URL, "/dest", "")
		if err != nil {
			t.Fatalf("unexpected download error: %v", err)
		}

		if capturedUserAgent != "dotfiles-installer/1.0" {
			t.Errorf("expected default User-Agent %q, got %q", "dotfiles-installer/1.0", capturedUserAgent)
		}
	})

	t.Run("Custom User-Agent Header Override", func(t *testing.T) {
		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)
		capturedUserAgent = ""

		customUA := "custom-agent/2.0"
		err := d.Download(context.Background(), server.URL, "/dest", "", DownloadOptions{
			Headers: map[string]string{"User-Agent": customUA},
		})
		if err != nil {
			t.Fatalf("unexpected download error: %v", err)
		}

		if capturedUserAgent != customUA {
			t.Errorf("expected custom User-Agent %q, got %q", customUA, capturedUserAgent)
		}
	})
}

type errorOpenFS struct {
	fs.FS
}

type errorReader struct{}

func (errorReader) Read(p []byte) (int, error) {
	return 0, fmt.Errorf("read failure")
}

func (e errorOpenFS) Open(path string) (io.ReadCloser, error) {
	return dummyReadCloser{Reader: errorReader{}}, nil
}

type dummyReadCloser struct {
	io.Reader
}

func (dummyReadCloser) Close() error { return nil }

func TestDownloaderVerifyHashReadError(t *testing.T) {
	mem := fs.NewMemFS()
	eFS := errorOpenFS{FS: mem}
	d := NewDownloader(eFS, nil)

	ok, err := d.verifyHash("/dummy", "abc12345")
	if err == nil || ok {
		t.Errorf("expected verifyHash to fail when Read returns error")
	}
}

func TestDownloaderHashCalculationFailed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("some-data"))
	}))
	defer server.Close()

	mem := fs.NewMemFS()
	eFS := errorOpenFS{FS: mem}
	d := NewDownloader(eFS, nil)

	err := d.Download(context.Background(), server.URL, "/dest-hash-err", "sha256hash")
	if err == nil || !strings.Contains(err.Error(), "hash calculation failed") {
		t.Fatalf("expected hash calculation failed error, got %v", err)
	}
}

func TestSetFSAndHashes(t *testing.T) {
	memFS := fs.NewMemFS()
	d := NewDownloader(memFS, nil)

	newMemFS := fs.NewMemFS()
	d.SetFS(newMemFS)
	if d.fsys != newMemFS {
		t.Error("SetFS failed to update fsys")
	}

	// verifyHash with sha256
	content := []byte("test content")
	_ = newMemFS.WriteFile("/hash.txt", content, 0644)

	h := sha256.Sum256(content)
	sha256Hash := hex.EncodeToString(h[:])
	ok, err := d.verifyHash("/hash.txt", sha256Hash)
	if err != nil || !ok {
		t.Errorf("verifyHash SHA256 failed: ok=%v, err=%v", ok, err)
	}

	ok, err = d.verifyHash("/hash.txt", strings.ToUpper(sha256Hash))
	if err != nil || !ok {
		t.Errorf("verifyHash Upper SHA256 failed: ok=%v, err=%v", ok, err)
	}

	ok, err = d.verifyHash("/hash.txt", "1234567890123456789012345678901234567890123456789012345678901234")
	if err != nil || ok {
		t.Errorf("expected false on hash mismatch, got ok=%v, err=%v", ok, err)
	}
}

func TestDownloader416VerifiedHashAndTimeoutOpt(t *testing.T) {
	fullContent := "Range 416 verified hash content test"
	h := sha256.Sum256([]byte(fullContent))
	hashStr := hex.EncodeToString(h[:])

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fullContent))
	}))
	defer server.Close()

	memFS := fs.NewMemFS()
	_ = memFS.WriteFile("/range-file.txt", []byte(fullContent), 0644)

	d := NewDownloader(memFS, nil)

	// 1. 416 Range Not Satisfiable + hash verified
	err := d.Download(context.Background(), server.URL, "/range-file.txt", hashStr)
	if err != nil {
		t.Fatalf("416 range verified download failed: %v", err)
	}

	// 2. Timeout option in DownloadOptions
	opts := DownloadOptions{
		Timeout: 5 * time.Second,
	}
	err = d.Download(context.Background(), server.URL, "/range-file-opt.txt", hashStr, opts)
	if err != nil {
		t.Fatalf("Download with Timeout option failed: %v", err)
	}
}

func TestDownloaderCacheExpirationAndOpenFile(t *testing.T) {
	mem := fs.NewMemFS()
	dl := NewDownloader(mem, nil)
	dl.CacheEnabled = true
	dl.CacheDir = "/test_cache_exp"
	dl.CacheTTL = 1 * time.Millisecond // Expire quickly

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("fresh-data"))
	}))
	defer server.Close()

	ctx := context.Background()

	// 1. First download writes cache
	_ = dl.Download(ctx, server.URL, "/f1", "")

	// Wait for TTL to expire
	time.Sleep(10 * time.Millisecond)

	// 2. Second download with expired cache -> fetches fresh data from server
	_ = dl.Download(ctx, server.URL, "/f1", "")

	// 3. OpenFile support on OSFS
	tmpDir := t.TempDir()
	osFS := fs.NewOSFS()
	dlOS := NewDownloader(osFS, nil)
	// The default CacheDir is relative, so leaving it alone writes cache blobs into
	// this package's own directory. Go then sees a freshly written file as a test
	// input that is too new to trust and stops caching the package's result entirely.
	dlOS.CacheDir = filepath.Join(tmpDir, "cache")

	osFile := filepath.Join(tmpDir, "partial.txt")
	_ = os.WriteFile(osFile, []byte("part1-"), 0644)

	serverPartial := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write([]byte("part2"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("full"))
	}))
	defer serverPartial.Close()

	var partialProgressCalled bool
	optsPartial := DownloadOptions{
		OnProgress: func(downloaded, total int64) {
			partialProgressCalled = true
		},
	}
	err := dlOS.Download(ctx, serverPartial.URL, osFile, "", optsPartial)
	if err != nil || !partialProgressCalled {
		t.Fatalf("OSFS 206 Partial Content download with progress failed: %v, %v", err, partialProgressCalled)
	}

	data, err := os.ReadFile(osFile)
	if err != nil || string(data) != "part1-part2" {
		t.Errorf("expected 'part1-part2', got %q, err=%v", string(data), err)
	}
}

func TestDownloaderCacheHitWithProgressAndSkipCache(t *testing.T) {
	mem := fs.NewMemFS()
	dl := NewDownloader(mem, nil)
	dl.CacheEnabled = true
	dl.CacheDir = "/cache"
	dl.CacheTTL = time.Hour

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("data"))
	}))
	defer server.Close()

	ctx := context.Background()

	// 1. Download to populate cache
	_ = dl.Download(ctx, server.URL, "/dest1", "")

	// 2. Cache hit with OnProgress callback
	var progressCalled bool
	optsProg := DownloadOptions{
		OnProgress: func(downloaded, total int64) {
			progressCalled = true
		},
	}
	_ = mem.Remove("/dest1")
	err := dl.Download(ctx, server.URL, "/dest1", "", optsProg)
	if err != nil || !progressCalled {
		t.Errorf("expected cache hit with progress callback called, err=%v, progressCalled=%v", err, progressCalled)
	}

	// 3. SkipCache option bypasses cache
	optsSkip := DownloadOptions{
		SkipCache: true,
	}
	err = dl.Download(ctx, server.URL, "/dest2", "", optsSkip)
	if err != nil {
		t.Fatalf("download with SkipCache failed: %v", err)
	}

	// 3b. Overwrite context bypasses cache
	overwriteCtx := config.WithOverwrite(ctx, true)
	err = dl.Download(overwriteCtx, server.URL, "/dest-overwrite", "")
	if err != nil {
		t.Fatalf("download with overwrite context failed: %v", err)
	}

	// 4. Retry cancellation with cancelled context
	canceledCtx, cancel := context.WithCancel(ctx)
	cancel()

	optsRetry := DownloadOptions{
		RetryCount: 2,
		RetryDelay: 100 * time.Millisecond,
	}
	failingServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer failingServer.Close()

	err = dl.Download(canceledCtx, failingServer.URL, "/dest-cancel", "", optsRetry)
	if err == nil {
		t.Error("expected error downloading with cancelled context during retries")
	}
}

func TestDownloader416RecoveryAndError(t *testing.T) {
	fullContent := "full content for recovery"
	serverRecovery := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fullContent))
	}))
	defer serverRecovery.Close()

	memFS := fs.NewMemFS()
	_ = memFS.WriteFile("/bad-range.txt", []byte("bad offset content"), 0644)
	d := NewDownloader(memFS, nil)

	// 1. 416 recovery download without hash
	var recProgressCalled bool
	optsRec := DownloadOptions{
		OnProgress: func(downloaded, total int64) {
			recProgressCalled = true
		},
	}
	err := d.Download(context.Background(), serverRecovery.URL, "/bad-range.txt", "", optsRec)
	if err != nil || !recProgressCalled {
		t.Fatalf("416 recovery download failed: %v, %v", err, recProgressCalled)
	}

	data, err := memFS.ReadFile("/bad-range.txt")
	if err != nil || string(data) != fullContent {
		t.Errorf("expected %q, got %q, err=%v", fullContent, string(data), err)
	}

	// 2. 416 recovery download fails with non-200 status
	serverRecoveryFail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer serverRecoveryFail.Close()

	_ = memFS.WriteFile("/bad-range-fail.txt", []byte("bad offset content"), 0644)
	err = d.Download(context.Background(), serverRecoveryFail.URL, "/bad-range-fail.txt", "")
	if err == nil || !strings.Contains(err.Error(), "recovery download failed") {
		t.Errorf("expected recovery download failed error, got %v", err)
	}
}

func TestNewDownloaderNilTransportAndVerifyHash(t *testing.T) {
	memFS := fs.NewMemFS()

	// NewDownloader with custom client that has nil Transport
	customClient := &http.Client{}
	dCustom := NewDownloader(memFS, customClient)
	if dCustom == nil || dCustom.client == nil {
		t.Fatal("expected non-nil Downloader and client")
	}

	// verifyHash on empty file
	_ = memFS.WriteFile("/empty.txt", []byte(""), 0644)
	e30 := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	ok, err := dCustom.verifyHash("/empty.txt", e30)
	if err != nil || !ok {
		t.Errorf("verifyHash on empty file failed: ok=%v, err=%v", ok, err)
	}

	// verifyHash with whitespace around expected hash
	ok, err = dCustom.verifyHash("/empty.txt", "  "+e30+"  \n")
	if err != nil || !ok {
		t.Errorf("verifyHash with trimmed whitespace failed: ok=%v, err=%v", ok, err)
	}
}

func TestDownloaderResumesPartialContentByAppending(t *testing.T) {
	memFS := fs.NewMemFS()
	_ = memFS.WriteFile("/partial.txt", []byte("part1-"), 0644)

	serverPartial := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write([]byte("part2"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("full"))
	}))
	defer serverPartial.Close()

	d := NewDownloader(memFS, nil)
	var progressCalled bool
	opts := DownloadOptions{
		OnProgress: func(downloaded, total int64) {
			progressCalled = true
		},
	}

	err := d.Download(context.Background(), serverPartial.URL, "/partial.txt", "", opts)
	if err != nil || !progressCalled {
		t.Fatalf("resumed partial download failed: %v, progressCalled=%v", err, progressCalled)
	}

	data, err := memFS.ReadFile("/partial.txt")
	if err != nil || string(data) != "part1-part2" {
		t.Errorf("expected 'part1-part2', got %q, err=%v", string(data), err)
	}
}

func TestDownloaderQuietMode(t *testing.T) {
	memFS := fs.NewMemFS()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("content"))
	}))
	defer server.Close()

	d := NewDownloader(memFS, nil)
	d.SetQuiet(true)
	if !d.Quiet {
		t.Errorf("expected d.Quiet to be true")
	}

	optsQuiet := DownloadOptions{Quiet: true}
	err := d.Download(context.Background(), server.URL, "/test.txt", "", optsQuiet)
	if err != nil {
		t.Fatalf("Download failed in quiet mode: %v", err)
	}

	data, err := memFS.ReadFile("/test.txt")
	if err != nil || string(data) != "content" {
		t.Errorf("expected 'content', got %q, err=%v", string(data), err)
	}
}

func TestDownloaderCacheAndErrors(t *testing.T) {
	memFS := fs.NewMemFS()
	content := "cached download content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/error" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(content))
	}))
	defer server.Close()

	d := NewDownloader(memFS, nil)
	d.CacheEnabled = true
	d.CacheDir = "/cache"

	// 1. Successful download with cache
	err := d.Download(context.Background(), server.URL+"/file.txt", "/file.txt", hash, DownloadOptions{
		Timeout: 5 * time.Second,
		Headers: map[string]string{"X-Test": "1"},
	})
	if err != nil {
		t.Fatalf("unexpected error downloading with cache: %v", err)
	}

	// 2. Subsequent download from cache
	err = d.Download(context.Background(), server.URL+"/file.txt", "/file2.txt", hash, DownloadOptions{
		Headers: map[string]string{"X-Test": "1"},
	})
	if err != nil {
		t.Fatalf("unexpected error downloading from cache: %v", err)
	}

	// 3. HTTP status error
	err = d.Download(context.Background(), server.URL+"/error", "/err.txt", "", DownloadOptions{
		RetryCount: 0,
	})
	if err == nil {
		t.Errorf("expected error for 500 Internal Server Error")
	}

	// 4. ProgressBar test
	bar := NewProgressBar(100, "Downloading")
	bar.isTTY = true
	bar.Start()
	bar.Update(50)
	frame := bar.RenderFrame()
	if frame == "" {
		t.Errorf("expected non-empty rendered frame")
	}
	bar.Finish()

	barUnknownTotal := NewProgressBar(0, "unknown.txt")
	barUnknownTotal.isTTY = true
	barUnknownTotal.bytesDownloaded = 500
	_ = barUnknownTotal.RenderFrame()

	// Helper formatting functions test
	_ = formatEta(50, 100, 10000, false)
	_ = formatEta(0, 100, 10000, false)
	_ = formatDuration(3665 * time.Second)
	_ = formatDuration(125 * time.Second)
	_ = renderFancyProgressField(50, "50%", "5B", "10B", false)
	_ = renderPrefix("file.txt", false)
	_ = highlight("text", false)
	_ = getProgressFieldStyle(5, 10, 0, 10, 4, 8)
	_ = getProgressFieldStyle(2, 10, 0, 10, 15, 20)
	_ = getProgressFieldStyle(12, 10, 11, 14, 15, 20)
	_ = getProgressFieldStyle(16, 10, 11, 14, 15, 20)
	_ = getProgressFieldStyle(25, 10, 11, 14, 15, 20)

	// OnProgress with 200 OK and timeout
	server200 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "10")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("0123456789"))
	}))
	defer server200.Close()

	dFresh := NewDownloader(memFS, nil)
	var progress200Called bool
	err = dFresh.Download(context.Background(), server200.URL, "/progress200.txt", "", DownloadOptions{
		Timeout: 5 * time.Second,
		OnProgress: func(downloaded, total int64) {
			progress200Called = true
		},
	})
	if err != nil || !progress200Called {
		t.Fatalf("expected progress200Called to be true, got %v", err)
	}

	// Retry loop test
	serverRetry := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer serverRetry.Close()

	_ = dFresh.Download(context.Background(), serverRetry.URL, "/retry.txt", "", DownloadOptions{
		RetryCount: 1,
		RetryDelay: 1 * time.Millisecond,
	})

	// Nil progress bar test
	var nilBar *ProgressBar
	nilBar.Start()
	nilBar.Finish()
	nilBar.Update(10)

	// SetFS and custom client transport branches in NewDownloader
	dNilFS := NewDownloader(memFS, nil)
	dNilFS.SetFS(memFS)

	customClientNoTransport := &http.Client{}
	dCustomNoTr := NewDownloader(memFS, customClientNoTransport)
	if dCustomNoTr.client == nil {
		t.Errorf("expected client")
	}

	customClientWithTr := &http.Client{Transport: &http.Transport{}}
	dCustomTr := NewDownloader(memFS, customClientWithTr)
	if dCustomTr.client == nil {
		t.Errorf("expected client")
	}

	// Verify hash error on non-existent file
	ok, errHash := dCustomNoTr.verifyHash("/nonexistent.txt", "abc")
	if ok || errHash == nil {
		t.Errorf("expected error verifying hash of non-existent file")
	}
}

func TestDownloaderEdgeCases(t *testing.T) {
	memFS := fs.NewMemFS()
	content := "recovery content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// Server returning 416 on range, but 200 on non-range
	server416 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(content))
	}))
	defer server416.Close()

	_ = memFS.WriteFile("/overlength.txt", []byte("12345678901234567890"), 0644)
	d := NewDownloader(memFS, nil)

	err := d.Download(context.Background(), server416.URL, "/overlength.txt", hash)
	if err != nil {
		t.Fatalf("unexpected error recovering from 416: %v", err)
	}

	data, err := memFS.ReadFile("/overlength.txt")
	if err != nil || string(data) != content {
		t.Errorf("expected %q, got %q, err=%v", content, string(data), err)
	}

	// Default progress bar test (non-quiet, no custom OnProgress)
	serverNormal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(content)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(content))
	}))
	defer serverNormal.Close()

	dDefaultBar := NewDownloader(memFS, nil)
	dDefaultBar.Quiet = false
	err = dDefaultBar.Download(context.Background(), serverNormal.URL, "/default-bar.txt", "")
	if err != nil {
		t.Fatalf("unexpected error downloading with default bar: %v", err)
	}

	// Canceled context on retry
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	err = dDefaultBar.Download(canceledCtx, server416.URL+"/nonexistent", "/cancel.txt", "", DownloadOptions{
		RetryCount: 1,
		RetryDelay: 10 * time.Millisecond,
	})
	if err == nil {
		t.Errorf("expected error with canceled context")
	}

	// Hash mismatch on full download
	err = dDefaultBar.Download(context.Background(), serverNormal.URL, "/badhash.txt", "0000000000000000000000000000000000000000000000000000000000000000")
	if err == nil {
		t.Errorf("expected error for sha256 mismatch")
	}

	// 416 with valid expected hash (should succeed immediately)
	_ = memFS.WriteFile("/valid416.txt", []byte(content), 0644)
	err = d.Download(context.Background(), server416.URL, "/valid416.txt", hash)
	if err != nil {
		t.Fatalf("unexpected error when 416 file hash matches: %v", err)
	}

	// 416 with recovery error (server returning 500 on recovery GET)
	server416Error := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server416Error.Close()

	_ = memFS.WriteFile("/bad416.txt", []byte("wrong"), 0644)
	err = d.Download(context.Background(), server416Error.URL, "/bad416.txt", hash, DownloadOptions{RetryCount: 0})
	if err == nil {
		t.Errorf("expected error when 416 recovery GET fails with 500")
	}
}

// A dry run's MemFS reports the size of a partial file that exists only on the
// host, but it cannot append to host content. The resume must fail on the append
// open instead of leaving a MemFS file that holds only the tail of the download.
func TestDownloaderResumeOfHostOnlyPartialUnderHostFallback(t *testing.T) {
	const fullContent = "Hello, host fallback resume"
	const prefix = "Hello, "
	destPath := filepath.Join(t.TempDir(), "partial.bin")
	if err := os.WriteFile(destPath, []byte(prefix), 0644); err != nil {
		t.Fatalf("writing host partial file: %v", err)
	}

	var gotRange string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRange = r.Header.Get("Range")
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write([]byte(fullContent[len(prefix):]))
	}))
	defer server.Close()

	memFS := fs.NewMemFSWithHostFallback()
	if err := memFS.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	d := NewDownloader(memFS, nil)

	err := d.Download(context.Background(), server.URL, destPath, "")
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected the append open to fail with %v, got %v", os.ErrNotExist, err)
	}
	if !strings.Contains(err.Error(), "opening partial download for append") {
		t.Errorf("expected the append-open context, got %v", err)
	}
	if wantRange := fmt.Sprintf("bytes=%d-", len(prefix)); gotRange != wantRange {
		t.Errorf("Range = %q, want %q", gotRange, wantRange)
	}
	if _, err := memFS.ReadFile(destPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected no MemFS file at %s, ReadFile error = %v", destPath, err)
	}
}

func TestDownloaderEmptyCacheDirFallsBackToGeneratedCache(t *testing.T) {
	memFS := fs.NewMemFS()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("cached"))
	}))
	defer server.Close()

	d := NewDownloader(memFS, nil)
	d.CacheEnabled = true
	d.CacheDir = ""
	if err := d.Download(context.Background(), server.URL, "/empty-cachedir.txt", ""); err != nil {
		t.Fatalf("unexpected download error: %v", err)
	}

	cachePath := filepath.Join(".generated", "cache", getCacheKey(server.URL, nil))
	data, err := memFS.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("expected the download to be cached at %s: %v", cachePath, err)
	}
	if string(data) != "cached" {
		t.Errorf("expected cached content %q, got %q", "cached", string(data))
	}
}

func TestDownloaderEdgeCasesAndProgress(t *testing.T) {
	memFS := fs.NewMemFS()
	d := NewDownloader(memFS, nil)

	// 1. Server returns 500 error
	errServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer errServer.Close()

	err := d.Download(context.Background(), errServer.URL, "/fail.txt", "")
	if err == nil {
		t.Errorf("expected error on HTTP 500 response")
	}

	// 2. Invalid checksum with retry exhaustion
	okServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("some data"))
	}))
	defer okServer.Close()

	err = d.Download(context.Background(), okServer.URL, "/badhash.txt", "deadbeefbadhash")
	if err == nil {
		t.Errorf("expected error on checksum mismatch")
	}

	// 4. Cache hit & cache write
	cacheFS := fs.NewMemFS()
	cd := NewDownloader(cacheFS, nil)
	cd.CacheEnabled = true
	cd.CacheDir = "/cache"

	okServer2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("cached data"))
	}))
	defer okServer2.Close()

	err = cd.Download(context.Background(), okServer2.URL, "/dl-cache1.txt", "", DownloadOptions{})
	if err != nil {
		t.Fatalf("unexpected cache download error: %v", err)
	}

	// Second download should hit cache
	cd.SetQuiet(true)
	cd.SetFS(cacheFS)
	err = cd.Download(context.Background(), okServer2.URL, "/dl-cache2.txt", "", DownloadOptions{})
	if err != nil {
		t.Fatalf("unexpected cache hit error: %v", err)
	}

	// 6. Existing file when server returns 200 OK (no range support)
	noRangeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("full replacement data"))
	}))
	defer noRangeServer.Close()

	_ = cacheFS.WriteFile("/existing.txt", []byte("old"), 0644)
	err = cd.Download(context.Background(), noRangeServer.URL, "/existing.txt", "", DownloadOptions{SkipCache: true})
	if err != nil {
		t.Fatalf("unexpected download error on existing file 200 OK: %v", err)
	}
	var progressCalled bool
	err = cd.Download(context.Background(), okServer2.URL, "/dl-progress.txt", "", DownloadOptions{
		SkipCache: true,
		Headers:   map[string]string{"X-Test-Header": "1"},
		OnProgress: func(downloaded, total int64) {
			progressCalled = true
		},
	})
	if err != nil || !progressCalled {
		t.Errorf("expected OnProgress callback to be invoked")
	}

	// 416 status code with hash mismatch triggers recovery download
	range416RecoveryServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("fresh recovered data"))
	}))
	defer range416RecoveryServer.Close()

	_ = cacheFS.WriteFile("/dl-416rec.txt", []byte("stale data"), 0644)
	err = cd.Download(context.Background(), range416RecoveryServer.URL, "/dl-416rec.txt", fmt.Sprintf("%x", sha256.Sum256([]byte("fresh recovered data"))), DownloadOptions{SkipCache: true})
	if err != nil {
		t.Errorf("expected 416 recovery download to succeed: %v", err)
	}

	// 7. Partial resume 206 Partial Content
	range206Server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.Header().Set("Content-Range", "bytes 3-8/9")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write([]byte(" resume"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("old resume"))
	}))
	defer range206Server.Close()

	_ = cacheFS.WriteFile("/dl-206.txt", []byte("old"), 0644)
	var prog206Called bool
	err = cd.Download(context.Background(), range206Server.URL, "/dl-206.txt", "", DownloadOptions{
		SkipCache: true,
		OnProgress: func(d, t int64) {
			prog206Called = true
		},
	})
	if err != nil || !prog206Called {
		t.Errorf("expected 206 partial content download to succeed with progress: %v", err)
	}

	// 416 status code with matching sha256
	range416HashServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
	}))
	defer range416HashServer.Close()

	knownHashData := []byte("already complete data")
	_ = cacheFS.WriteFile("/dl-416hash.txt", knownHashData, 0644)
	knownHash := fmt.Sprintf("%x", sha256.Sum256(knownHashData))
	err = cd.Download(context.Background(), range416HashServer.URL, "/dl-416hash.txt", knownHash, DownloadOptions{SkipCache: true})
	if err != nil {
		t.Errorf("expected 416 with valid hash to return nil, got %v", err)
	}

	// 8. Cache TTL expiration
	expCacheFS := fs.NewMemFS()
	expDL := NewDownloader(expCacheFS, nil)
	expDL.CacheEnabled = true
	expDL.CacheTTL = 1 * time.Nanosecond
	expDL.CacheDir = "/cache"

	_ = expCacheFS.MkdirAll("/cache", 0755)
	keyStr := getCacheKey(okServer2.URL, nil)
	_ = expCacheFS.WriteFile(filepath.Join("/cache", keyStr), []byte("stale cache"), 0644)
	time.Sleep(10 * time.Millisecond)

	err = expDL.Download(context.Background(), okServer2.URL, "/dl-exp.txt", "", DownloadOptions{})
	if err != nil {
		t.Fatalf("expected download to succeed after cache TTL expiration: %v", err)
	}

	// 9. Context cancellation and invalid URL
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	err = cd.Download(ctxCanceled, okServer2.URL, "/dl-cancel.txt", "", DownloadOptions{})
	if err == nil {
		t.Errorf("expected error on canceled context")
	}

	err = cd.Download(context.Background(), "http://127.0.0.1:1/invalid", "/dl-invalid.txt", "", DownloadOptions{})
	if err == nil {
		t.Errorf("expected error on connection failure")
	}

	// 10. ProgressBar TTY methods and Download with TTY enabled
	origTTYFunc := isInteractiveTTYFunc
	isInteractiveTTYFunc = func() bool { return true }
	defer func() { isInteractiveTTYFunc = origTTYFunc }()

	bar := NewProgressBar(100, "testfile.tar.gz")
	bar.Start()
	bar.Update(50)
	bar.Update(100)
	bar.Finish()

	// Test RenderFrame with 0 total bytes and short duration
	bar0 := NewProgressBar(0, "unknown.tar.gz")
	bar0.isTTY = true
	bar0.bytesDownloaded = 500
	bar0.startTime = time.Now().Add(-100 * time.Millisecond)
	bar0.RenderFrame()

	// Download with TTY bar enabled
	err = cd.Download(context.Background(), okServer2.URL, "/dl-tty.txt", "", DownloadOptions{SkipCache: true})
	if err != nil {
		t.Errorf("expected TTY download to succeed: %v", err)
	}

	// 11. 416 Status Recovery Failure (returns 500 on recovery)
	range416FailRecoveryServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer range416FailRecoveryServer.Close()

	_ = cacheFS.WriteFile("/dl-416fail.txt", []byte("bad data"), 0644)
	err = cd.Download(context.Background(), range416FailRecoveryServer.URL, "/dl-416fail.txt", "somehash", DownloadOptions{SkipCache: true})
	if err == nil {
		t.Errorf("expected error when 416 recovery returns 500")
	}

	// 12. Retry with delay and eventual success
	retryAttempts := 0
	retryServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		retryAttempts++
		if retryAttempts < 2 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("eventual success"))
	}))
	defer retryServer.Close()

	err = cd.Download(context.Background(), retryServer.URL, "/dl-retry.txt", "", DownloadOptions{
		RetryCount: 2,
		RetryDelay: 5 * time.Millisecond,
		SkipCache:  true,
	})
	if err != nil {
		t.Errorf("expected retry download to succeed, got %v", err)
	}

	// 13. Retry delay context cancellation
	failServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer failServer.Close()

	ctxRetryCancel, cancelRetry := context.WithCancel(context.Background())
	go func() {
		time.Sleep(10 * time.Millisecond)
		cancelRetry()
	}()
	err = cd.Download(ctxRetryCancel, failServer.URL, "/dl-retry-cancel.txt", "", DownloadOptions{
		RetryCount: 3,
		RetryDelay: 50 * time.Millisecond,
		SkipCache:  true,
	})
	if err == nil {
		t.Errorf("expected context cancellation error during retry backoff")
	}

	// 14. Cache hit with OnProgress callback
	cacheProgressFS := fs.NewMemFS()
	cacheProgressDL := NewDownloader(cacheProgressFS, nil)
	cacheProgressDL.CacheEnabled = true
	cacheProgressDL.CacheDir = "/cache-prog"
	_ = cacheProgressFS.MkdirAll("/cache-prog", 0755)

	keyStrProg := getCacheKey(okServer2.URL, nil)
	_ = cacheProgressFS.WriteFile(filepath.Join("/cache-prog", keyStrProg), []byte("cached content"), 0644)

	var cacheProgCalled bool
	err = cacheProgressDL.Download(context.Background(), okServer2.URL, "/dl-cached-prog.txt", "", DownloadOptions{
		OnProgress: func(downloaded, total int64) {
			cacheProgCalled = true
		},
	})
	if err != nil || !cacheProgCalled {
		t.Errorf("expected cache hit with OnProgress callback to succeed: %v, called: %v", err, cacheProgCalled)
	}

	// 15. Download timeout option
	err = cd.Download(context.Background(), okServer2.URL, "/dl-timeout.txt", "", DownloadOptions{
		Timeout:   10 * time.Second,
		SkipCache: true,
	})
	if err != nil {
		t.Errorf("expected download with timeout option to succeed, got %v", err)
	}
}

func TestDownloader_PersistentCacheDefaultsAndHashVerification(t *testing.T) {
	memFS := fs.NewMemFS()
	dl := NewDownloader(memFS, nil)

	if !dl.CacheEnabled {
		t.Errorf("expected CacheEnabled to be true by default, got %v", dl.CacheEnabled)
	}
	expectedDefaultDir := filepath.Join(".generated", "cache", "downloads")
	if dl.CacheDir != expectedDefaultDir {
		t.Errorf("expected default CacheDir %q, got %q", expectedDefaultDir, dl.CacheDir)
	}
	if dl.CacheTTL != 30*24*time.Hour {
		t.Errorf("expected default CacheTTL 30 days, got %v", dl.CacheTTL)
	}

	serverHits := 0
	serverContent := "actual-fresh-server-content"
	serverHash := fmt.Sprintf("%x", sha256.Sum256([]byte(serverContent)))
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serverHits++
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(serverContent)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(serverContent))
	}))
	defer ts.Close()

	// 1. Initial download populates cache
	err := dl.Download(context.Background(), ts.URL, "/dest.txt", serverHash)
	if err != nil {
		t.Fatalf("first download failed: %v", err)
	}
	if serverHits != 1 {
		t.Fatalf("expected 1 server hit, got %d", serverHits)
	}

	// 2. Second download with matching SHA256 is a cache hit (0 extra server hits)
	err = dl.Download(context.Background(), ts.URL, "/dest2.txt", serverHash)
	if err != nil {
		t.Fatalf("second download failed: %v", err)
	}
	if serverHits != 1 {
		t.Errorf("expected still 1 server hit on cache hit, got %d", serverHits)
	}

	// 3. Corrupted cache item with mismatched SHA256 bypasses corrupted cache and re-downloads
	keyStr := getCacheKey(ts.URL, nil)
	_ = memFS.WriteFile(filepath.Join(dl.CacheDir, keyStr), []byte("corrupted-data"), 0644)
	err = dl.Download(context.Background(), ts.URL, "/dest3.txt", serverHash)
	if err != nil {
		t.Fatalf("download with corrupted cache failed: %v", err)
	}
	if serverHits != 2 {
		t.Errorf("expected 2 server hits after corrupted cache bypass, got %d", serverHits)
	}
}

// TestSettingsGovernDownloads proves the project-level download policy reaches an
// actual download: retries are attempted as many times as the policy says, and a
// timeout shorter than the server's response aborts the attempt. Without it the
// downloader falls back to its own constants and a configured retryCount changes
// nothing.
func TestSettingsGovernDownloads(t *testing.T) {
	t.Run("RetryCount decides how many attempts a failing download gets", func(t *testing.T) {
		var attempts int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attempts++
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		memFS := fs.NewMemFS()
		dl := NewDownloader(memFS, server.Client())
		dl.CacheEnabled = false
		dl.Apply(Settings{RetryCount: 2, RetryDelay: time.Millisecond})

		if err := dl.Download(context.Background(), server.URL, "/dest.txt", ""); err == nil {
			t.Fatal("expected the download to fail, got nil")
		}
		// One initial attempt plus two retries.
		if attempts != 3 {
			t.Errorf("server was hit %d times, want 3", attempts)
		}
	})

	t.Run("Timeout bounds an attempt the call does not bound itself", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(200 * time.Millisecond)
			_, _ = w.Write([]byte("too late"))
		}))
		defer server.Close()

		memFS := fs.NewMemFS()
		dl := NewDownloader(memFS, server.Client())
		dl.CacheEnabled = false
		dl.Apply(Settings{Timeout: 10 * time.Millisecond})

		err := dl.Download(context.Background(), server.URL, "/dest.txt", "")
		if err == nil {
			t.Fatal("expected the download to time out, got nil")
		}
	})

	t.Run("a per-call option still overrides the policy", func(t *testing.T) {
		var attempts int
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attempts++
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		memFS := fs.NewMemFS()
		dl := NewDownloader(memFS, server.Client())
		dl.CacheEnabled = false
		dl.Apply(Settings{RetryCount: 5, RetryDelay: time.Millisecond})

		err := dl.Download(context.Background(), server.URL, "/dest.txt", "", DownloadOptions{
			RetryCount: 1,
			RetryDelay: time.Millisecond,
		})
		if err == nil {
			t.Fatal("expected the download to fail, got nil")
		}
		if attempts != 2 {
			t.Errorf("server was hit %d times, want 2", attempts)
		}
	})
}

// TestDownload_ReportsHTTPStatus pins that a download refused by the server carries
// its status as a *StatusError through the retry wrapping, so a caller can tell a
// file that does not exist (404) from a failed request without parsing the message.
func TestDownload_ReportsHTTPStatus(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
			defer server.Close()
			d := NewDownloader(fs.NewMemFS(), server.Client())

			err := d.Download(context.Background(), server.URL+"/asset.tar.gz", "/asset.tar.gz", "")
			var statusErr *StatusError
			if !errors.As(err, &statusErr) || statusErr.StatusCode != status {
				t.Fatalf("Download() error = %v, want a *StatusError with status %d", err, status)
			}
			if want := fmt.Sprintf("download failed with status %d", status); !strings.Contains(err.Error(), want) {
				t.Errorf("Download() error = %v, want it to contain %q", err, want)
			}
		})
	}
}

// closeFailFS wraps a real file system so that every writer it hands out writes and
// closes normally but then reports closeErr from Close, the way close(2) reports a
// write the operating system could not commit.
type closeFailFS struct {
	fs.FS
	closeErr      error
	removeErr     error
	removeDeletes bool
}

// Remove fails with removeErr. With removeDeletes it deletes the file first, as a
// TrackedFileSystem does before failing to record the removal.
func (c *closeFailFS) Remove(path string) error {
	if c.removeErr == nil {
		return c.FS.Remove(path)
	}
	if c.removeDeletes {
		if err := c.FS.Remove(path); err != nil {
			return err
		}
	}
	return c.removeErr
}

type closeFailWriter struct {
	io.WriteCloser
	closeErr error
}

func (w *closeFailWriter) Close() error {
	if err := w.WriteCloser.Close(); err != nil {
		return err
	}
	return w.closeErr
}

func (c *closeFailFS) Create(path string) (io.WriteCloser, error) {
	w, err := c.FS.Create(path)
	if err != nil {
		return nil, err
	}
	return &closeFailWriter{WriteCloser: w, closeErr: c.closeErr}, nil
}

func (c *closeFailFS) OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	w, err := c.FS.OpenFile(path, flag, perm)
	if err != nil {
		return nil, err
	}
	return &closeFailWriter{WriteCloser: w, closeErr: c.closeErr}, nil
}

// TestDownloadFailsWhenClosingTheFileFails covers every path that writes a download
// (a full 200, a resumed 206, and the clean retry after a 416): a destination whose
// close fails is a failed attempt. It is retried from scratch rather than resumed
// onto, it is neither cached nor reported as downloaded, and no file is left behind.
func TestDownloadFailsWhenClosingTheFileFails(t *testing.T) {
	const content = "complete release asset"
	tests := []struct {
		name       string
		partial    string
		status     int
		wantRanges []string
	}{
		{"200 full download", "", http.StatusOK, []string{"", ""}},
		{"206 resumed download", "0123456789", http.StatusPartialContent, []string{"bytes=10-", ""}},
		{"416 clean retry", strings.Repeat("x", len(content)+5), http.StatusRequestedRangeNotSatisfiable, []string{"bytes=27-", "", ""}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var mu sync.Mutex
			var ranges []string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				ranges = append(ranges, r.Header.Get("Range"))
				mu.Unlock()
				if r.Header.Get("Range") == "" {
					_, _ = w.Write([]byte(content))
					return
				}
				w.WriteHeader(tt.status)
				if tt.status == http.StatusPartialContent {
					_, _ = w.Write([]byte(content[len(tt.partial):]))
				}
			}))
			defer server.Close()

			mem := fs.NewMemFS()
			const dest = "/asset.tar.gz"
			if tt.partial != "" {
				if err := mem.WriteFile(dest, []byte(tt.partial), 0644); err != nil {
					t.Fatalf("writing partial download: %v", err)
				}
			}
			d := NewDownloader(&closeFailFS{FS: mem, closeErr: syscall.EIO}, server.Client())
			d.CacheDir = "/cache"
			var emitted []lifecycle.Event
			ctx := lifecycle.WithEmitter(context.Background(), func(_ context.Context, event lifecycle.Event, _ lifecycle.Details) error {
				emitted = append(emitted, event)
				return nil
			})

			err := d.Download(ctx, server.URL, dest, "", DownloadOptions{RetryCount: 1, RetryDelay: time.Millisecond, Quiet: true})
			if !errors.Is(err, syscall.EIO) {
				t.Fatalf("Download() error = %v, want one wrapping EIO", err)
			}
			if !strings.Contains(err.Error(), dest) {
				t.Errorf("Download() error = %v, want it to name %q", err, dest)
			}
			if exists, _ := mem.Exists(dest); exists {
				t.Errorf("Download() left %q behind after its close failed", dest)
			}
			if exists, _ := mem.Exists(getCachePath(d.CacheDir, server.URL, nil)); exists {
				t.Error("Download() cached a download whose close failed")
			}
			if len(emitted) != 0 {
				t.Errorf("Download() emitted %v for a download whose close failed", emitted)
			}
			mu.Lock()
			defer mu.Unlock()
			if !slices.Equal(ranges, tt.wantRanges) {
				t.Errorf("request Range headers = %q, want %q (the retry must start over, not resume onto the failed file)", ranges, tt.wantRanges)
			}
		})
	}
}

// TestDownloadStartsOverWhenAStreamIsCutOffAndItsCloseFails covers a response cut off
// part way whose file then also fails to close: the bytes written before the cut are
// no more trustworthy than the rest, so the retry downloads the file anew instead of
// resuming onto them.
func TestDownloadStartsOverWhenAStreamIsCutOffAndItsCloseFails(t *testing.T) {
	var mu sync.Mutex
	var ranges []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		ranges = append(ranges, r.Header.Get("Range"))
		mu.Unlock()
		// Promise more than is sent, so the client's read of the body fails part way.
		w.Header().Set("Content-Length", "100")
		_, _ = w.Write([]byte("first ten."))
	}))
	defer server.Close()
	mem := fs.NewMemFS()
	const dest = "/asset"
	d := NewDownloader(&closeFailFS{FS: mem, closeErr: syscall.EIO}, server.Client())
	d.CacheEnabled = false

	err := d.Download(context.Background(), server.URL, dest, "", DownloadOptions{RetryCount: 1, RetryDelay: time.Millisecond, Quiet: true})
	if !errors.Is(err, syscall.EIO) || !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("Download() error = %v, want one wrapping both the cut-off stream and EIO", err)
	}
	if exists, _ := mem.Exists(dest); exists {
		t.Errorf("Download() left %q behind after its close failed", dest)
	}
	mu.Lock()
	defer mu.Unlock()
	if want := []string{"", ""}; !slices.Equal(ranges, want) {
		t.Errorf("request Range headers = %q, want %q (the retry must start over, not resume onto the failed file)", ranges, want)
	}
}

// TestDownloadReportsAFailedRemovalOfAFileWhoseCloseFailed covers a download whose
// close failed and whose removal then failed too: both are reported, and the download
// is not retried, since the file left behind is one the next attempt would resume onto.
func TestDownloadReportsAFailedRemovalOfAFileWhoseCloseFailed(t *testing.T) {
	var mu sync.Mutex
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests++
		mu.Unlock()
		_, _ = w.Write([]byte("payload"))
	}))
	defer server.Close()
	removeErr := errors.New("remove failed")
	d := NewDownloader(&closeFailFS{FS: fs.NewMemFS(), closeErr: syscall.EIO, removeErr: removeErr}, server.Client())
	d.CacheEnabled = false

	err := d.Download(context.Background(), server.URL, "/asset", "", DownloadOptions{RetryCount: 2, RetryDelay: time.Millisecond, Quiet: true})
	if !errors.Is(err, syscall.EIO) || !errors.Is(err, removeErr) {
		t.Fatalf("Download() error = %v, want one wrapping both EIO and the removal error", err)
	}
	if !strings.Contains(err.Error(), `delete "/asset"`) {
		t.Errorf("Download() error = %v, want it to say which file to delete", err)
	}
	if !strings.Contains(err.Error(), "after 1 attempts") {
		t.Errorf("Download() error = %v, want it to report the single attempt made", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if requests != 1 {
		t.Errorf("Download() made %d requests, want 1: a retry would resume onto the file it could not remove", requests)
	}
}

// TestDownloadRetriesWhenTheFileWhoseCloseFailedIsGone covers a removal that reports
// an error but leaves no file behind, as a TrackedFileSystem that deletes the file and
// then fails to record it does: nothing is left for a retry to resume onto, so the
// download is retried from scratch and the retry succeeds.
func TestDownloadRetriesWhenTheFileWhoseCloseFailedIsGone(t *testing.T) {
	var mu sync.Mutex
	var ranges []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		ranges = append(ranges, r.Header.Get("Range"))
		mu.Unlock()
		_, _ = w.Write([]byte("payload"))
	}))
	defer server.Close()
	mem := fs.NewMemFS()
	failing := &closeFailFS{FS: mem, closeErr: syscall.EIO, removeErr: errors.New("recording removal failed"), removeDeletes: true}
	d := NewDownloader(&onceFS{closeFailFS: failing, healthy: mem}, server.Client())
	d.CacheEnabled = false

	if err := d.Download(context.Background(), server.URL, "/asset", "", DownloadOptions{RetryCount: 1, RetryDelay: time.Millisecond, Quiet: true}); err != nil {
		t.Fatalf("Download() error = %v, want the retry to succeed", err)
	}
	if got, _ := mem.ReadFile("/asset"); string(got) != "payload" {
		t.Errorf("downloaded file = %q, want %q", got, "payload")
	}
	mu.Lock()
	if want := []string{"", ""}; !slices.Equal(ranges, want) {
		t.Errorf("request Range headers = %q, want %q (the retry must start over)", ranges, want)
	}
	mu.Unlock()

	// A removal that finds nothing to remove is no failure at all.
	notExist := &os.PathError{Op: "remove", Path: "/asset", Err: os.ErrNotExist}
	d = NewDownloader(&closeFailFS{FS: fs.NewMemFS(), closeErr: syscall.EIO, removeErr: notExist, removeDeletes: true}, server.Client())
	d.CacheEnabled = false
	if err := d.Download(context.Background(), server.URL, "/asset", "", DownloadOptions{Quiet: true}); !errors.Is(err, syscall.EIO) || errors.Is(err, os.ErrNotExist) {
		t.Errorf("Download() error = %v, want EIO without a removal failure", err)
	}

	// Without a retry, the removal failure is still reported beside the close error.
	failing = &closeFailFS{FS: fs.NewMemFS(), closeErr: syscall.EIO, removeErr: failing.removeErr, removeDeletes: true}
	d = NewDownloader(failing, server.Client())
	d.CacheEnabled = false
	err := d.Download(context.Background(), server.URL, "/asset", "", DownloadOptions{Quiet: true})
	if !errors.Is(err, syscall.EIO) || !errors.Is(err, failing.removeErr) {
		t.Errorf("Download() error = %v, want one wrapping both EIO and the removal error", err)
	}
}

// onceFS fails its first Create the way closeFailFS does and serves every later one
// from healthy.
type onceFS struct {
	*closeFailFS
	healthy fs.FS
	created bool
}

func (o *onceFS) Create(path string) (io.WriteCloser, error) {
	if o.created {
		return o.healthy.Create(path)
	}
	o.created = true
	return o.closeFailFS.Create(path)
}

// TestDownloadResumesAStreamCutOffPartWay covers the other side of removing a file
// whose close failed: a response cut off part way into a file that closes cleanly
// keeps its bytes, and the retry resumes after them.
func TestDownloadResumesAStreamCutOffPartWay(t *testing.T) {
	const content = "first ten.and the rest"
	var mu sync.Mutex
	var ranges []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		ranges = append(ranges, r.Header.Get("Range"))
		mu.Unlock()
		if r.Header.Get("Range") == "bytes=10-" {
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write([]byte(content[10:]))
			return
		}
		// Promise the whole file but send only its first ten bytes.
		w.Header().Set("Content-Length", strconv.Itoa(len(content)))
		_, _ = w.Write([]byte(content[:10]))
	}))
	defer server.Close()
	mem := fs.NewMemFS()
	d := NewDownloader(mem, server.Client())
	d.CacheEnabled = false

	if err := d.Download(context.Background(), server.URL, "/asset", "", DownloadOptions{RetryCount: 1, RetryDelay: time.Millisecond, Quiet: true}); err != nil {
		t.Fatalf("Download() error = %v", err)
	}
	if got, _ := mem.ReadFile("/asset"); string(got) != content {
		t.Errorf("downloaded file = %q, want %q", got, content)
	}
	mu.Lock()
	defer mu.Unlock()
	if want := []string{"", "bytes=10-"}; !slices.Equal(ranges, want) {
		t.Errorf("request Range headers = %q, want %q", ranges, want)
	}
}
