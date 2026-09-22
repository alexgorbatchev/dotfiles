package installer

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// resolveBinaryPath turns the binaryPath install parameter into the absolute path it
// names, or returns "" when the tool does not set one. Placeholders are filled from the
// project configuration, "~" is expanded by the filesystem, and a relative path is taken
// relative to the tool file. Symlinks are not followed: the result names the path as
// written, so a link to it keeps following wherever that path is repointed.
//
// manual and curl-script both read binaryPath, and share this so that the same value
// cannot come to mean different paths depending on the installation method.
func resolveBinaryPath(ctx context.Context, fsys fs.FS, tool *config.ToolConfig) (string, error) {
	written := getStringParam(tool.InstallParams, "binaryPath", "")
	if written == "" {
		return "", nil
	}

	resolved, err := config.ResolvePathPlaceholders(written, tool.Name, config.GetProjectConfig(ctx))
	if err != nil {
		return "", fmt.Errorf("%s: install parameter binaryPath %q: %w", tool.Name, written, err)
	}

	if !fsys.IsAbs(resolved) && tool.ConfigFilePath != "" {
		resolved = filepath.Join(filepath.Dir(tool.ConfigFilePath), resolved)
	}
	if abs, err := fsys.Abs(resolved); err == nil {
		resolved = abs
	}
	return resolved, nil
}
