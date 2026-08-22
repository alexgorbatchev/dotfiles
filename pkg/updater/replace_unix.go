//go:build !windows

package updater

import (
	"fmt"
	"os"
)

func replaceExecutable(tmpTarget, targetPath string) error {
	if err := os.Rename(tmpTarget, targetPath); err != nil {
		_ = os.Remove(tmpTarget)
		return fmt.Errorf("atomic rename failed: %w", err)
	}
	return nil
}
