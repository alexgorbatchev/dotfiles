package installer

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type CurlTarInstaller struct {
	log       *logger.Logger
	runner    exec.CommandRunner
	fsys      fs.FS
	dl        *downloader.Downloader
	extractor *archive.Extractor
	sysCtx    *SystemContext
	BinDir    string // Destination directory for binaries
}

func NewCurlTarInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CurlTarInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &CurlTarInstaller{
		runner:    runner,
		fsys:      fsys,
		dl:        dl,
		extractor: extractor,
		sysCtx:    sysCtx,
	}
}

func (c *CurlTarInstaller) Name() string {
	return "curl-tar"
}

func (c *CurlTarInstaller) SetFS(fsys fs.FS) {
	c.fsys = fsys
	if c.dl != nil {
		c.dl.SetFS(fsys)
	}
	if c.extractor != nil {
		c.extractor.SetFS(fsys)
	}
}

func (c *CurlTarInstaller) SetLogger(log *logger.Logger) {
	c.log = log
}

func (c *CurlTarInstaller) SupportsSudo() bool {
	return false
}

func detectArchiveExtension(ctx context.Context, url string, client *http.Client) string {
	// 1. Try URL suffix first (fast & no network overhead)
	lowerURL := strings.ToLower(url)
	for _, suffix := range []string{".tar.gz", ".tar.xz", ".tar.bz2", ".tgz", ".txz", ".tbz2", ".zip", ".tar"} {
		if strings.HasSuffix(lowerURL, suffix) {
			return suffix
		}
	}

	// Try checking for standard file extension at the end of path (before query params)
	cleanURL := url
	if idx := strings.Index(cleanURL, "?"); idx != -1 {
		cleanURL = cleanURL[:idx]
	}
	if idx := strings.Index(cleanURL, "#"); idx != -1 {
		cleanURL = cleanURL[:idx]
	}
	lowerClean := strings.ToLower(cleanURL)
	for _, suffix := range []string{".tar.gz", ".tar.xz", ".tar.bz2", ".tgz", ".txz", ".tbz2", ".zip", ".tar"} {
		if strings.HasSuffix(lowerClean, suffix) {
			return suffix
		}
	}
	if idx := strings.LastIndex(lowerClean, "."); idx != -1 {
		dotExt := lowerClean[idx:]
		if !strings.Contains(dotExt, "/") && len(dotExt) <= 6 {
			return dotExt
		}
	}

	// 2. Fallback: try HTTP HEAD request to check Content-Type or Content-Disposition
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, "HEAD", url, nil)
	if err == nil {
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				// Check Content-Disposition
				cd := resp.Header.Get("Content-Disposition")
				if cd != "" {
					if idx := strings.Index(strings.ToLower(cd), "filename="); idx != -1 {
						filename := cd[idx+9:]
						filename = strings.Trim(filename, `";`)
						for _, suffix := range []string{".tar.gz", ".tar.xz", ".tar.bz2", ".tgz", ".txz", ".tbz2", ".zip", ".tar"} {
							if strings.HasSuffix(strings.ToLower(filename), suffix) {
								return suffix
							}
						}
					}
				}
				// Check Content-Type
				ct := strings.ToLower(resp.Header.Get("Content-Type"))
				if strings.Contains(ct, "x-gzip") || strings.Contains(ct, "gzip") {
					return ".tar.gz"
				}
				if strings.Contains(ct, "zip") {
					return ".zip"
				}
				if strings.Contains(ct, "x-xz") || strings.Contains(ct, "xz") {
					return ".tar.xz"
				}
				if strings.Contains(ct, "x-bzip2") || strings.Contains(ct, "bzip2") {
					return ".tar.bz2"
				}
			}
		}
	}

	return ".tar.gz" // default fallback
}

func (c *CurlTarInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	url := getStringParam(tool.InstallParams, "url", "")
	if url == "" {
		return nil, fmt.Errorf("URL not specified in installParams")
	}

	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	ext := detectArchiveExtension(ctx, url, nil)
	archivePath := filepath.Join(destDir, tool.Name+ext)
	sha256 := getStringParam(tool.InstallParams, "sha256", "")

	if err := c.dl.Download(ctx, url, archivePath, sha256); err != nil {
		return nil, fmt.Errorf("downloading archive: %w", err)
	}

	// Extract downloaded archive
	if err := c.extractor.Extract(ctx, archivePath, destDir); err != nil {
		_ = c.fsys.Remove(archivePath)
		return nil, fmt.Errorf("extracting archive: %w", err)
	}

	// Remove downloaded archive
	_ = c.fsys.Remove(archivePath)

	promotedBinaries, err := PromoteBinaries(c.fsys, destDir, tool.Name, tool.Binaries)
	if err != nil {
		return nil, err
	}

	return &InstallResult{
		Binaries: promotedBinaries,
	}, nil
}

func (c *CurlTarInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := c.BinDir
	if destDir != "" {
		destPath := filepath.Join(destDir, tool.Name)
		return c.fsys.Remove(destPath)
	}
	return nil
}

func (c *CurlTarInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&CurlTarInstaller{
		runner:    exec.NewOSRunner(),
		fsys:      &fs.OSFS{},
		dl:        downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor: archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
	})
}
