package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

const defaultPyPIBaseURL = "https://pypi.org"

var defaultHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
}

// UvInstaller installs Python CLI tools using uv in isolated environments.
type UvInstaller struct {
	runner     exec.CommandRunner
	fsys       fs.FS
	sysCtx     *SystemContext
	log        *logger.Logger
	httpClient *http.Client
	BinDir     string // Staging destination directory
	PyPIURL    string // Optional PyPI base URL for update checks; empty defaults to https://pypi.org
}

// NewUvInstaller creates a new UvInstaller.
func NewUvInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *UvInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &UvInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

// Name returns the installer method name.
func (u *UvInstaller) Name() string {
	return "uv"
}

// SupportsSudo reports whether uv supports sudo elevation (always false).
func (u *UvInstaller) SupportsSudo() bool {
	return false
}

// SetSystemContext sets the target system context.
func (u *UvInstaller) SetSystemContext(sysCtx *SystemContext) {
	u.sysCtx = sysCtx
}

// SetFS sets the filesystem abstraction.
func (u *UvInstaller) SetFS(fsys fs.FS) {
	u.fsys = fsys
}

// SetLogger sets the logger.
func (u *UvInstaller) SetLogger(log *logger.Logger) {
	u.log = log
}

// SetHTTPClient sets the HTTP client used for update checks.
func (u *UvInstaller) SetHTTPClient(client *http.Client) {
	u.httpClient = client
}

func (u *UvInstaller) client() *http.Client {
	if u.httpClient != nil {
		return u.httpClient
	}
	return defaultHTTPClient
}

// Install runs `uv tool install` with isolated launcher bin directory.
func (u *UvInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(u, tool); err != nil {
		return nil, err
	}
	if config.IsDryRunEnabled(ctx) {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}

	pkgName := uvPackageName(tool)
	python := getStringParam(tool.InstallParams, "python", "")
	force := getBoolParam(tool.InstallParams, "force", false) || config.IsForceEnabled(ctx)
	withDeps := getStringSliceParam(tool.InstallParams, "with")
	version := tool.RequestedVersion()

	packageSpec := buildPackageSpec(pkgName, version)

	args := []string{"tool", "install"}
	if python != "" {
		args = append(args, "--python", python)
	}
	for _, dep := range withDeps {
		if dep != "" {
			args = append(args, "--with", dep)
		}
	}
	if force {
		args = append(args, "--force")
	}
	args = append(args, packageSpec)

	var outputBuf bytes.Buffer
	var writer io.Writer = &outputBuf
	var lw *logger.LineWriter

	if u.log != nil {
		lw = logger.NewLineWriter(u.log.WithTag(tool.Name), "|")
		u.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ uv %s", strings.Join(args, " "))))
		writer = io.MultiWriter(lw, &outputBuf)
		defer lw.Flush()
	}

	cmd := u.runner.CommandContext(ctx, "uv", args...)
	if u.BinDir != "" {
		cmd.SetEnv(append(os.Environ(), "UV_TOOL_BIN_DIR="+u.BinDir))
	}
	cmd.SetStdout(writer)
	cmd.SetStderr(writer)

	if err := cmd.Run(); err != nil {
		if lw != nil {
			lw.PrintError(err)
		}
		return nil, fmt.Errorf("uv tool install %s: %w", pkgName, err)
	}

	// Detect installed version
	detectedVersion := u.detectInstalledVersion(ctx, pkgName, tool, outputBuf.String())

	// Promote/verify staged binaries
	var promotedBinaries []string
	if u.BinDir != "" {
		promoted, err := PromoteBinaries(u.fsys, u.BinDir, tool.Name, tool.Binaries, KeepOutsideLinks)
		if err != nil {
			return nil, err
		}
		promotedBinaries = promoted
	} else {
		promotedBinaries = GetBinaryNames(tool.Name, tool.Binaries)
	}

	return &InstallResult{
		Binaries: promotedBinaries,
		Version:  detectedVersion,
	}, nil
}

// Uninstall runs `uv tool uninstall <package>`.
func (u *UvInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	pkgName := strings.Split(uvPackageName(tool), "[")[0]
	args := []string{"tool", "uninstall", pkgName}

	if u.log != nil {
		u.log.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf("$ uv %s", strings.Join(args, " "))))
	}

	cmd := u.runner.CommandContext(ctx, "uv", args...)
	var lw *logger.LineWriter
	if u.log != nil {
		lw = logger.NewLineWriter(u.log.WithTag(tool.Name), "|")
		cmd.SetStdout(lw)
		cmd.SetStderr(lw)
		defer lw.Flush()
	}

	if err := cmd.Run(); err != nil {
		if lw != nil {
			lw.PrintError(err)
		}
		return fmt.Errorf("uv tool uninstall %s: %w", pkgName, err)
	}
	return nil
}

