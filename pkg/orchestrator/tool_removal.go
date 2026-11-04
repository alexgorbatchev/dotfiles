package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/drift"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/toolbatch"
)

// systemToolName owns what generation creates for the project as a whole (the shim
// directory, the shell scripts) rather than for any one tool. It is never an orphan.
const systemToolName = "system"

// CleanupOrphanedTools removes what dotfiles recorded for every tool that is no longer
// active: its configuration file is gone, it is disabled, or its hostname does not
// match. Each tool is cleaned on its own, and a tool whose cleanup fails keeps the
// records of whatever is still in place, so the next run finds it again and retries.
func (o *Orchestrator) CleanupOrphanedTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil || o.reg == nil {
		return nil
	}

	active := make(map[string]bool)
	for _, tool := range tools {
		if tool.IsActive() {
			active[tool.Name] = true
		}
	}

	var failures toolbatch.Failures
	recorded, err := o.toolsWithRecordedArtifacts(ctx)
	if err != nil {
		failures.Record(o.logger, systemToolName, fmt.Errorf("finding orphaned tools: %w", err))
		return failures.Err()
	}

	for _, toolName := range recorded {
		if active[toolName] {
			continue
		}
		if err := ctx.Err(); err != nil {
			return errors.Join(failures.Err(), err)
		}
		o.logger.WithTag(toolName).Info(logger.Message("Cleaning up orphaned tool..."))
		if err := o.removeOrphanedTool(ctx, toolName, projCfg); err != nil {
			failures.Record(o.logger, toolName, fmt.Errorf("Failed to cleanup orphaned tool: %w", err))
		}
	}

	if err := o.removeLeftoverInstallDirs(ctx, active, recorded, projCfg, &failures); err != nil {
		return errors.Join(failures.Err(), err)
	}
	return failures.Err()
}

// installLayoutEntry is what every install leaves in a tool's directory under the
// binaries directory: the promoted installation, or the link to an external one.
const installLayoutEntry = "current"

// cliInstallName is the directory under the binaries directory the CLI itself is
// deployed to by scripts/dev-bootstrap and scripts/managed-installer, outside the
// registry. Unrecorded, it is the running CLI rather than a removed tool's leftover.
const cliInstallName = "dotfiles"

// removeLeftoverInstallDirs removes the install directory of every tool that left
// nothing in the registry to find it by: earlier versions deleted an orphaned tool's
// records without removing its downloaded binaries. A directory under the binaries
// directory is such a leftover only when it has the install layout, no active tool
// has its name, the registry records nothing for that name, and it is not where the
// CLI itself is deployed. Each failure is
// recorded against the tool and the rest are still tried; only a cancelled context
// is returned.
func (o *Orchestrator) removeLeftoverInstallDirs(ctx context.Context, active map[string]bool, recorded []string, projCfg *config.ProjectConfig, failures *toolbatch.Failures) error {
	binariesDir := projCfg.Paths.BinariesDir
	if binariesDir == "" {
		return nil
	}
	names, err := o.fs.ReadDir(binariesDir)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			failures.Record(o.logger, systemToolName, fmt.Errorf("listing %s for leftover installs: %w", binariesDir, err))
		}
		return nil
	}
	sort.Strings(names)
	for _, name := range names {
		if active[name] || name == systemToolName || name == cliInstallName || slices.Contains(recorded, name) {
			continue
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		dir := filepath.Join(binariesDir, name)
		leftover, err := o.isLeftoverInstallDir(dir)
		if err != nil {
			failures.Record(o.logger, name, err)
			continue
		}
		if !leftover {
			continue
		}
		o.logger.WithTag(name).Info(logger.Message("Removing the install directory of a tool that is no longer configured..."))
		if err := o.removeInstallDir(ctx, name, dir, projCfg); err != nil {
			failures.Record(o.logger, name, fmt.Errorf("Failed to cleanup orphaned tool: %w", err))
		}
	}
	return nil
}

// isLeftoverInstallDir reports whether dir is a real directory holding the install
// layout, rather than anything else that happens to sit in the binaries directory.
func (o *Orchestrator) isLeftoverInstallDir(dir string) (bool, error) {
	info, err := o.fs.Lstat(dir)
	if err != nil {
		return false, fmt.Errorf("inspecting %s: %w", dir, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return false, nil
	}
	if _, err := o.fs.Lstat(filepath.Join(dir, installLayoutEntry)); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("inspecting %s: %w", dir, err)
	}
	return true, nil
}

