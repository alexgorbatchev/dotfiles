package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
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

	// Execute script
	args := getStringSliceParam(tool.InstallParams, "args")
	for i, arg := range args {
		if strings.Contains(arg, "{stagingDir}") {
			args[i] = strings.ReplaceAll(arg, "{stagingDir}", destDir)
		}
	}
	var runCmd exec.Cmd
	if shell == "bash" {
		cmdArgs := append([]string{scriptPath}, args...)
		runCmd = c.runner.CommandContext(ctx, "bash", cmdArgs...)
	} else {
		cmdArgs := append([]string{scriptPath}, args...)
		runCmd = c.runner.CommandContext(ctx, "sh", cmdArgs...)
	}

	if envMap, ok := tool.InstallParams["env"].(map[string]interface{}); ok {
		keys := make([]string, 0, len(envMap))
		for k := range envMap {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var envSlice []string
		for _, k := range keys {
			v := envMap[k]
			if vStr, ok := v.(string); ok {
				if strings.Contains(vStr, "{stagingDir}") {
					vStr = strings.ReplaceAll(vStr, "{stagingDir}", destDir)
				}
				envSlice = append(envSlice, fmt.Sprintf("%s=%s", k, vStr))
			}
		}
		if len(envSlice) > 0 {
			runCmd.SetEnv(append(os.Environ(), envSlice...))
		}
	}

	runCmd.SetStdout(os.Stdout)
	runCmd.SetStderr(os.Stderr)

	if err := runCmd.Run(); err != nil {
		return nil, fmt.Errorf("running install script: %w", err)
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
					_ = c.fsys.Remove(targetPath)
					renameErr := c.fsys.Rename(sysPath, targetPath)
					if renameErr != nil {
						if copyErr := c.fsys.CopyFile(sysPath, targetPath); copyErr == nil {
							_ = c.fsys.Remove(sysPath)
						} else {
							continue
						}
					}
					_ = c.fsys.Chmod(targetPath, 0755)
					foundInSys = true
					break
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

	return &InstallResult{
		Binaries: promotedBinaries,
	}, nil
}

func getSystemBinaryDirs() []string {
	dirs := []string{"/usr/local/bin"}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dirs = append(dirs, filepath.Join(home, ".local", "bin"))
	}
	dirs = append(dirs, "/usr/bin")
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
