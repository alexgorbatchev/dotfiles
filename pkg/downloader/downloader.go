package downloader

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"context"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// Downloader manages file downloads with optional resumption support and SHA256 integrity checks.
type Downloader struct {
	fsys   fs.FS
	client *http.Client
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

// Download fetches a file from url and saves it to destPath.
// If the destination file already exists, it attempts to resume downloading using HTTP Range requests.
// After the download completes, it optionally verifies the SHA256 signature if expectedSHA256 is provided.
func (d *Downloader) Download(ctx context.Context, url string, destPath string, expectedSHA256 string) error {
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

	if localSize > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", localSize))
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("executing download request: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusPartialContent: // 206
		// If fsys is real OS filesystem, we can stream directly in append mode
		if _, ok := d.fsys.(*fs.OSFS); ok {
			f, err := os.OpenFile(destPath, os.O_WRONLY|os.O_APPEND, 0644)
			if err != nil {
				return fmt.Errorf("opening file for appending: %w", err)
			}
			if _, err := io.Copy(f, resp.Body); err != nil {
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
		}

	case http.StatusOK: // 200
		f, err := d.fsys.Create(destPath)
		if err != nil {
			return fmt.Errorf("creating download file: %w", err)
		}
		if _, err := io.Copy(f, resp.Body); err != nil {
			f.Close()
			return fmt.Errorf("writing full stream to file: %w", err)
		}
		f.Close()

	case http.StatusRequestedRangeNotSatisfiable: // 416
		// File on disk is equal to or larger than remote file, or range is invalid.
		// If expectedSHA256 is set, let's verify if the existing file is correct.
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
		if _, err := io.Copy(f, cleanResp.Body); err != nil {
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
			// Clean up invalid files immediately to prevent broken cache/assets
			_ = d.fsys.Remove(destPath)
			if err != nil {
				return fmt.Errorf("hash calculation failed: %w", err)
			}
			return fmt.Errorf("checksum mismatch: expected SHA256 hash %q", expectedSHA256)
		}
	}

	return nil
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
