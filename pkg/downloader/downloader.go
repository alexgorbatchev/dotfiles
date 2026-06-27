package downloader

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"context"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// DownloadOptions configure the download process.
type DownloadOptions struct {
	Headers    map[string]string
	Timeout    time.Duration
	RetryCount int
	RetryDelay time.Duration
	OnProgress func(bytesDownloaded int64, totalBytes int64)
	SkipCache  bool
}

// Downloader manages file downloads with optional resumption support and SHA256 integrity checks.
type Downloader struct {
	fsys         fs.FS
	client       *http.Client
	CacheDir     string
	CacheEnabled bool
	CacheTTL     time.Duration
}

// NewDownloader creates a new Downloader using the provided filesystem and HTTP client.
func NewDownloader(fsys fs.FS, client *http.Client) *Downloader {
	if client == nil {
		client = &http.Client{}
	}
	return &Downloader{
		fsys:   fsys,
		client: client,
	}
}

func (d *Downloader) SetFS(fsys fs.FS) {
	if d != nil {
		d.fsys = fsys
	}
}

// Download fetches a file from url and saves it to destPath, supporting options and retries with backoff.
func (d *Downloader) Download(ctx context.Context, url string, destPath string, expectedSHA256 string, opts ...DownloadOptions) error {
	var activeOpts []DownloadOptions
	if len(opts) > 0 {
		activeOpts = append(activeOpts, opts[0])
	} else {
		activeOpts = []DownloadOptions{{}}
	}

	// 1. Handle Caching Check (if enabled)
	if d.CacheEnabled && !activeOpts[0].SkipCache {
		if d.CacheDir == "" {
			d.CacheDir = filepath.Join(".generated", "cache")
		}
		cacheKey := sha256.Sum256([]byte(url))
		keyStr := hex.EncodeToString(cacheKey[:])
		cachePath := filepath.Join(d.CacheDir, keyStr)

		exists, err := d.fsys.Exists(cachePath)
		if err == nil && exists {
			info, err := d.fsys.Stat(cachePath)
			if err == nil {
				ttl := d.CacheTTL
				if ttl <= 0 {
					ttl = 24 * time.Hour
				}
				if time.Since(info.ModTime()) < ttl {
					// Cache hit! Copy the cached file to destPath and trigger progress update
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

	// 2. Set up default progress bar if OnProgress is nil
	var bar *ProgressBar
	if activeOpts[0].OnProgress == nil {
		filename := filepath.Base(destPath)
		bar = NewProgressBar(0, filename)
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

	var lastErr error
	retryCount := 0
	retryDelay := time.Second
	if len(opts) > 0 {
		retryCount = opts[0].RetryCount
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
				_ = d.fsys.MkdirAll(d.CacheDir, 0755)
				cacheKey := sha256.Sum256([]byte(url))
				keyStr := hex.EncodeToString(cacheKey[:])
				cachePath := filepath.Join(d.CacheDir, keyStr)
				_ = d.fsys.CopyFile(destPath, cachePath)
			}
			return nil
		}
		lastErr = err
	}
	if bar != nil {
		bar.Finish()
	}
	return fmt.Errorf("download failed after %d attempts: %w", retryCount+1, lastErr)
}

func (d *Downloader) doDownload(ctx context.Context, url string, destPath string, expectedSHA256 string, opts ...DownloadOptions) error {
	var timeout time.Duration
	if len(opts) > 0 {
		timeout = opts[0].Timeout
	}
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	// Check if file exists to compute offset for range requests
	exists, err := d.fsys.Exists(destPath)
	if err != nil {
		return fmt.Errorf("checking file existence: %w", err)
	}

	var localSize int
	if exists {
		rc, err := d.fsys.Open(destPath)
		if err != nil {
			return fmt.Errorf("opening file to check size: %w", err)
		}

		if stater, ok := rc.(interface{ Stat() (os.FileInfo, error) }); ok {
			info, err := stater.Stat()
			if err != nil {
				rc.Close()
				return fmt.Errorf("stating file: %w", err)
			}
			localSize = int(info.Size())
		} else if seeker, ok := rc.(io.Seeker); ok {
			size, err := seeker.Seek(0, io.SeekEnd)
			if err != nil {
				rc.Close()
				return fmt.Errorf("seeking file end: %w", err)
			}
			localSize = int(size)
		} else {
			// Fallback: read all (only for mocks/fakes that don't support Stat/Seek)
			data, err := io.ReadAll(rc)
			if err != nil {
				rc.Close()
				return fmt.Errorf("reading file fallback: %w", err)
			}
			localSize = len(data)
		}
		rc.Close()
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

	if localSize > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", localSize))
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("executing download request: %w", err)
	}
	defer resp.Body.Close()

	var totalBytes int64 = resp.ContentLength
	var downloadedBytes int64 = 0

	switch resp.StatusCode {
	case http.StatusPartialContent: // 206
		totalBytes += int64(localSize)
		downloadedBytes = int64(localSize)

		// Stream directly using the filesystem's OpenFile implementation in append mode
		f, err := d.fsys.OpenFile(destPath, os.O_WRONLY|os.O_APPEND, 0644)
		if err == nil {
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
		} else {
			// Fallback for custom/mock filesystems in tests (tiny payloads)
			existingData, err := d.fsys.ReadFile(destPath)
			if err != nil {
				return fmt.Errorf("reading existing download file for fallback: %w", err)
			}
			bodyBytes, err := io.ReadAll(resp.Body)
			if err != nil {
				return fmt.Errorf("reading partial body: %w", err)
			}
			combined := append(existingData, bodyBytes...)
			if err := d.fsys.WriteFile(destPath, combined, 0644); err != nil {
				return fmt.Errorf("writing fallback data: %w", err)
			}

			if len(opts) > 0 && opts[0].OnProgress != nil {
				opts[0].OnProgress(int64(len(combined)), totalBytes)
			}
		}

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

		cleanResp, err := d.client.Do(cleanReq)
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
		return fmt.Errorf("download failed with status %d: %s", resp.StatusCode, resp.Status)
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
