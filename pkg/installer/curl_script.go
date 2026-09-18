package installer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

type CurlScriptInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	dl     *downloader.Downloader
	sysCtx *SystemContext
	BinDir string // Target folder for binaries
}

func NewCurlScriptInstaller(runner exec.CommandRunner, fsys fs.FS, dl *downloader.Downloader, sysCtx *SystemContext) *CurlScriptInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	if dl == nil {
		dl = downloader.NewDownloader(fsys, nil)
	}
	return &CurlScriptInstaller{
		runner: runner,
		fsys:   fsys,
		dl:     dl,
		sysCtx: sysCtx,
	}
}

func (c *CurlScriptInstaller) Name() string {
	return "curl-script"
}

func (c *CurlScriptInstaller) SetFS(fsys fs.FS) {
	c.fsys = fsys
	if c.dl != nil {
		c.dl.SetFS(fsys)
	}
}

func (c *CurlScriptInstaller) SetLogger(log *logger.Logger) {
	c.log = log
	if c.dl != nil && log != nil {
		c.dl.SetQuiet(log.Level() == logger.LogLevelQuiet)
	}
}

func (c *CurlScriptInstaller) SetDownloadCache(cacheDir string, ttl time.Duration, enabled bool) {
	ApplyDownloadCacheSettings(c.dl, cacheDir, ttl, enabled)
}

func (c *CurlScriptInstaller) SetHTTPClient(client *http.Client) {
	c.dl.SetHTTPClient(client)
}

func (c *CurlScriptInstaller) SupportsSudo() bool {
	return false
}

func (c *CurlScriptInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	if err := ValidateSudo(c, tool); err != nil {
		return nil, err
	}
	if IsDryRun() {
		return &InstallResult{
			Binaries: GetBinaryNames(tool.Name, tool.Binaries),
		}, nil
	}
	url := getStringParam(tool.InstallParams, "url", "")
	shell := getStringParam(tool.InstallParams, "shell", "sh")
	if url == "" {
		return nil, fmt.Errorf("URL or shell not specified in installParams")
	}

	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := c.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating directory %s: %w", destDir, err)
	}

	scriptPath := filepath.Join(destDir, tool.Name+"-install.sh")
	if err := c.dl.Download(ctx, url, scriptPath, ""); err != nil {
		return nil, fmt.Errorf("downloading script: %w", err)
	}

	// Make script executable
	chmodCmd := c.runner.CommandContext(ctx, "chmod", "+x", scriptPath)
	_ = chmodCmd.Run()

	// Execute script. The arguments and environment are resolved here rather than when
	// the configuration was read, because a resolver is given the script it is about to
	// run and the directory the installation is staging into -- neither of which exists
	// until this point.
	args, err := c.resolveArgs(ctx, tool, scriptPath, destDir)
	if err != nil {
		return nil, err
	}
	envSlice, err := c.resolveEnv(ctx, tool, scriptPath, destDir)
	if err != nil {
		return nil, err
	}

	var runCmd exec.Cmd
	cmdArgs := append([]string{scriptPath}, args...)
	if shell == "bash" {
		runCmd = c.runner.CommandContext(ctx, "bash", cmdArgs...)
	} else {
		runCmd = c.runner.CommandContext(ctx, "sh", cmdArgs...)
	}
	if len(envSlice) > 0 {
		runCmd.SetEnv(append(os.Environ(), envSlice...))
	}

	var writer *logger.LineWriter
	if c.log != nil {
		writer = logger.NewLineWriter(c.log, "|")
		runCmd.SetStdout(writer)
		runCmd.SetStderr(writer)
	} else {
		runCmd.SetStdout(os.Stdout)
		runCmd.SetStderr(os.Stderr)
	}

	if err := runCmd.Run(); err != nil {
		if writer != nil {
			writer.PrintError(err)
		}
		return nil, fmt.Errorf("running install script: %w", err)
	}
	if writer != nil {
		writer.Flush()
	}

	// Clean up script
	_ = c.fsys.Remove(scriptPath)

	promotedBinaries, err := PromoteBinaries(c.fsys, destDir, tool.Name, tool.Binaries)
	if err != nil {
		// If PromoteBinaries failed in destDir, search system binary directories
		sysDirs := getSystemBinaryDirs()
		binNames := GetBinaryNames(tool.Name, tool.Binaries)
		allFound := true
		for _, binName := range binNames {
			targetPath := filepath.Join(destDir, binName)
			exists, existErr := c.fsys.Exists(targetPath)
			if existErr == nil && exists {
				continue
			}

			foundInSys := false
			for _, sysDir := range sysDirs {
				sysPath := filepath.Join(sysDir, binName)
				sysExists, sysErr := c.fsys.Exists(sysPath)
				if sysErr == nil && sysExists {
					_ = c.fsys.MkdirAll(filepath.Dir(targetPath), 0755)
					if copyErr := c.fsys.CopyFile(sysPath, targetPath); copyErr == nil {
						_ = c.fsys.Chmod(targetPath, 0755)
						foundInSys = true
						break
					}
				}
			}
			if !foundInSys {
				allFound = false
				break
			}
		}

		if allFound {
			promotedBinaries = binNames
		} else {
			return nil, err
		}
	}

	var installedVersion string
	versionArgs := getStringSliceParam(tool.InstallParams, "versionArgs")
	versionRegex := getStringParam(tool.InstallParams, "versionRegex", "")
	if len(versionArgs) > 0 && len(promotedBinaries) > 0 {
		mainBinPath := filepath.Join(destDir, promotedBinaries[0])
		if exists, err := c.fsys.Exists(mainBinPath); err == nil && exists {
			v, err := detectVersionViaCli(ctx, c.runner, mainBinPath, versionArgs, versionRegex)
			if err == nil && v != "" {
				installedVersion = v
			}
		}
	}

	return &InstallResult{
		Binaries: promotedBinaries,
		Version:  installedVersion,
	}, nil
}