// removeOrphanedTool removes an orphaned tool's artifacts. Unlike an uninstall, it
// runs no installer: a package manager is told what to remove by the tool's
// configuration, which an orphan no longer has, so a package installed outside
// dotfiles' own directories is reported rather than guessed at.
func (o *Orchestrator) removeOrphanedTool(ctx context.Context, toolName string, projCfg *config.ProjectConfig) error {
	rec, err := o.recordedInstallation(ctx, toolName)
	if err != nil {
		return err
	}
	if err := o.removeToolArtifacts(ctx, toolName, projCfg); err != nil {
		return err
	}
	o.reportExternalInstallation(toolName, rec)
	return nil
}

// reportExternalInstallation warns about what an orphaned tool's installation placed
// outside dotfiles' directories, which removing its artifacts leaves behind.
func (o *Orchestrator) reportExternalInstallation(toolName string, rec *registry.ToolInstallationRecord) {
	if rec == nil {
		return
	}
	log := o.logger.WithTag(toolName)
	if rec.AppBundlePath != nil && *rec.AppBundlePath != "" {
		log.Warn(logger.Message(fmt.Sprintf("%s is left in place: remove it if it is no longer needed", *rec.AppBundlePath)))
		return
	}
	if rec.InstallMethod != nil && isExternallyManaged(*rec.InstallMethod) {
		log.Warn(logger.Message(fmt.Sprintf(
			"The %s package it installed is left in place: uninstalling it needs the tool's configuration; remove it with %s if it is no longer needed",
			*rec.InstallMethod, *rec.InstallMethod,
		)))
	}
}

// toolsWithRecordedArtifacts names, in order, every tool the registry still records
// something for: a file it currently owns, a managed block it still holds in a shared
// file, or an installation.
//
// Ownership comes from the registry-wide state rather than each tool's own history,
// so a path another tool has written since belongs to that tool, and a tool whose
// every recorded artifact is gone is not reported again.
func (o *Orchestrator) toolsWithRecordedArtifacts(ctx context.Context) ([]string, error) {
	names := make(map[string]bool)

	states, err := o.reg.GetFileStates(ctx)
	if err != nil {
		return nil, fmt.Errorf("reading recorded files: %w", err)
	}
	for _, st := range states {
		names[st.ToolName] = true
	}

	// Several tools can hold blocks in one file, and the file's state names only the
	// last of them, so every block is asked about by its own identity.
	blocks, err := o.reg.GetFileOperations(ctx, registry.FileOperationFilter{OperationType: "block"})
	if err != nil {
		return nil, fmt.Errorf("reading recorded blocks: %w", err)
	}
	for _, op := range blocks {
		if names[op.ToolName] || op.BlockID == nil {
			continue
		}
		st, err := o.reg.GetBlockState(ctx, op.FilePath, *op.BlockID)
		if err != nil {
			return nil, fmt.Errorf("reading block %q in %s: %w", *op.BlockID, op.FilePath, err)
		}
		if st != nil {
			names[op.ToolName] = true
		}
	}

	installations, err := o.reg.GetAllToolInstallations(ctx)
	if err != nil {
		return nil, fmt.Errorf("reading tool installations: %w", err)
	}
	for _, inst := range installations {
		names[inst.ToolName] = true
	}

	delete(names, systemToolName)
	sorted := make([]string, 0, len(names))
	for name := range names {
		sorted = append(sorted, name)
	}
	sort.Strings(sorted)
	return sorted, nil
}

