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
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
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

// defaultCacheTTL is how long a cached download is served when nothing sets CacheTTL.
const defaultCacheTTL = 30 * 24 * time.Hour

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
	// log reports what the download cache does on its own: evicting an entry that
	// no longer matches its record, or failing to store one. Nil logs nothing.
	log *logger.Logger
}

// SetLogger sets the logger the download cache reports evictions and failed stores
// through.
func (d *Downloader) SetLogger(log *logger.Logger) {
	if d != nil {
		d.log = log
	}
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
		CacheTTL:     defaultCacheTTL,
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

	cachePath := filepath.Join(cacheDir, getCacheKey(url, activeOpts[0].Headers))

	if d.CacheEnabled && !skipCache {
		ttl := d.CacheTTL
		if ttl <= 0 {
			ttl = defaultCacheTTL
		}
		size, ok, err := d.serveFromCache(cachePath, url, destPath, expectedSHA256, ttl)
		if err != nil {
			return err
		}
		if ok {
			if activeOpts[0].OnProgress != nil {
				activeOpts[0].OnProgress(0, size)
				activeOpts[0].OnProgress(size, size)
			}
			return nil
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
			// A download that cannot be cached is still a download: the failed store
			// leaves nothing behind that a later run would serve.
			if d.CacheEnabled && !activeOpts[0].SkipCache {
				if err := d.storeInCache(cacheDir, cachePath, url, destPath); err != nil {
					d.warn(logger.Message(fmt.Sprintf("Could not cache download of %s: %v", url, err)))
				}
			}
			return lifecycle.Emit(ctx, lifecycle.AfterDownload, lifecycle.Details{DownloadPath: destPath})
		}
		lastErr = err
		var unresumable *unresumableError
		if errors.As(err, &unresumable) {
			// Another attempt would resume onto a file that cannot be trusted.
			retryCount = i
			break
		}
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
		if err := d.writeDownload(destPath, withProgress(f, opts, totalBytes, downloadedBytes), resp.Body); err != nil {
			return fmt.Errorf("writing partial stream to %q: %w", destPath, err)
		}

	case http.StatusOK: // 200
		f, err := d.fsys.Create(destPath)
		if err != nil {
			return fmt.Errorf("creating download file: %w", err)
		}
		if err := d.writeDownload(destPath, withProgress(f, opts, totalBytes, downloadedBytes), resp.Body); err != nil {
			return fmt.Errorf("writing full stream to %q: %w", destPath, err)
		}

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
		if err := d.writeDownload(destPath, withProgress(f, opts, cleanResp.ContentLength, 0), cleanResp.Body); err != nil {
			return fmt.Errorf("writing recovery stream to %q: %w", destPath, err)
		}

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

// unresumableError is a failed attempt that left behind a file the next attempt would
// resume onto but whose contents cannot be trusted, so Download does not retry it.
type unresumableError struct{ err error }

func (e *unresumableError) Error() string { return e.err.Error() }
func (e *unresumableError) Unwrap() error { return e.err }

// writeDownload streams body into w, the file open at destPath, and closes it. A
// stream that stops part way leaves the bytes written so far for the next attempt to
// resume after, but a file whose close failed holds contents nobody can vouch for, so
// it is removed: the next attempt downloads it anew instead of resuming onto it. When
// it is still there after the removal, the attempt is reported as unresumableError.
// Whether the file is gone decides it, not what Remove returned: a Remove that finds
// nothing, or that deletes the file and then fails to record it (TrackedFileSystem),
// leaves nothing to resume onto.
func (d *Downloader) writeDownload(destPath string, w io.WriteCloser, body io.Reader) error {
	err := fs.WriteAndClose(w, body)
	if !errors.Is(err, fs.ErrClose) {
		return err
	}
	rmErr := d.fsys.Remove(destPath)
	if rmErr == nil || errors.Is(rmErr, os.ErrNotExist) {
		return err
	}
	exists, existsErr := d.fsys.Exists(destPath)
	if existsErr == nil && !exists {
		return errors.Join(err, fmt.Errorf("removing download whose close failed: %w", rmErr))
	}
	return &unresumableError{errors.Join(err, fmt.Errorf("removing download whose close failed (delete %q before downloading it again): %w", destPath, rmErr))}
}

// withProgress reports the bytes written to f through the OnProgress callback in
// opts, counting from downloaded out of total. Without a callback f is used as is.
func withProgress(f io.WriteCloser, opts []DownloadOptions, total, downloaded int64) io.WriteCloser {
	if len(opts) == 0 || opts[0].OnProgress == nil {
		return f
	}
	return &progressWriter{
		WriteCloser: f,
		onProgress:  opts[0].OnProgress,
		total:       total,
		downloaded:  downloaded,
	}
}

// progressWriter is a file that reports each successful write to onProgress. Close
// closes the file.
type progressWriter struct {
	io.WriteCloser
	onProgress func(bytesDownloaded int64, totalBytes int64)
	total      int64
	downloaded int64
}

func (pw *progressWriter) Write(p []byte) (n int, err error) {
	n, err = pw.WriteCloser.Write(p)
	if err == nil && pw.onProgress != nil {
		pw.downloaded += int64(n)
		pw.onProgress(pw.downloaded, pw.total)
	}
	return n, err
}

// verifyHash reports whether the SHA-256 of the file at path is expected.
func (d *Downloader) verifyHash(path string, expected string) (bool, error) {
	actual, _, err := d.fileDigest(path)
	if err != nil {
		return false, err
	}
	return strings.EqualFold(actual, strings.TrimSpace(expected)), nil
}