// resolveArgs produces the arguments the install script is run with.
//
// v1 resolved them at install time with {projectConfig, scriptPath, stagingDir}
// (installFromCurlScript.ts:135-141), so a resolver could point the script at itself or
// at the staging tree. A plain list is used as written, with {stagingDir} substituted,
// which is how the value reaches Go when the author wrote it as a literal built from
// ctx.stagingDir while the configuration was being read.
func (c *CurlScriptInstaller) resolveArgs(ctx context.Context, tool *config.ToolConfig, scriptPath, stagingDir string) ([]string, error) {
	if !vm.HasResolver(tool, "args") {
		return substituteStagingDir(getStringSliceParam(tool.InstallParams, "args"), stagingDir), nil
	}

	value, err := c.resolveParam(ctx, tool, "args", scriptPath, stagingDir)
	if err != nil {
		return nil, err
	}
	var args []string
	if err := json.Unmarshal(value, &args); err != nil {
		return nil, fmt.Errorf("the args resolver of %q produced %s, which is not a list of strings", tool.Name, value)
	}
	return substituteStagingDir(args, stagingDir), nil
}

// resolveEnv produces the environment entries the install script is run with, sorted by
// name so a failing installation is reproducible from its log.
func (c *CurlScriptInstaller) resolveEnv(ctx context.Context, tool *config.ToolConfig, scriptPath, stagingDir string) ([]string, error) {
	envMap := map[string]string{}

	if vm.HasResolver(tool, "env") {
		value, err := c.resolveParam(ctx, tool, "env", scriptPath, stagingDir)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(value, &envMap); err != nil {
			return nil, fmt.Errorf("the env resolver of %q produced %s, which is not a map of strings", tool.Name, value)
		}
	} else if declared, ok := tool.InstallParams["env"].(map[string]any); ok {
		for name, value := range declared {
			if text, ok := value.(string); ok {
				envMap[name] = text
			}
		}
	}

	names := make([]string, 0, len(envMap))
	for name := range envMap {
		names = append(names, name)
	}
	sort.Strings(names)

	entries := make([]string, 0, len(names))
	for _, name := range names {
		entries = append(entries, fmt.Sprintf("%s=%s", name, strings.ReplaceAll(envMap[name], "{stagingDir}", stagingDir)))
	}
	return entries, nil
}

// resolveParam calls back into the tool's configuration file for one parameter.
func (c *CurlScriptInstaller) resolveParam(ctx context.Context, tool *config.ToolConfig, param, scriptPath, stagingDir string) (json.RawMessage, error) {
	return vm.ResolveInstallParam(ctx, vm.ResolveRequest{
		Log:     c.log,
		FS:      c.fsys,
		Runner:  c.runner,
		Tool:    tool,
		ProjCfg: config.GetProjectConfig(ctx),
		Param:   param,
		Context: map[string]any{"scriptPath": scriptPath, "stagingDir": stagingDir},
	})
}

// substituteStagingDir fills in the placeholder the tool context carries while the
// configuration is being read, when the staging directory does not exist yet.
func substituteStagingDir(values []string, stagingDir string) []string {
	for i, value := range values {
		values[i] = strings.ReplaceAll(value, "{stagingDir}", stagingDir)
	}
	return values
}

func getSystemBinaryDirs() []string {
	dirs := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/home/linuxbrew/.linuxbrew/bin",
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dirs = append(dirs, filepath.Join(home, ".local", "bin"))
		dirs = append(dirs, filepath.Join(home, ".cargo", "bin"))
		dirs = append(dirs, filepath.Join(home, ".bun", "bin"))
	}
	dirs = append(dirs, "/usr/bin", "/bin")
	return dirs
}

func (c *CurlScriptInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	destDir := c.BinDir
	if destDir != "" {
		binNames := GetBinaryNames(tool.Name, tool.Binaries)
		for _, name := range binNames {
			destPath := filepath.Join(destDir, name)
			_ = c.fsys.Remove(destPath)
		}
	}
	return nil
}

func (c *CurlScriptInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	versionArgs := getStringSliceParam(tool.InstallParams, "versionArgs")
	versionRegex := getStringParam(tool.InstallParams, "versionRegex", "")

	if len(versionArgs) == 0 {
		return &UpdateCheckResult{
			HasUpdate: false,
		}, nil
	}

	destDir := c.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	binNames := GetBinaryNames(tool.Name, tool.Binaries)
	if len(binNames) == 0 {
		return &UpdateCheckResult{
			HasUpdate: false,
		}, nil
	}

	binaryPath := filepath.Join(destDir, binNames[0])
	exists, err := c.fsys.Exists(binaryPath)
	if err != nil || !exists {
		return &UpdateCheckResult{
			HasUpdate: false,
		}, nil
	}

	localVersion, err := detectVersionViaCli(ctx, c.runner, binaryPath, versionArgs, versionRegex)
	if err != nil {
		return nil, fmt.Errorf("detecting version: %w", err)
	}

	return &UpdateCheckResult{
		HasUpdate:    false,
		LocalVersion: localVersion,
	}, nil
}

func init() {
	_ = Register(&CurlScriptInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
		dl:     downloader.NewDownloader(&fs.OSFS{}, nil),
	})
}
