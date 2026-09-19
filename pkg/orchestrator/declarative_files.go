package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/alexgorbatchev/dotfiles/pkg/backup"
	"github.com/alexgorbatchev/dotfiles/pkg/block"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/drift"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// defaultFileMode and defaultDirMode are what a declaration that states no mode gets.
const (
	defaultFileMode os.FileMode = 0644
	defaultDirMode  os.FileMode = 0755
)

// applyDeclarativeFiles carries out the file declarations of a tool: the directories
// it needs, the templates it renders, and the regions of shared files it owns.
//
// Directories come first because a template or a block may write into one of them,
// and blocks come last because a block's file is the one most likely to be shared
// with something a template just wrote.
func (o *Orchestrator) applyDeclarativeFiles(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if err := o.ensureDeclaredDirectories(ctx, tool, projCfg); err != nil {
		return err
	}
	if err := o.applyTemplates(ctx, tool, projCfg); err != nil {
		return err
	}
	return o.applyBlocks(ctx, tool, projCfg)
}

// resolveTargetPath turns a declared target into the absolute path it names,
// resolving {placeholders} and a leading "~" the same way every other declaration in
// a tool configuration does.
func (o *Orchestrator) resolveTargetPath(tool *config.ToolConfig, projCfg *config.ProjectConfig, target string) (string, error) {
	resolved, err := config.ResolvePathPlaceholders(target, tool.Name, projCfg)
	if err != nil {
		return "", err
	}
	if projCfg != nil {
		resolved = utils.ExpandHomePath(projCfg.Paths.HomeDir, resolved)
	}
	return resolved, nil
}

// resolveSourcePath turns a declared source into an absolute path, resolving a
// relative one against the directory the tool's configuration file is in.
func (o *Orchestrator) resolveSourcePath(tool *config.ToolConfig, source string) string {
	if o.fs.IsAbs(source) || tool.ConfigFilePath == "" {
		return source
	}
	return filepath.Join(filepath.Dir(tool.ConfigFilePath), source)
}

// ensureDeclaredDirectories creates every directory a tool declares and gives it the
// permission the declaration asks for.
//
// The mode is applied whether or not the directory had to be created: a directory
// somebody set up by hand at 0755 is exactly the case .ensureDir("~/.ssh", { mode:
// "0700" }) exists to correct, and ssh refuses to use a key whose directory other
// users can read.
func (o *Orchestrator) ensureDeclaredDirectories(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	for _, dir := range tool.Directories {
		path, err := o.resolveTargetPath(tool, projCfg, dir.Path)
		if err != nil {
			return fmt.Errorf("tool %q: directory %q: %w", tool.Name, dir.Path, err)
		}

		mode := defaultDirMode
		if dir.Mode != "" {
			if mode, err = config.ParseMode(dir.Mode); err != nil {
				return fmt.Errorf("tool %q: directory %q: %w", tool.Name, dir.Path, err)
			}
		}

		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			tracked := o.getTrackedFS(ctx, tx, tool.Name, "directory").WithTargetMode(mode)
			if err := tracked.MkdirAll(path, mode); err != nil {
				return fmt.Errorf("creating %s: %w", path, err)
			}
			return o.enforceMode(tracked, path, dir.Mode)
		})
		if err != nil {
			return fmt.Errorf("tool %q: directory %q: %w", tool.Name, dir.Path, err)
		}
	}
	return nil
}

// enforceMode brings a path to the declared permission, and does nothing when the
// declaration states none or the path already has it. Chmod is recorded, so a mode
// left alone here does not produce an operation on every run.
func (o *Orchestrator) enforceMode(tracked *fs.TrackedFileSystem, path, declared string) error {
	if declared == "" {
		return nil
	}
	mode, err := config.ParseMode(declared)
	if err != nil {
		return err
	}
	info, err := tracked.Lstat(path)
	if err != nil {
		return fmt.Errorf("checking the permission of %s: %w", path, err)
	}
	if info.Mode().Perm() == mode {
		return nil
	}
	if err := tracked.Chmod(path, mode); err != nil {
		return fmt.Errorf("setting the permission of %s: %w", path, err)
	}
	return nil
}

