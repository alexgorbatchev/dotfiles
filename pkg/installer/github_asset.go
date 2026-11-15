package installer

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

type githubAssetRequest struct {
	repo, tag, destDir, token string
	asset                     githubAsset
	viaGhCLI                  bool
}

// downloadAsset applies the same authentication and integrity checks to every
// installer consuming GitHub release assets, before any payload is unpacked.
func (c githubReleaseClient) downloadAsset(ctx context.Context, req githubAssetRequest, fsys fs.FS, dl *downloader.Downloader) error {
	assetPath := filepath.Join(req.destDir, req.asset.Name)
	expectedSHA256 := parseAssetDigest(req.asset.Digest)
	if req.viaGhCLI {
		if err := c.downloadAssetViaGhCli(ctx, req.repo, req.tag, req.asset.Name, req.destDir); err != nil {
			return fmt.Errorf("downloading release asset via gh CLI: %w", err)
		}
	} else if err := c.downloadAssetHTTP(ctx, req, dl, assetPath, expectedSHA256); err != nil {
		return fmt.Errorf("downloading release asset %s: %w", req.asset.Name, err)
	}

	var err error
	if expectedSHA256 != "" {
		// The HTTP downloader has already verified the hash before caching or
		// emitting after-download. gh writes the file itself, so verify it here.
		if req.viaGhCLI {
			err = verifyFileSHA256(fsys, assetPath, expectedSHA256)
		}
	} else if req.asset.Size > 0 {
		err = verifyFileSize(fsys, assetPath, req.asset.Size)
	}
	if err != nil {
		_ = fsys.Remove(assetPath)
		return fmt.Errorf("verifying release asset %s: %w", req.asset.Name, err)
	}
	return nil
}

func (c githubReleaseClient) downloadAssetHTTP(ctx context.Context, req githubAssetRequest, dl *downloader.Downloader, destPath, expectedSHA256 string) error {
	opts := downloader.DownloadOptions{
		Headers:           map[string]string{"User-Agent": c.agent()},
		HostScopedHeaders: true,
	}
	// Metadata may point straight to another host. Only the configured API
	// origin may receive its token, even before the first redirect.
	if sameOrigin(c.apiBaseURL(), req.asset.BrowserDownloadURL) && req.token != "" {
		opts.Headers["Authorization"] = githubAuthorization(req.token)
	}
	err := dl.Download(ctx, req.asset.BrowserDownloadURL, destPath, expectedSHA256, opts)
	if err == nil {
		return nil
	}
	var status *downloader.StatusError
	if req.token == "" || req.asset.ID <= 0 || !errors.As(err, &status) {
		return err
	}
	switch status.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound:
		// Private release browser URLs need a browser session. The documented
		// asset endpoint accepts the API token and either streams or redirects.
	default:
		return err
	}
	opts.Headers["Accept"] = "application/octet-stream"
	opts.Headers["Authorization"] = githubAuthorization(req.token)
	assetURL := fmt.Sprintf("%s/repos/%s/releases/assets/%d", c.apiBaseURL(), req.repo, req.asset.ID)
	if err := dl.Download(ctx, assetURL, destPath, expectedSHA256, opts); err != nil {
		return fmt.Errorf("downloading authenticated release asset: %w", err)
	}
	return nil
}

func sameOrigin(a, b string) bool {
	x, err := url.Parse(a)
	if err != nil || x.Host == "" {
		return false
	}
	y, err := url.Parse(b)
	return err == nil && strings.EqualFold(x.Scheme, y.Scheme) && strings.EqualFold(x.Host, y.Host)
}
