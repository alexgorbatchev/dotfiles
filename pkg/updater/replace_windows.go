//go:build windows

package updater

import (
	"fmt"
	"os"
)

func replaceExecutable(tmpTarget, targetPath string) error {
	if _, err := os.Stat(targetPath); err == nil {
		oldBackup := targetPath + ".old"
		_ = os.Remove(oldBackup)
		if err := os.Rename(targetPath, oldBackup); err != nil {
			_ = os.Remove(tmpTarget)
			return fmt.Errorf("backup existing windows binary: %w", err)
		}
		if err := os.Rename(tmpTarget, targetPath); err != nil {
			_ = os.Rename(oldBackup, targetPath)
			_ = os.Remove(tmpTarget)
			return fmt.Errorf("replace windows binary: %w", err)
		}
		_ = os.Remove(oldBackup)
		return nil
	}

	if err := os.Rename(tmpTarget, targetPath); err != nil {
		_ = os.Remove(tmpTarget)
		return fmt.Errorf("atomic rename failed: %w", err)
	}
	return nil
}