// applyTemplates renders every template a tool declares and settles it against
// whatever is at the target, through the drift engine rather than by overwriting.
func (o *Orchestrator) applyTemplates(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	for _, tmpl := range tool.Templates {
		target, err := o.resolveTargetPath(tool, projCfg, tmpl.Target)
		if err != nil {
			return fmt.Errorf("tool %q: template target %q: %w", tool.Name, tmpl.Target, err)
		}

		source := o.resolveSourcePath(tool, tmpl.Source)
		raw, err := o.fs.ReadFile(source)
		if err != nil {
			return fmt.Errorf("tool %q: reading template %q: %w", tool.Name, tmpl.Source, err)
		}

		rendered, err := config.RenderTemplate(string(raw), tmpl.Variables, tool.Name, projCfg)
		if err != nil {
			return fmt.Errorf("tool %q: rendering template %q: %w", tool.Name, tmpl.Source, err)
		}

		err = o.settleWholeFile(ctx, wholeFileRequest{
			toolName: tool.Name,
			fileType: "template",
			path:     target,
			desired:  rendered,
			mode:     tmpl.Mode,
			policy:   drift.Policy(tmpl.Conflict),
		})
		if err != nil {
			return fmt.Errorf("tool %q: template %q: %w", tool.Name, tmpl.Target, err)
		}
	}
	return nil
}

// wholeFileRequest describes one file dotfiles owns outright and is about to settle
// against what is on disk.
type wholeFileRequest struct {
	toolName string
	fileType string
	path     string
	desired  string
	mode     string
	policy   drift.Policy
}

// settleWholeFile writes a file dotfiles owns, deciding what to do about anything
// already there from the three versions rather than from a byte comparison.
func (o *Orchestrator) settleWholeFile(ctx context.Context, req wholeFileRequest) error {
	current, exists, err := o.readIfPresent(req.path)
	if err != nil {
		return err
	}

	recorded, err := o.reg.GetFileState(ctx, req.path)
	if err != nil {
		return fmt.Errorf("reading the recorded state of %s: %w", req.path, err)
	}

	base := ""
	if recorded != nil && recorded.ContentHash != nil {
		base = *recorded.ContentHash
	}
	currentHash := ""
	if exists {
		currentHash = fs.HashContent([]byte(current))
	}

	state := drift.Evaluate(drift.Versions{
		Base:    base,
		Current: currentHash,
		Desired: fs.HashContent([]byte(req.desired)),
	})
	action := drift.Decide(state, req.policy)

	content, write, err := o.contentForAction(actionRequest{
		action:  action,
		state:   state,
		path:    req.path,
		base:    o.recordedContent(ctx, recorded, base),
		current: current,
		desired: req.desired,
		label:   req.path,
		tool:    req.toolName,
	})
	if err != nil {
		return err
	}

	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		tracked := o.getTrackedFS(ctx, tx, req.toolName, req.fileType)
		mode := defaultFileMode
		if req.mode != "" {
			if mode, err = config.ParseMode(req.mode); err != nil {
				return err
			}
			tracked = tracked.WithTargetMode(mode)
		}

		if !write {
			// Nothing is written, and nothing is recorded either: recording would
			// move the base forward to the version on disk, and the drift the user
			// asked to keep would vanish from the next run's comparison.
			return nil
		}

		if err := tracked.MkdirAll(filepath.Dir(req.path), defaultDirMode); err != nil {
			return fmt.Errorf("creating %s: %w", filepath.Dir(req.path), err)
		}
		if err := tracked.WriteFile(req.path, []byte(content), mode); err != nil {
			return fmt.Errorf("writing %s: %w", req.path, err)
		}
		if content == current {
			// WriteFile leaves an unchanged file alone and records nothing, so the
			// file would lose its base version on a run that changed nothing.
			if err := tracked.RecordExistingFile(req.path); err != nil {
				return err
			}
		}
		return o.enforceMode(tracked, req.path, req.mode)
	})
}

