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
	"path/filepath"
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

func (e *errorFS) OpenFile(path string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	if e.readFileErr != nil {
		return nil, e.readFileErr
	}
	if e.writeFileErr != nil {
		return nil, e.writeFileErr
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

func TestPartialContentFallbackBranch(t *testing.T) {
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
		t.Fatalf("partial content fallback download failed: %v, progressCalled=%v", err, progressCalled)
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

type failOpenFileFS struct {
	fs.FS
}

func (f *failOpenFileFS) OpenFile(name string, flag int, perm os.FileMode) (io.WriteCloser, error) {
	return nil, fmt.Errorf("openfile not supported")
}

func TestDownloaderFallbackFS(t *testing.T) {
	memFS := fs.NewMemFS()
	failFS := &failOpenFileFS{FS: memFS}

	fullContent := "Hello, partial fallback!"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(fullContent)))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write([]byte(fullContent[5:]))
	}))
	defer server.Close()

	_ = memFS.WriteFile("/fallback.txt", []byte("Hello"), 0644)
	d := NewDownloader(failFS, nil)

	var progressCalled bool
	err := d.Download(context.Background(), server.URL, "/fallback.txt", hash, DownloadOptions{
		OnProgress: func(downloaded, total int64) {
			progressCalled = true
		},
	})
	if err != nil {
		t.Fatalf("unexpected error in fallback FS: %v", err)
	}

	data, err := memFS.ReadFile("/fallback.txt")
	if err != nil || string(data) != fullContent {
		t.Errorf("expected %q, got %q", fullContent, string(data))
	}
	if !progressCalled {
		t.Errorf("expected progress callback to be called")
	}

	// Cache with empty CacheDir
	serverNormal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("cached"))
	}))
	defer serverNormal.Close()

	dEmptyCacheDir := NewDownloader(memFS, nil)
	dEmptyCacheDir.CacheEnabled = true
	dEmptyCacheDir.CacheDir = ""
	_ = dEmptyCacheDir.Download(context.Background(), serverNormal.URL, "/empty-cachedir.txt", "")
}

type readOnlyCloser struct {
	io.Reader
}

func (r *readOnlyCloser) Close() error { return nil }

type mockOnlyReadCloserFS struct {
	fs.FS
}

func (m *mockOnlyReadCloserFS) Open(name string) (io.ReadCloser, error) {
	data, _ := m.FS.ReadFile(name)
	return &readOnlyCloser{Reader: strings.NewReader(string(data))}, nil
}

func TestDownloaderReadOnlyCloserFS(t *testing.T) {
	memFS := fs.NewMemFS()
	mockFS := &mockOnlyReadCloserFS{FS: memFS}

	fullContent := "Read closer fallback test"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(fullContent)))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fullContent))
	}))
	defer server.Close()

	_ = memFS.WriteFile("/ro.txt", []byte("old"), 0644)
	d := NewDownloader(mockFS, nil)

	err := d.Download(context.Background(), server.URL, "/ro.txt", hash)
	if err != nil {
		t.Fatalf("unexpected error with readOnlyCloserFS: %v", err)
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

	// 10. ProgressBar TTY methods
	bar := NewProgressBar(100, "testfile.tar.gz")
	bar.isTTY = true
	bar.Start()
	bar.Update(50)
	bar.Update(100)
	bar.Finish()
}


