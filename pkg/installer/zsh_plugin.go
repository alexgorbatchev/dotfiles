package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type ZshPluginInstaller struct {
	log    *logger.Logger
	runner exec.CommandRunner
	fsys   fs.FS
	sysCtx *SystemContext
	BinDir string // Optional destination folder
}

func NewZshPluginInstaller(runner exec.CommandRunner, fsys fs.FS, sysCtx *SystemContext) *ZshPluginInstaller {
	if sysCtx == nil {
		sysCtx = NewDefaultSystemContext()
	}
	return &ZshPluginInstaller{
		runner: runner,
		fsys:   fsys,
		sysCtx: sysCtx,
	}
}

func (z *ZshPluginInstaller) Name() string {
	return "zsh-plugin"
}

func (z *ZshPluginInstaller) SupportsSudo() bool {
	return false
}

func (z *ZshPluginInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	repo := getStringParam(tool.InstallParams, "repo", "")
	url := getStringParam(tool.InstallParams, "url", "")

	if repo == "" && url == "" {
		return nil, fmt.Errorf("either repo or url must be specified")
	}

	gitURL := url
	if gitURL == "" {
		gitURL = "https://github.com/" + repo + ".git"
	}

	pluginName := getStringParam(tool.InstallParams, "pluginName", "")
	if pluginName == "" {
		if repo != "" {
			parts := strings.Split(repo, "/")
			if len(parts) == 2 {
				pluginName = parts[1]
			} else {
				pluginName = repo
			}
		} else {
			// Extract from url
			idx := strings.LastIndex(url, "/")
			if idx != -1 {
				pluginName = strings.TrimSuffix(url[idx+1:], ".git")
			} else {
				pluginName = tool.Name
			}
		}
	}

	destDir := z.BinDir
	if destDir == "" {
		destDir = os.TempDir()
	}

	if err := z.fsys.MkdirAll(destDir, 0755); err != nil {
		return nil, fmt.Errorf("creating plugins directory: %w", err)
	}

	pluginPath := filepath.Join(destDir, pluginName)
	exists, err := z.fsys.Exists(pluginPath)
	if err != nil {
		return nil, fmt.Errorf("checking plugin existence: %w", err)
	}

	if exists {
		// git pull
		cmd := z.runner.CommandContext(ctx, "git", "-C", pluginPath, "pull", "--ff-only")
		if err := cmd.Run(); err != nil {
			return nil, fmt.Errorf("updating plugin: %w", err)
		}
	} else {
		// git clone
		cmd := z.runner.CommandContext(ctx, "git", "clone", "--depth", "1", gitURL, pluginPath)
		if err := cmd.Run(); err != nil {
			return nil, fmt.Errorf("cloning plugin: %w", err)
		}
	}

	// Detect candidate files
	candidates := []string{
		pluginName + ".plugin.zsh",
		pluginName + ".zsh",
		"init.zsh",
		"plugin.zsh",
		pluginName + ".zsh-theme",
	}

	sourceFile := ""
	explicitSource := getStringParam(tool.InstallParams, "source", "")
	if explicitSource != "" {
		sourceFile = explicitSource
	} else {
		for _, candidate := range candidates {
			candidatePath := filepath.Join(pluginPath, candidate)
			if found, _ := z.fsys.Exists(candidatePath); found {
				sourceFile = candidate
				break
			}
		}
	}

	if sourceFile == "" {
		return nil, fmt.Errorf("Could not detect plugin source file in %s. Specify 'source' parameter explicitly.", pluginPath)
	}

	return &InstallResult{
		Binaries: []string{}, // No shims generated
	}, nil
}

func (z *ZshPluginInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	pluginName := getStringParam(tool.InstallParams, "pluginName", tool.Name)
	destDir := z.BinDir
	if destDir != "" {
		pluginPath := filepath.Join(destDir, pluginName)
		return z.fsys.Remove(pluginPath)
	}
	return nil
}

func (z *ZshPluginInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{
		HasUpdate: false,
	}, nil
}

func init() {
	_ = Register(&ZshPluginInstaller{
		runner: exec.NewOSRunner(),
		fsys:   &fs.OSFS{},
	})
}