// actionRequest is everything deciding the bytes to write needs.
type actionRequest struct {
	action  drift.Action
	state   drift.State
	path    string
	base    string
	current string
	desired string
	label   string
	tool    string
}

// contentForAction turns a decided action into the content to write, and whether to
// write at all. Backing a file up, merging it and reporting a conflict all happen
// here so that every kind of declaration settles the same way.
func (o *Orchestrator) contentForAction(req actionRequest) (string, bool, error) {
	log := o.logger.WithTag(req.tool)

	switch req.action {
	case drift.ActionNothing:
		return req.current, false, nil

	case drift.ActionWrite:
		return req.desired, true, nil

	case drift.ActionKeep:
		log.Warn(logger.Message(fmt.Sprintf(
			"%s was changed since dotfiles last wrote it; keeping your version. Run `dotfiles diff` to see it.",
			o.contract(req.label),
		)))
		return req.current, false, nil

	case drift.ActionOverwrite:
		if _, err := backup.Move(o.fs, req.path); err != nil {
			return "", false, err
		}
		log.Warn(logger.Message(fmt.Sprintf(
			"%s was changed since dotfiles last wrote it; replacing it and keeping a backup beside it.",
			o.contract(req.label),
		)))
		return req.desired, true, nil

	case drift.ActionMerge:
		merged, err := drift.Merge(req.base, req.current, req.desired)
		if err != nil {
			// A file that cannot be merged is not a file to overwrite. Keeping it and
			// saying so leaves the user something to act on.
			log.Warn(logger.Message(fmt.Sprintf(
				"%s could not be merged (%v); keeping your version.", o.contract(req.label), err,
			)))
			return req.current, false, nil
		}
		if merged.Conflicts > 0 {
			log.Warn(logger.Message(fmt.Sprintf(
				"%s has %d conflict(s) that could not be merged; they are marked in the file with <<<<<<< markers.",
				o.contract(req.label), merged.Conflicts,
			)))
		}
		return merged.Merged, true, nil

	case drift.ActionPrompt:
		// Nothing here can ask a question: generate runs unattended in CI and from
		// the managed installer. The safe half of the answer is taken and the user is
		// told where to make the other half.
		log.Warn(logger.Message(fmt.Sprintf(
			"%s was changed since dotfiles last wrote it; keeping your version because this run cannot prompt. "+
				"Run `dotfiles diff %s` to review it.",
			o.contract(req.label), o.contract(req.label),
		)))
		return req.current, false, nil
	}

	return req.current, false, nil
}

// contract shortens a path for a message, so a home path reads as "~/.ssh/config".
func (o *Orchestrator) contract(path string) string {
	if tfs, ok := o.fs.(*fs.TrackedFileSystem); ok {
		return tfs.ContractHomePath(path)
	}
	return path
}

// recordedContent returns the version dotfiles last wrote, for a merge to use as the
// common ancestor.
//
// The registry stores a hash rather than the content itself, so the ancestor is only
// available when the file on disk still matches it. When it does not, the empty
// string is the honest answer: a merge against it reports the whole file as a
// conflict rather than inventing an ancestor that never existed.
func (o *Orchestrator) recordedContent(ctx context.Context, state *registry.FileState, base string) string {
	if state == nil {
		return ""
	}
	if state.Metadata != nil && *state.Metadata != "" {
		return *state.Metadata
	}
	if base == "" {
		return ""
	}
	return o.baseContentFor(ctx, state.FilePath, base)
}

// baseContentFor returns the content at path when it still hashes to base.
func (o *Orchestrator) baseContentFor(_ context.Context, path, base string) string {
	data, err := o.fs.ReadFile(path)
	if err != nil {
		return ""
	}
	if fs.HashContent(data) != base {
		return ""
	}
	return string(data)
}

