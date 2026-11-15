package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// appBundleRemovalFS records bundle roots only, not every file within an app. The
// installer verifies ownership before invoking RemoveAll on the three exact paths.
// A missing root is reconciled too: deletion can succeed before the SQL write fails.
type appBundleRemovalFS struct {
	fs.FS
	orch     *Orchestrator
	ctx      context.Context
	toolName string
	pending  string
}

func (f *appBundleRemovalFS) RemoveAll(path string) error {
	_, err := f.FS.Lstat(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	existed := err == nil
	if !existed && f.pending != path {
		return nil
	}
	if existed && f.orch.reg != nil {
		if err := f.orch.reg.WithTx(f.ctx, func(tx *sql.Tx) error {
			return f.orch.reg.UpdateToolInstallation(f.ctx, tx, f.toolName, registry.ToolInstallationUpdate{AppBundlePendingRemoval: &path})
		}); err != nil {
			return fmt.Errorf("recording removal intent for %s: %w", path, err)
		}
		f.pending = path
	}
	remove := func() error { return f.orch.safeRemoveAll(f.ctx, f.FS, path) }
	if f.orch.reg == nil {
		if err := remove(); err != nil {
			return err
		}
	} else if err := f.orch.reg.WithTx(f.ctx, func(tx *sql.Tx) error {
		// Stage the history write first, so a rejected record never deletes a path.
		// The transaction commits only after the filesystem removal succeeds.
		if err := f.orch.getTrackedFS(f.ctx, tx, f.toolName, "app-bundle").RecordRemoved(path); err != nil {
			return fmt.Errorf("recording removal of %s: %w", path, err)
		}
		if err := remove(); err != nil {
			return err
		}
		empty := ""
		return f.orch.reg.UpdateToolInstallation(f.ctx, tx, f.toolName, registry.ToolInstallationUpdate{AppBundlePendingRemoval: &empty})
	}); err != nil {
		return err
	}

	f.pending = ""
	f.orch.logger.WithTag(f.toolName).Info(logger.Message("rm " + path))
	return nil
}
