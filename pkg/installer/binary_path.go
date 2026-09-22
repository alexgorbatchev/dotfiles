package installer

import (
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// ResolveBinaryPath turns the binaryPath install parameter into the absolute path it
// names, or returns "" when the tool does not set one.
//
// The rules are v1's expandToolConfigPath: placeholders are filled from the project
// configuration, "~" is the project's home directory, and a path that is still relative
// is taken relative to the tool file, or to the dotfiles directory for a configuration
// that has no tool file. Symlinks are not followed: the result names the path as
// written, so a link to it keeps following wherever that path is repointed.
//
// The manual and curl-script installers and the orchestrator's shim generation all read
// binaryPath, and share this so the same value cannot come to mean different paths.
func ResolveBinaryPath(fsys fs.FS, tool *config.ToolConfig, projCfg *config.ProjectConfig) (string, error) {
	written := getStringParam(tool.InstallParams, "binaryPath", "")
	if written == "" {
		return "", nil
	}

	resolved, err := config.ResolvePathPlaceholders(written, tool.Name, projCfg)
	if err != nil {
		return "", fmt.Errorf("%s: install parameter binaryPath %q: %w", tool.Name, written, err)
	}
	if projCfg != nil {
		resolved = utils.ExpandHomePath(projCfg.Paths.HomeDir, resolved)
	}

	if !fsys.IsAbs(resolved) {
		switch {
		case tool.ConfigFilePath != "":
			resolved = filepath.Join(filepath.Dir(tool.ConfigFilePath), resolved)
		case projCfg != nil && projCfg.Paths.DotfilesDir != "":
			resolved = filepath.Join(projCfg.Paths.DotfilesDir, resolved)
		}
	}
	if abs, err := fsys.Abs(resolved); err == nil {
		resolved = abs
	}
	return resolved, nil
}