// readIfPresent reads a file, reporting an absent one as absent rather than as an
// error, since a file that is not there yet is the ordinary first run.
func (o *Orchestrator) readIfPresent(path string) (string, bool, error) {
	data, err := o.fs.ReadFile(path)
	if err == nil {
		return string(data), true, nil
	}
	if os.IsNotExist(err) {
		return "", false, nil
	}
	return "", false, fmt.Errorf("reading %s: %w", path, err)
}

// applyBlocks applies every block a tool declares to its target file, inserting the
// block if it is not there yet, updating its body through the drift engine, and
// leaving every byte outside the markers alone.
func (o *Orchestrator) applyBlocks(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	// First, excise any block previously recorded for this tool on a target file that
	// is no longer declared.
	if err := o.cleanupStaleBlocks(ctx, tool, projCfg); err != nil {
		return err
	}

	for _, blk := range tool.Blocks {
		target, err := o.resolveTargetPath(tool, projCfg, blk.Target)
		if err != nil {
			return fmt.Errorf("tool %q: block target %q: %w", tool.Name, blk.Target, err)
		}

		style := block.StyleFor(target)
		pos := block.Position(blk.Position)
		if pos == "" {
			pos = block.Bottom
		}

		currentContent, _, err := o.readIfPresent(target)
		if err != nil {
			return err
		}

		// Find existing block in current content on disk
		region, found, err := block.Find(currentContent, blk.ID)
		if err != nil {
			return fmt.Errorf("tool %q: finding block %q in %q: %w", tool.Name, blk.ID, target, err)
		}

		currentBlockBody := ""
		currentHash := ""
		if found {
			currentBlockBody = region.Body
			currentHash = fs.HashContent([]byte(region.Body))
		}

		recorded, err := o.reg.GetBlockState(ctx, target, blk.ID)
		if err != nil {
			return fmt.Errorf("reading recorded block state for %q in %q: %w", blk.ID, target, err)
		}

		baseHash := ""
		if recorded != nil && recorded.ContentHash != nil {
			baseHash = *recorded.ContentHash
		}

		desiredBody := blk.Content
		desiredHash := fs.HashContent([]byte(desiredBody))

		state := drift.Evaluate(drift.Versions{
			Base:    baseHash,
			Current: currentHash,
			Desired: desiredHash,
		})
		action := drift.Decide(state, drift.Policy(blk.Conflict))

		baseContent := o.recordedContent(ctx, recorded, baseHash)

		bodyToWrite, shouldWrite, err := o.contentForAction(actionRequest{
			action:  action,
			state:   state,
			path:    target,
			base:    baseContent,
			current: currentBlockBody,
			desired: desiredBody,
			label:   fmt.Sprintf("%s (block %s)", target, blk.ID),
			tool:    tool.Name,
		})
		if err != nil {
			return err
		}

		if !shouldWrite {
			// User opted to keep local changes or file is already in-sync:
			// do not rewrite file or advance base hash, only enforce mode if requested.
			if blk.Mode != "" {
				err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
					tracked := o.getTrackedFS(ctx, tx, tool.Name, "block").WithBlock(blk.ID)
					return o.enforceMode(tracked, target, blk.Mode)
				})
				if err != nil {
					return err
				}
			}
			continue
		}

		newFileContent, err := block.Apply(currentContent, block.Options{
			ID:       blk.ID,
			Body:     bodyToWrite,
			Style:    style,
			Position: pos,
		})
		if err != nil {
			return fmt.Errorf("applying block %q to %q: %w", blk.ID, target, err)
		}

		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			tracked := o.getTrackedFS(ctx, tx, tool.Name, "block").WithBlock(blk.ID)
			mode := defaultFileMode
			if blk.Mode != "" {
				if mode, err = config.ParseMode(blk.Mode); err != nil {
					return err
				}
				tracked = tracked.WithTargetMode(mode)
			}

			if err := o.fs.MkdirAll(filepath.Dir(target), defaultDirMode); err != nil {
				return fmt.Errorf("creating %s: %w", filepath.Dir(target), err)
			}
			if err := o.fs.WriteFile(target, []byte(newFileContent), mode); err != nil {
				return fmt.Errorf("writing %s: %w", target, err)
			}

			record := &registry.FileOperationRecord{
				ToolName:      tool.Name,
				OperationType: "block",
				FilePath:      target,
				FileType:      "block",
				CreatedAt:     tracked.CreatedAt(),
				OperationID:   tracked.OperationID(),
				ContentHash:   ptrTo(desiredHash),
				Metadata:      ptrTo(desiredBody),
				BlockID:       &blk.ID,
			}
			if blk.Mode != "" {
				p := registry.Permission(blk.Mode)
				record.TargetMode = &p
			}
			if err := o.reg.RecordFileOperation(ctx, tx, record); err != nil {
				return err
			}
			return o.enforceMode(tracked, target, blk.Mode)
		})
		if err != nil {
			return fmt.Errorf("tool %q: block %q in %q: %w", tool.Name, blk.ID, target, err)
		}
	}

	return nil
}

