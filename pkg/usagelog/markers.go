package usagelog

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// MarkerDir holds persistent zero-byte last-used markers, separate from legacy logs.
func MarkerDir(generatedDir string) string {
	return filepath.Join(Dir(generatedDir), "last-used")
}

// MarkerPath computes a bounded filename without exposing names as path components.
// The generator does this work once; the shim only opens the resulting path.
func MarkerPath(generatedDir, toolName, binaryName string) string {
	identity := sha256.Sum256([]byte(toolName + "\x00" + binaryName))
	return filepath.Join(MarkerDir(generatedDir), fmt.Sprintf("%x.used", identity))
}

// RefreshMarkers merges filesystem modification times into existing usage rows.
// It never creates or removes markers, changes historical counts, or rewinds time.
// Missing markers mean no observation; direct binary calls are not tracked.
func RefreshMarkers(ctx context.Context, fsys fs.FS, reg *registry.Registry, generatedDir string, tools ...*config.ToolConfig) (int, error) {
	if len(tools) == 0 {
		return 0, nil
	}
	existing, err := reg.GetToolUsages(ctx)
	if err != nil {
		return 0, fmt.Errorf("reading previous tool activity: %w", err)
	}
	latest := make(map[string]int64, len(existing))
	for _, record := range existing {
		latest[record.ToolName+"\x00"+record.BinaryName] = record.LastUsedAt
	}

	var updates []*registry.ToolUsageRecord
	var inspectionErr error
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		for _, binary := range tool.BinaryNames() {
			if err := ctx.Err(); err != nil {
				return 0, errors.Join(inspectionErr, err)
			}
			path := MarkerPath(generatedDir, tool.Name, binary)
			info, err := fsys.Lstat(path)
			if os.IsNotExist(err) {
				continue
			}
			if err != nil {
				inspectionErr = errors.Join(inspectionErr, fmt.Errorf("reading activity marker %s: %w", path, err))
				continue
			}
			if !info.Mode().IsRegular() {
				inspectionErr = errors.Join(inspectionErr, fmt.Errorf("activity marker %s is not a regular file", path))
				continue
			}
			usedAt := info.ModTime().UnixMilli()
			key := tool.Name + "\x00" + binary
			if usedAt <= latest[key] {
				continue
			}
			latest[key] = usedAt
			updates = append(updates, &registry.ToolUsageRecord{ToolName: tool.Name, BinaryName: binary, LastUsedAt: usedAt})
		}
	}
	if len(updates) == 0 {
		return 0, inspectionErr
	}
	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		for _, update := range updates {
			if err := reg.RecordToolUsage(ctx, tx, update); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0, errors.Join(inspectionErr, fmt.Errorf("recording last-used observations: %w", err))
	}
	return len(updates), inspectionErr
}