// removeToolArtifacts removes everything dotfiles recorded creating for a tool: its
// install directory with the downloaded binaries in it, its managed blocks, and every
// file, symlink and directory it recorded. Each removal is recorded as an rm, so the
// tool's history says what happened to what it created.
//
// Only what dotfiles still owns is removed. A recorded path that now holds something
// else (a symlink pointing elsewhere, a directory where a file was written) is left in
// place and reported, a directory that still holds unrecorded files is kept, and an
// edited copy or template is moved aside rather than deleted. Those paths are no
// longer the tool's, so their records end too.
//
// Any failure leaves the records of what could not be removed, and the installation
// record, in place, and is returned once everything else has been tried.
func (o *Orchestrator) removeToolArtifacts(ctx context.Context, toolName string, projCfg *config.ProjectConfig) error {
	if toolName == "" || toolName == "." || toolName == ".." || filepath.Base(toolName) != toolName {
		return fmt.Errorf("refusing to remove the artifacts of a tool named %q", toolName)
	}

	installDirs, err := o.toolInstallDirs(ctx, toolName, projCfg)
	if err != nil {
		return err
	}

	var errs []error
	var removedDirs []string
	// failed holds every path that could not be removed, so a directory above one keeps
	// its record: once the next run removes what is inside, it removes the directory.
	var failed []string
	for _, dir := range installDirs {
		if err := o.removeInstallDir(ctx, toolName, dir, projCfg); err != nil {
			errs = append(errs, err)
			failed = append(failed, dir)
			continue
		}
		removedDirs = append(removedDirs, dir)
	}

	if o.reg == nil {
		return errors.Join(errs...)
	}

	if err := o.cleanupStaleBlocks(ctx, &config.ToolConfig{Name: toolName}, projCfg); err != nil {
		errs = append(errs, err)
	}

	states, err := o.reg.GetFileStates(ctx)
	if err != nil {
		return errors.Join(append(errs, fmt.Errorf("reading file states of %s: %w", toolName, err))...)
	}
	// States come in path order; walking it backwards reaches what a directory holds
	// before the directory itself, so a directory the tool created can be emptied first.
	for i := len(states) - 1; i >= 0; i-- {
		st := states[i]
		if st.ToolName != toolName || st.FileType == "block" {
			continue
		}
		if withinAny(installDirs, st.FilePath) {
			if !withinAny(removedDirs, st.FilePath) {
				continue // its install directory is still there, and so is its record
			}
		} else if holdsAny(st.FilePath, failed) {
			continue // something inside could not be removed, so neither can this
		} else if err := o.removeRecordedPath(ctx, toolName, st, projCfg); err != nil {
			errs = append(errs, err)
			failed = append(failed, st.FilePath)
			continue
		}
		if err := o.recordRemoved(ctx, toolName, st); err != nil {
			errs = append(errs, err)
		}
	}

	if len(errs) > 0 {
		return errors.Join(errs...)
	}
	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		return o.reg.RemoveToolInstallation(ctx, tx, toolName)
	})
}

// toolInstallDirs returns the directories a tool's installations live in: the one
// under the project's binaries directory and, when it differs, the one its
// installation record names (the binaries directory may have moved since).
func (o *Orchestrator) toolInstallDirs(ctx context.Context, toolName string, projCfg *config.ProjectConfig) ([]string, error) {
	var dirs []string
	if projCfg != nil && projCfg.Paths.BinariesDir != "" {
		dirs = append(dirs, filepath.Join(projCfg.Paths.BinariesDir, toolName))
	}
	rec, err := o.recordedInstallation(ctx, toolName)
	if err != nil {
		return nil, err
	}
	// Installs always put a tool in a directory named after it, so a recorded path
	// that is not one is not removed wholesale.
	if rec != nil && rec.InstallPath != "" {
		recorded := filepath.Clean(rec.InstallPath)
		if filepath.Base(recorded) == toolName && !slices.Contains(dirs, recorded) {
			dirs = append(dirs, recorded)
		}
	}
	return dirs, nil
}

// removeInstallDir removes one of a tool's install directories with everything in it.
// Only the paths the registry recorded inside it get an rm record, which the caller
// writes: the files an archive unpacked were never recorded one by one.
func (o *Orchestrator) removeInstallDir(ctx context.Context, toolName, dir string, projCfg *config.ProjectConfig) error {
	if _, err := o.fs.Lstat(dir); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("inspecting install directory %s: %w", dir, err)
	}
	if err := o.safeRemoveAll(ctx, o.fs, dir); err != nil {
		return fmt.Errorf("removing install directory %s: %w", dir, err)
	}
	o.logger.WithTag(toolName).Info(logger.Message(fmt.Sprintf("rm %s", o.formatPath(projCfg, dir))))
	return nil
}