// cleanupStaleBlocks removes any managed block that was recorded in SQLite for this tool
// but is no longer present in tool.Blocks.
func (o *Orchestrator) cleanupStaleBlocks(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	ops, err := o.reg.GetFileOperations(ctx, registry.FileOperationFilter{
		ToolName:      tool.Name,
		OperationType: "block",
	})
	if err != nil {
		return fmt.Errorf("querying recorded blocks for tool %q: %w", tool.Name, err)
	}

	activeBlocks := make(map[string]bool)
	for _, blk := range tool.Blocks {
		target, err := o.resolveTargetPath(tool, projCfg, blk.Target)
		if err == nil {
			activeBlocks[target+"::"+blk.ID] = true
		}
	}

	seenBlocks := make(map[string]bool)
	for _, op := range ops {
		if op.BlockID == nil || *op.BlockID == "" {
			continue
		}
		key := op.FilePath + "::" + *op.BlockID
		if activeBlocks[key] || seenBlocks[key] {
			continue
		}
		seenBlocks[key] = true

		// Check if the block is already deleted in registry
		existingBlockState, err := o.reg.GetBlockState(ctx, op.FilePath, *op.BlockID)
		if err != nil || existingBlockState == nil {
			continue
		}

		content, exists, err := o.readIfPresent(op.FilePath)
		if err != nil {
			return err
		}

		cleaned := content
		if exists {
			cleaned, err = block.Remove(content, *op.BlockID)
			if err != nil {
				return fmt.Errorf("removing stale block %q from %q: %w", *op.BlockID, op.FilePath, err)
			}
		}

		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			tracked := o.getTrackedFS(ctx, tx, tool.Name, "block").WithBlock(*op.BlockID)
			if exists && cleaned != content {
				if err := o.fs.WriteFile(op.FilePath, []byte(cleaned), defaultFileMode); err != nil {
					return err
				}
			}
			return o.reg.RecordFileOperation(ctx, tx, &registry.FileOperationRecord{
				ToolName:      tool.Name,
				OperationType: "rm",
				FilePath:      op.FilePath,
				FileType:      "block",
				CreatedAt:     tracked.CreatedAt(),
				OperationID:   tracked.OperationID(),
				BlockID:       op.BlockID,
			})
		})
		if err != nil {
			return fmt.Errorf("cleaning stale block %q in %q: %w", *op.BlockID, op.FilePath, err)
		}
		if exists && cleaned != content {
			o.logger.WithTag(tool.Name).Info(logger.Message(fmt.Sprintf(
				"Removed stale block %q from %s", *op.BlockID, o.contract(op.FilePath),
			)))
		}
	}

	return nil
}

func ptrTo[T any](val T) *T {
	return &val
}
