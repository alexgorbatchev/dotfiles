package downloader

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"context"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
)

// DownloadOptions configure the download process.
type DownloadOptions struct {
	Headers    map[string]string
	Timeout    time.Duration
	RetryCount int
	RetryDelay time.Duration
	OnProgress func(bytesDownloaded int64, totalBytes int64)
	SkipCache  bool
	Quiet      bool
	// HostScopedHeaders drops the Authorization header on a redirect that leaves the
	// host of url (HostScopedClient), for a token configured for that host alone.
	HostScopedHeaders bool
}

type cacheKeyPayload struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
}

func getCacheKey(url string, headers map[string]string) string {
	payload := cacheKeyPayload{
		URL:     url,
		Headers: headers,
	}
	data, _ := json.Marshal(payload)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// defaultRetryDelay is the base delay between download attempts when neither the
// project configuration nor the call that starts the download names one.
const defaultRetryDelay = time.Second

// Settings is the project-level download policy: what every download this
// downloader performs does unless the call that starts it overrides the value.
// It is what the `downloader` section of a project configuration resolves to.
type Settings struct {
	CacheDir     string
	CacheTTL     time.Duration
	CacheEnabled bool
	// Timeout bounds a single attempt; zero leaves the attempt unbounded.
	Timeout time.Duration
	// RetryCount is how many times a failed attempt is repeated; zero attempts the
	// download once.
	RetryCount int
	// RetryDelay is the base delay between attempts, multiplied by the attempt
	// number for linear backoff; zero selects defaultRetryDelay.
	RetryDelay time.Duration
}

// Downloader manages file downloads with optional resumption support and SHA256 integrity checks.
type Downloader struct {
	fsys         fs.FS
	client       *http.Client
	CacheDir     string
	CacheEnabled bool
	CacheTTL     time.Duration
	// Timeout, RetryCount and RetryDelay are the defaults a DownloadOptions that
	// leaves the corresponding field zero falls back to. See Settings.
	Timeout    time.Duration
	RetryCount int
	RetryDelay time.Duration
	Quiet      bool
}

// Apply installs the project-level download policy on d. A zero value leaves the
// current setting in place, so a configuration that names one knob does not reset
// the others; CacheEnabled is always taken from s, because false is a meaningful
// value for it.
func (d *Downloader) Apply(s Settings) {
	if d == nil {
		return
	}
	if s.CacheDir != "" {
		d.CacheDir = s.CacheDir
	}
	if s.CacheTTL > 0 {
		d.CacheTTL = s.CacheTTL
	}
	d.CacheEnabled = s.CacheEnabled
	if s.Timeout > 0 {
		d.Timeout = s.Timeout
	}
	if s.RetryCount > 0 {
		d.RetryCount = s.RetryCount
	}
	if s.RetryDelay > 0 {
		d.RetryDelay = s.RetryDelay
	}
}

// SetQuiet controls whether progress bar rendering is suppressed.
func (d *Downloader) SetQuiet(quiet bool) {
	if d != nil {
		d.Quiet = quiet
	}
}

// NewDownloader creates a new Downloader using the provided filesystem and HTTP client.
func NewDownloader(fsys fs.FS, client *http.Client) *Downloader {
	if client == nil {
		client = &http.Client{
			Transport: &http.Transport{
				ResponseHeaderTimeout: 30 * time.Second,
			},
			Timeout: 0,
		}
	} else {
		client.Timeout = 0
		if client.Transport == nil {
			client.Transport = &http.Transport{
				ResponseHeaderTimeout: 30 * time.Second,
			}
		} else if tr, ok := client.Transport.(*http.Transport); ok && tr.ResponseHeaderTimeout == 0 {
			tr.ResponseHeaderTimeout = 30 * time.Second
		}
	}
	return &Downloader{
		fsys:         fsys,
		client:       client,
		CacheEnabled: true,
		CacheDir:     filepath.Join(".generated", "cache", "downloads"),
		CacheTTL:     30 * 24 * time.Hour,
	}
}

// SetHTTPClient replaces the client every request goes through. The client is
// used exactly as given, so the caller owns its timeouts; the development proxy
// relies on this to route downloads through itself.
func (d *Downloader) SetHTTPClient(client *http.Client) {
	if d != nil && client != nil {
		d.client = client
	}
}

func (d *Downloader) SetFS(fsys fs.FS) {
	if d != nil {
		d.fsys = fsys
	}
}

// StatusError is a download the server answered with a status that carries no file.
// Download wraps it, so callers use errors.As to tell a file that does not exist
// (http.StatusNotFound) from a failed request.
type StatusError struct {
	StatusCode int
	Status     string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("download failed with status %d: %s", e.StatusCode, e.Status)
}

// Download fetches a file from url and saves it to destPath, supporting options and retries with backoff.
func (d *Downloader) Download(ctx context.Context, url string, destPath string, expectedSHA256 string, opts ...DownloadOptions) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	var activeOpts []DownloadOptions
	if len(opts) > 0 {
		activeOpts = append(activeOpts, opts[0])
	} else {
		activeOpts = []DownloadOptions{{}}
	}

	// 1. Handle Caching Check (if enabled)
	skipCache := activeOpts[0].SkipCache || config.IsOverwriteEnabled(ctx)
	cacheDir := d.CacheDir
	if cacheDir == "" {
		cacheDir = filepath.Join(".generated", "cache")
	}

	if d.CacheEnabled && !skipCache {
		keyStr := getCacheKey(url, activeOpts[0].Headers)
		cachePath := filepath.Join(cacheDir, keyStr)

		exists, err := d.fsys.Exists(cachePath)
		if err == nil && exists {
			info, err := d.fsys.Stat(cachePath)
			if err == nil {
				ttl := d.CacheTTL
				if ttl <= 0 {
					ttl = 30 * 24 * time.Hour
				}
				if time.Since(info.ModTime()) < ttl {
					cacheValid := true
					if expectedSHA256 != "" {
						if ok, errHash := d.verifyHash(cachePath, expectedSHA256); errHash != nil || !ok {
							cacheValid = false
							_ = d.fsys.Remove(cachePath)
						}
					}
					if cacheValid {
						errCopy := d.fsys.CopyFile(cachePath, destPath)
						if errCopy == nil {
							if activeOpts[0].OnProgress != nil {
								size := info.Size()
								activeOpts[0].OnProgress(0, size)
								activeOpts[0].OnProgress(size, size)
							}
							return nil
						}
					}
				}
			}
		}
	}

	// 2. Set up default progress bar if OnProgress is nil
	var bar *ProgressBar
	if activeOpts[0].OnProgress == nil {
		filename := filepath.Base(destPath)
		bar = NewProgressBar(0, filename)
		if bar.isTTY {
			bar.Start()
			origOnProgress := activeOpts[0].OnProgress
			activeOpts[0].OnProgress = func(downloaded int64, total int64) {
				if bar.totalBytes <= 0 && total > 0 {
					bar.totalBytes = total
				}
				bar.Update(downloaded)
				if origOnProgress != nil {
					origOnProgress(downloaded, total)
				}
			}
		}
	}

	var lastErr error
	retryCount := d.RetryCount
	retryDelay := d.RetryDelay
	if retryDelay <= 0 {
		retryDelay = defaultRetryDelay
	}
	if len(opts) > 0 {
		if opts[0].RetryCount > 0 {
			retryCount = opts[0].RetryCount
		}
		if opts[0].RetryDelay > 0 {
			retryDelay = opts[0].RetryDelay
		}
	}

	for i := 0; i <= retryCount; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				if bar != nil {
					bar.Finish()
				}
				return ctx.Err()
			case <-time.After(retryDelay * time.Duration(i)): // Linear backoff: Delay * retry attempt
			}
		}

		err := d.doDownload(ctx, url, destPath, expectedSHA256, activeOpts...)
		if err == nil {
			if bar != nil {
				bar.Finish()
			}
			// Save successful download to cache
			if d.CacheEnabled && !activeOpts[0].SkipCache {
				_ = d.fsys.MkdirAll(cacheDir, 0755)
				keyStr := getCacheKey(url, activeOpts[0].Headers)
				cachePath := filepath.Join(cacheDir, keyStr)
				_ = d.fsys.CopyFile(destPath, cachePath)
			}
			return lifecycle.Emit(ctx, lifecycle.AfterDownload, lifecycle.Details{DownloadPath: destPath})
		}
		lastErr = err
	}
	if bar != nil {
		bar.Finish()
	}
	return fmt.Errorf("download failed after %d attempts: %w", retryCount+1, lastErr)
}