// removeRecordedPath removes one path the registry records for a tool, if what is
// there is still what dotfiles put there. A nil result means the record can end:
// the path is gone, was removed, or is no longer the tool's.
func (o *Orchestrator) removeRecordedPath(ctx context.Context, toolName string, st *registry.FileState, projCfg *config.ProjectConfig) error {
	path := st.FilePath
	info, err := o.fs.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("inspecting %s: %w", path, err)
	}

	if st.LastOperation == "chmod" {
		created, err := o.createdByTool(ctx, toolName, path)
		if err != nil {
			return err
		}
		if !created {
			return nil // dotfiles only set its mode; it was there before
		}
	}

	isLink := info.Mode()&os.ModeSymlink != 0
	wasDir := st.LastOperation == "mkdir" || st.FileType == "directory"
	switch {
	case st.LastOperation == "symlink":
		return o.removeRecordedSymlink(toolName, st, isLink, projCfg)
	case info.IsDir() && !wasDir:
		o.leaveInPlace(toolName, projCfg, path, "it is a directory now, not the file dotfiles wrote")
		return nil
	case info.IsDir():
		return o.removeRecordedDir(toolName, path, projCfg)
	case wasDir:
		o.leaveInPlace(toolName, projCfg, path, "it is no longer the directory dotfiles created")
		return nil
	case isLink && st.FileType != "shim":
		o.leaveInPlace(toolName, projCfg, path, "it is a symlink now, not the file dotfiles wrote")
		return nil
	case st.FileType == "copy" || st.FileType == "template":
		return o.removeRecordedCopy(toolName, st, projCfg)
	}

	if err := o.fs.Remove(path); err != nil {
		return fmt.Errorf("removing %s: %w", path, err)
	}
	o.logger.WithTag(toolName).Info(logger.Message(fmt.Sprintf("rm %s", o.formatPath(projCfg, path))))
	return nil
}

// removeRecordedCopy removes a copied or templated file, moving an edited one aside,
// unless a directory on the way to it is no longer one the copy created. Lstat judges
// only the last component of a path, so a copied directory the user replaced with a
// symlink to their own would otherwise lead the removal into their files.
func (o *Orchestrator) removeRecordedCopy(toolName string, st *registry.FileState, projCfg *config.ProjectConfig) error {
	path := st.FilePath
	top := path
	if st.TargetPath != nil {
		top = copyRootBound(*st.TargetPath, path)
	}
	dir, err := o.firstForeignDir(path, top)
	if err != nil {
		return err
	}
	if dir != "" {
		o.leaveInPlace(toolName, projCfg, path, fmt.Sprintf(
			"%s above it is no longer the directory dotfiles copied into", o.formatPath(projCfg, dir),
		))
		return nil
	}
	return o.removeStaleFile(toolName, st, projCfg, path)
}

// copyRootBound returns the highest directory the declared copy that placed target
// can have started at, judged from the source it was copied from: a member of a
// copied directory shares its path below the copy's root with its source. Where the
// source and target directories are also named alike, the bound lies above the real
// root, which can only make the check more cautious.
func copyRootBound(source, target string) string {
	top := filepath.Clean(target)
	src := filepath.Clean(source)
	for filepath.Base(src) == filepath.Base(top) {
		parent, srcParent := filepath.Dir(top), filepath.Dir(src)
		if parent == top || srcParent == src {
			break
		}
		top, src = parent, srcParent
	}
	return top
}

// firstForeignDir returns the first directory from path's parent up to top that is
// no longer a real directory (see drift.ForeignEntry), or "" when there is none or
// top is path itself.
func (o *Orchestrator) firstForeignDir(path, top string) (string, error) {
	if top == path || !isWithin(top, path) {
		return "", nil
	}
	for dir := filepath.Dir(path); ; dir = filepath.Dir(dir) {
		foreign, err := drift.ForeignEntry(o.fs, dir, true)
		if err != nil {
			return "", fmt.Errorf("inspecting %s: %w", dir, err)
		}
		if foreign {
			return dir, nil
		}
		if dir == top || dir == filepath.Dir(dir) {
			return "", nil
		}
	}
}

