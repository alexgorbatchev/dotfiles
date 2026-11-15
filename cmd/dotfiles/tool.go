package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/spf13/cobra"
)

var toolCmd = &cobra.Command{
	Use:   "tool",
	Short: "Managed tool configurations (.tool.ts) and packages",
}

// toolConfigEntry inspects the entry itself: a dangling link is still an existing
// configuration that requires --force, not an absent file to write through.
func toolConfigEntry(fsys fs.FS, path string) (os.FileInfo, error) {
	info, err := fsys.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("inspecting tool config %s: %w", path, err)
	}
	return info, nil
}

// writeToolConfig replaces a symlink entry rather than changing its destination.
// The caller has already enforced the overwrite policy for existing entries.
func writeToolConfig(fsys fs.FS, path string, content []byte, entry os.FileInfo) error {
	if entry != nil && entry.Mode()&os.ModeSymlink != 0 {
		if err := fsys.Remove(path); err != nil {
			return fmt.Errorf("replacing tool config link %s: %w", path, err)
		}
	}
	if err := fsys.WriteFile(path, content, 0644); err != nil {
		return fmt.Errorf("writing tool config %s: %w", path, err)
	}
	return nil
}

func init() {
	toolCmd.AddCommand(toolListCmd)
	toolCmd.AddCommand(toolInfoCmd)
	toolCmd.AddCommand(toolWhichCmd)
	toolCmd.AddCommand(toolInstallCmd)
	toolCmd.AddCommand(toolUninstallCmd)
	toolCmd.AddCommand(toolUpdateCmd)
	toolCmd.AddCommand(toolCheckCmd)
	toolCmd.AddCommand(toolValidateCmd)
	toolCmd.AddCommand(toolFilesCmd)
	toolCmd.AddCommand(toolScaffoldCmd)
	toolCmd.AddCommand(toolAddCmd)
	toolCmd.AddCommand(toolMakeCmd)
	rootCmd.AddCommand(toolCmd)
}
