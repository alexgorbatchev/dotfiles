package e2e

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// recordBuildInputs registers the subprocess build's files with cmd/go's test
// input log. Without this, a cached E2E result can survive changes to CLI code
// and embedded assets that the E2E test package does not itself import.
func recordBuildInputs(projectRoot string) error {
	for _, name := range []string{"go.mod", "go.sum"} {
		if _, err := os.Stat(filepath.Join(projectRoot, name)); err != nil {
			return fmt.Errorf("tracking build input %s: %w", name, err)
		}
	}
	for _, name := range []string{"cmd", "pkg", "internal"} {
		err := filepath.WalkDir(filepath.Join(projectRoot, name), func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !entry.IsDir() {
				_, err = os.Stat(path)
			}
			return err
		})
		if err != nil {
			return fmt.Errorf("tracking build inputs in %s: %w", name, err)
		}
	}
	return nil
}