// removeRecordedSymlink removes a symlink dotfiles created, but only while it still
// points where dotfiles pointed it. Whatever the link leads to is never touched, and
// that is commonly gone already: removing a tool's directory takes the sources of its
// links with it.
func (o *Orchestrator) removeRecordedSymlink(toolName string, st *registry.FileState, isLink bool, projCfg *config.ProjectConfig) error {
	path := st.FilePath
	if !isLink {
		o.leaveInPlace(toolName, projCfg, path, "it is no longer the symlink dotfiles created")
		return nil
	}
	var source string
	if st.TargetPath != nil {
		source = *st.TargetPath
	}
	removed, err := o.getSymlinkEvaluator().RemoveSymlink(path, source)
	if err != nil {
		return fmt.Errorf("removing symlink %s: %w", path, err)
	}
	if !removed {
		dest, err := o.fs.Readlink(path)
		if err != nil {
			return fmt.Errorf("reading symlink %s: %w", path, err)
		}
		o.leaveInPlace(toolName, projCfg, path, fmt.Sprintf(
			"it points to %s now, not to %s, which dotfiles linked", dest, o.formatPath(projCfg, source),
		))
		return nil
	}
	o.logger.WithTag(toolName).Info(logger.Message(fmt.Sprintf("rm %s", o.formatPath(projCfg, path))))
	return nil
}

// removeRecordedDir removes a directory dotfiles created once it is empty. One that
// still holds files was shared with something else, and keeps them.
func (o *Orchestrator) removeRecordedDir(toolName, path string, projCfg *config.ProjectConfig) error {
	entries, err := o.fs.ReadDir(path)
	if err != nil {
		return fmt.Errorf("listing %s: %w", path, err)
	}
	if len(entries) > 0 {
		o.logger.WithTag(toolName).Info(logger.Message(fmt.Sprintf(
			"Kept %s: it holds files dotfiles did not create", o.formatPath(projCfg, path),
		)))
		return nil
	}
	if err := o.fs.Remove(path); err != nil {
		return fmt.Errorf("removing %s: %w", path, err)
	}
	o.logger.WithTag(toolName).Info(logger.Message(fmt.Sprintf("rm %s", o.formatPath(projCfg, path))))
	return nil
}

// leaveInPlace reports a recorded path that is no longer what dotfiles created and is
// therefore not removed.
func (o *Orchestrator) leaveInPlace(toolName string, projCfg *config.ProjectConfig, path, reason string) {
	o.logger.WithTag(toolName).Warn(logger.Message(fmt.Sprintf("Left %s in place: %s", o.formatPath(projCfg, path), reason)))
}

// createdByTool reports whether the tool's history for path, since it last removed
// it, holds an operation that created the path. A path the tool only changed the mode
// of was there before it and is not the tool's to remove.
func (o *Orchestrator) createdByTool(ctx context.Context, toolName, path string) (bool, error) {
	ops, err := o.reg.GetFileOperations(ctx, registry.FileOperationFilter{ToolName: toolName, FilePath: path})
	if err != nil {
		return false, fmt.Errorf("reading the history of %s: %w", path, err)
	}
	for _, op := range ops {
		if op.OperationType == "rm" {
			break
		}
		if op.OperationType != "chmod" {
			return true, nil
		}
	}
	return false, nil
}

// recordRemoved ends the record of a path the tool no longer owns.
func (o *Orchestrator) recordRemoved(ctx context.Context, toolName string, st *registry.FileState) error {
	err := o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		return o.getTrackedFS(ctx, tx, toolName, st.FileType).RecordRemoved(st.FilePath)
	})
	if err != nil {
		return fmt.Errorf("recording the removal of %s: %w", st.FilePath, err)
	}
	return nil
}

// holdsAny reports whether one of paths lies beneath dir.
func holdsAny(dir string, paths []string) bool {
	for _, p := range paths {
		if p != dir && isWithin(dir, p) {
			return true
		}
	}
	return false
}

// withinAny reports whether path is one of dirs or lies beneath one of them.
func withinAny(dirs []string, path string) bool {
	for _, dir := range dirs {
		if isWithin(dir, path) {
			return true
		}
	}
	return false
}
