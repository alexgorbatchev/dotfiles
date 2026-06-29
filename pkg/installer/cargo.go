package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type CargoInstaller struct {
	log         *logger.Logger
	runner      exec.CommandRunner
	fsys        fs.FS
	dl          *downloader.Downloader
	extractor   *archive.Extractor
	sysCtx      *SystemContext
	httpClient  *http.Client
	BinDir      string // Optional destination directory
	BaseURL     string // Override for testing quickinstall download
	CratesIOURL string // Override for testing crates.io API
}

func NewCargoInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CargoInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	extractor := archive.NewExtractor(fsys, runner)
	return &CargoInstaller{
		runner:    runner,
		fsys:      fsys,
		dl:        dl,
		extractor: extractor,
		sysCtx:    sysCtx,
	}
}

func (c *CargoInstaller) Name() string {
	return "cargo"
}

func (c *CargoInstaller) SetFS(fsys fs.FS) {
	c.fsys = fsys
	if c.dl != nil {
		c.dl.SetFS(fsys)
	}
	if c.extractor != nil {
		c.extractor.SetFS(fsys)
	}
}

func (c *CargoInstaller) SetLogger(log *logger.Logger) {
	c.log = log
}

func (c *CargoInstaller) SupportsSudo() bool {
	return false
}

func (c *CargoInstaller) tryQuickinstall(ctx context.Context, tool *config.ToolConfig, crateName string, version string) (*InstallResult, error) {
	sysCtx := c.sysCtx
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}

	var platform string
	switch sysCtx.OS {
	case "darwin":
		platform = "apple-darwin"
	case "linux":
		platform = "unknown-linux-gnu"
	case "windows":
		platform = "pc-windows-msvc"
	default:
		return nil, fmt.Errorf("unsupported OS for quickinstall: %s", sysCtx.OS)
	}

	var arch string
	switch sysCtx.Arch {
	case "amd64":
		arch = "x86_64"
	case "arm64":
		arch = "aarch64"
	default:
		return nil, fmt.Errorf("unsupported arch for quickinstall: %s", sysCtx.Arch)
	}

	cratesIOURL := "https://crates.io/api/v1/crates"
	if c.CratesIOURL != "" {
		cratesIOURL = c.CratesIOURL
	}

	if version == "" || version == "latest" {
		req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/%s", cratesIOURL, crateName), nil)
		if err != nil {
			return nil, fmt.Errorf("creating request to crates.io: %w", err)
		}
		req.Header.Set("User-Agent", "dotfiles-installer (github.com/alexgorbatchev/dotfiles)")

		client := c.httpClient
		if client == nil {
			client = http.DefaultClient
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetching from crates.io: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("crates.io returned status: %d", resp.StatusCode)
		}

		var apiResp struct {
			Crate struct {
				MaxVersion string `json:"max_version"`
			} `json:"crate"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			return nil, fmt.Errorf("decoding crates.io response: %w", err)
		}
		if apiResp.Crate.MaxVersion == "" {
			return nil, fmt.Errorf("crates.io returned empty max_version")
		}
		version = apiResp.Crate.MaxVersion
	}

	baseURL := "https://github.com/cargo-bins/cargo-quickinstall/releases/download"
	if c.BaseURL != "" {
		baseURL = c.BaseURL
	}

	url := fmt.Sprintf("%s/%s-%s/%s-%s-%s-%s.tar.gz",
		baseURL, crateName, version, crateName, version, arch, platform)

	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	archivePath := filepath.Join(destDir, tool.Name+"-quickinstall.tar.gz")
	sha256 := getStringParam(tool.InstallParams, "sha256", "")

	if err := c.dl.Download(ctx, url, archivePath, sha256); err != nil {
		return nil, fmt.Errorf("downloading quickinstall archive: %w", err)
	}

	if err := c.extractor.Extract(ctx, archivePath, destDir); err != nil {
		_ = c.fsys.Remove(archivePath)
		return nil, fmt.Errorf("extracting quickinstall archive: %w", err)
	}

	_ = c.fsys.Remove(archivePath)

	promotedBinaries, err := PromoteBinaries(c.fsys, destDir, tool.Name, tool.Binaries)
	if err != nil {
		return nil, fmt.Errorf("promoting binaries for quickinstall: %w", err)
	}

	return &InstallResult{
		Binaries: promotedBinaries,
	}, nil
}

func (c *CargoInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	version := ""
	if tool.Version != nil {
		version = *tool.Version
	}

	binarySource := getStringParam(tool.InstallParams, "binarySource", "cargo-quickinstall")

	if binarySource == "cargo-quickinstall" && c.dl != nil && c.extractor != nil {
		res, err := c.tryQuickinstall(ctx, tool, crateName, version)
		if err == nil {
			return res, nil
		}
		if c.log != nil {
			c.log.Warn("cargo-quickinstall failed, falling back to local compilation", "error", err)
		}
	}

	args := []string{"install"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}

	if version != "" && version != "latest" {
		args = append(args, "--version", version)
	}

	args = append(args, crateName)

	cmd := c.runner.CommandContext(ctx, "cargo", args...)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("cargo install %s: %w", crateName, err)
	}

	promotedBinaries, err := PromoteBinaries(c.fsys, c.BinDir, tool.Name, tool.Binaries)
	if err != nil {
		return nil, err
	}

	return &InstallResult{
		Binaries: promotedBinaries,
	}, nil
}

func (c *CargoInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	crateName := getStringParam(tool.InstallParams, "crateName", tool.Name)
	args := []string{"uninstall"}
	if c.BinDir != "" {
		args = append(args, "--root", c.BinDir)
	}
	args = append(args, crateName)

	cmd := c.runner.CommandContext(ctx, "cargo", args...)
	return cmd.Run()
}

func (c *CargoInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	// For cargo we can simulate a basic update check or parse crates.io,
	// but a clean default behaves beautifully
	return &UpdateCheckResult{
		HasUpdate:     false,
		LatestVersion: "latest",
	}, nil
}

func init() {
	_ = Register(&CargoInstaller{
		runner:    exec.NewOSRunner(),
		fsys:      &fs.OSFS{},
		dl:        downloader.NewDownloader(&fs.OSFS{}, nil),
		extractor: archive.NewExtractor(&fs.OSFS{}, exec.NewOSRunner()),
	})
}