func (d *Downloader) doDownload(ctx context.Context, url string, destPath string, expectedSHA256 string, opts ...DownloadOptions) error {
	timeout := d.Timeout
	if len(opts) > 0 && opts[0].Timeout > 0 {
		timeout = opts[0].Timeout
	}
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	localSize, err := d.partialDownloadSize(destPath)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("creating http request: %w", err)
	}

	if len(opts) > 0 && opts[0].Headers != nil {
		for k, v := range opts[0].Headers {
			req.Header.Set(k, v)
		}
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "dotfiles-installer/1.0")
	}

	if localSize > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", localSize))
	}

	resp, err := d.requestClient(opts...).Do(req)
	if err != nil {
		return fmt.Errorf("executing download request: %w", err)
	}
	defer resp.Body.Close()

	var totalBytes int64 = resp.ContentLength
	var downloadedBytes int64 = 0

	switch resp.StatusCode {
	case http.StatusPartialContent: // 206
		totalBytes += localSize
		downloadedBytes = localSize

		f, err := d.fsys.OpenFile(destPath, os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return fmt.Errorf("opening partial download for append: %w", err)
		}

		var writer io.Writer = f
		if len(opts) > 0 && opts[0].OnProgress != nil {
			writer = &progressWriter{
				writer:     f,
				onProgress: opts[0].OnProgress,
				total:      totalBytes,
				downloaded: downloadedBytes,
			}
		}

		if _, err := io.Copy(writer, resp.Body); err != nil {
			f.Close()
			return fmt.Errorf("writing partial stream to file: %w", err)
		}
		f.Close()

	case http.StatusOK: // 200
		f, err := d.fsys.Create(destPath)
		if err != nil {
			return fmt.Errorf("creating download file: %w", err)
		}

		var writer io.Writer = f
		if len(opts) > 0 && opts[0].OnProgress != nil {
			writer = &progressWriter{
				writer:     f,
				onProgress: opts[0].OnProgress,
				total:      totalBytes,
				downloaded: downloadedBytes,
			}
		}

		if _, err := io.Copy(writer, resp.Body); err != nil {
			f.Close()
			return fmt.Errorf("writing full stream to file: %w", err)
		}
		f.Close()

	case http.StatusRequestedRangeNotSatisfiable: // 416
		// File on disk is equal to or larger than remote file, or range is invalid.
		if expectedSHA256 != "" {
			ok, err := d.verifyHash(destPath, expectedSHA256)
			if err == nil && ok {
				return nil
			}
		}
		// Otherwise, start over from scratch to ensure a clean download.
		cleanReq, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return fmt.Errorf("creating recovery request: %w", err)
		}

		if len(opts) > 0 && opts[0].Headers != nil {
			for k, v := range opts[0].Headers {
				cleanReq.Header.Set(k, v)
			}
		}
		if cleanReq.Header.Get("User-Agent") == "" {
			cleanReq.Header.Set("User-Agent", "dotfiles-installer/1.0")
		}

		cleanResp, err := d.requestClient(opts...).Do(cleanReq)
		if err != nil {
			return fmt.Errorf("executing recovery request: %w", err)
		}
		defer cleanResp.Body.Close()

		if cleanResp.StatusCode != http.StatusOK {
			return fmt.Errorf("recovery download failed with status %d", cleanResp.StatusCode)
		}

		f, err := d.fsys.Create(destPath)
		if err != nil {
			return fmt.Errorf("creating recovery file: %w", err)
		}

		var writer io.Writer = f
		if len(opts) > 0 && opts[0].OnProgress != nil {
			writer = &progressWriter{
				writer:     f,
				onProgress: opts[0].OnProgress,
				total:      cleanResp.ContentLength,
				downloaded: 0,
			}
		}

		if _, err := io.Copy(writer, cleanResp.Body); err != nil {
			f.Close()
			return fmt.Errorf("writing recovery stream to file: %w", err)
		}
		f.Close()

	default:
		return &StatusError{StatusCode: resp.StatusCode, Status: resp.Status}
	}

	// Verify SHA256 signature if specified
	if expectedSHA256 != "" {
		ok, err := d.verifyHash(destPath, expectedSHA256)
		if err != nil || !ok {
			_ = d.fsys.Remove(destPath)
			if err != nil {
				return fmt.Errorf("hash calculation failed: %w", err)
			}
			return fmt.Errorf("checksum mismatch: expected SHA256 hash %q", expectedSHA256)
		}
	}

	return nil
}

// partialDownloadSize reports how many bytes of an interrupted earlier download are
// already at destPath, so the request can resume after them. No file means nothing
// to resume.
func (d *Downloader) partialDownloadSize(destPath string) (int64, error) {
	info, err := d.fsys.Stat(destPath)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("checking partial download size: %w", err)
	}
	return info.Size(), nil
}

type progressWriter struct {
	writer     io.Writer
	onProgress func(bytesDownloaded int64, totalBytes int64)
	total      int64
	downloaded int64
}

func (pw *progressWriter) Write(p []byte) (n int, err error) {
	n, err = pw.writer.Write(p)
	if err == nil && pw.onProgress != nil {
		pw.downloaded += int64(n)
		pw.onProgress(pw.downloaded, pw.total)
	}
	return n, err
}

// verifyHash calculates SHA256 of the file content in a streaming fashion.
func (d *Downloader) verifyHash(path string, expected string) (bool, error) {
	rc, err := d.fsys.Open(path)
	if err != nil {
		return false, err
	}
	defer rc.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, rc); err != nil {
		return false, err
	}

	actual := hex.EncodeToString(hasher.Sum(nil))
	return strings.EqualFold(actual, strings.TrimSpace(expected)), nil
}