// CheckUpdate queries PyPI JSON API to discover the latest published version.
func (u *UvInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	pkgName := uvPackageName(tool)
	pypiPkg := normalizePyPIName(pkgName)

	baseURL := defaultPyPIBaseURL
	if u.PyPIURL != "" {
		baseURL = strings.TrimRight(u.PyPIURL, "/")
	} else if env := os.Getenv("DOTFILES_PYPI_URL"); env != "" {
		baseURL = strings.TrimRight(env, "/")
	}

	endpoint := fmt.Sprintf("%s/pypi/%s/json", baseURL, url.PathEscape(pypiPkg))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("creating PyPI request for %s: %w", pkgName, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "dotfiles")

	resp, err := u.client().Do(req)
	if err != nil {
		return nil, fmt.Errorf("querying PyPI for %s: %w", pkgName, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("package %q not found on PyPI", pkgName)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("querying PyPI for %s: unexpected status %d", pkgName, resp.StatusCode)
	}

	var payload struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decoding PyPI response for %s: %w", pkgName, err)
	}
	if payload.Info.Version == "" {
		return nil, fmt.Errorf("PyPI response for %s contained no version", pkgName)
	}

	return &UpdateCheckResult{
		LatestVersion: payload.Info.Version,
	}, nil
}

func (u *UvInstaller) detectInstalledVersion(ctx context.Context, pkgName string, tool *config.ToolConfig, installOutput string) string {
	// 1. Try `uv tool list`
	listCmd := u.runner.CommandContext(ctx, "uv", "tool", "list")
	if out, err := listCmd.Output(); err == nil {
		if v := parseUvToolListVersion(string(out), pkgName); v != "" {
			return v
		}
	}

	// 2. Try parsing from install command output
	if v := parseUvInstallOutputVersion(installOutput, pkgName); v != "" {
		return v
	}

	// 3. Fall back to exact requested version if specified without operators
	req := tool.RequestedVersion()
	if req != "" && req != "latest" && !hasVersionOperator(req) {
		return strings.TrimPrefix(req, "v")
	}

	return ""
}

func buildPackageSpec(pkgName, version string) string {
	if version == "" || version == "latest" {
		return pkgName
	}
	if hasVersionOperator(version) {
		return pkgName + version
	}
	return fmt.Sprintf("%s==%s", pkgName, strings.TrimPrefix(version, "v"))
}

func hasVersionOperator(v string) bool {
	return strings.HasPrefix(v, "==") ||
		strings.HasPrefix(v, ">=") ||
		strings.HasPrefix(v, "<=") ||
		strings.HasPrefix(v, "!=") ||
		strings.HasPrefix(v, "~=") ||
		strings.HasPrefix(v, ">") ||
		strings.HasPrefix(v, "<") ||
		strings.HasPrefix(v, "===")
}

func uvPackageName(tool *config.ToolConfig) string {
	pkg := getStringParam(tool.InstallParams, "package", tool.Name)
	if pkg == "" {
		return tool.Name
	}
	return pkg
}

func normalizePyPIName(name string) string {
	base := strings.Split(name, "[")[0]
	r := strings.NewReplacer("_", "-", ".", "-")
	return r.Replace(strings.ToLower(base))
}

func parseUvToolListVersion(output, pkgName string) string {
	pkgNormalized := normalizePyPIName(pkgName)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "-") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 && normalizePyPIName(fields[0]) == pkgNormalized {
			v := strings.Trim(fields[1], "()")
			v = strings.TrimPrefix(v, "v")
			return v
		}
	}
	return ""
}

func parseUvInstallOutputVersion(output, pkgName string) string {
	pkgNormalized := normalizePyPIName(pkgName)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "+") {
			spec := strings.TrimSpace(strings.TrimPrefix(line, "+"))
			if idx := strings.Index(spec, "=="); idx != -1 {
				name := strings.TrimSpace(spec[:idx])
				if normalizePyPIName(name) == pkgNormalized {
					fields := strings.Fields(strings.TrimSpace(spec[idx+2:]))
					if len(fields) > 0 {
						return strings.TrimPrefix(fields[0], "v")
					}
				}
			}
		}
	}
	return ""
}

func init() {
	_ = Register(&UvInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
