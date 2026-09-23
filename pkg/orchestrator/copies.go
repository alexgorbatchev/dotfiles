package orchestrator

import (
	"context"
	"fmt"
	"os"
	"slices"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/drift"
)

// applyCopies places every .copy() declaration of a tool at its target.
//
// Each copied file is settled by the drift engine under the declaration's conflict
// policy, exactly as a template is: the source's bytes are the desired version, the
// recorded "copy" operation is the base, and the file on disk is the current one. A
// directory copy is settled file by file (drift.CopyMembers), so an edit to one member
// is weighed on its own rather than displacing the whole tree. Files are recorded as
// "copy", which is the record CleanupStaleCopies reaps once a declaration, or a member
// of a copied directory, disappears.
func (o *Orchestrator) applyCopies(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	for _, cp := range tool.Copies {
		if err := o.applyCopy(ctx, tool, projCfg, cp); err != nil {
			return fmt.Errorf("tool %q: copying %q to %q: %w", tool.Name, cp.Source, cp.Target, err)
		}
	}
	return nil
}

func (o *Orchestrator) applyCopy(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig, cp config.CopyConfig) error {
	// Parsed before anything is moved aside, so a mode the copy cannot apply fails the
	// copy while the target is still the user's.
	if cp.Mode != "" {
		if _, err := config.ParseMode(cp.Mode); err != nil {
			return err
		}
	}

	target, err := config.ResolveTargetPath(cp.Target, tool.Name, projCfg)
	if err != nil {
		return err
	}
	source := o.resolveSourcePath(tool, cp.Source)

	if _, err := o.fs.Stat(source); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("source path does not exist: %s", source)
		}
		return fmt.Errorf("stat source path: %w", err)
	}

	members, err := drift.CopyMembers(o.fs, source, target)
	if err != nil {
		return err
	}
	policy := drift.Policy(cp.Conflict)
	// A directory the policy kept in place (a symlink or a plain file where the copy
	// needs a directory) is left alone together with everything beneath it.
	var keptDirs []drift.CopyMember
	for _, member := range members {
		if slices.ContainsFunc(keptDirs, func(dir drift.CopyMember) bool { return dir.Contains(member) }) {
			continue
		}
		proceed, err := o.clearForeignCopyTarget(tool.Name, member.Target, member.Dir, policy)
		if err != nil {
			return err
		}
		switch {
		case !proceed && member.Dir:
			keptDirs = append(keptDirs, member)
		case !proceed:
		case member.Dir:
			// Created on the plain filesystem: a recorded directory would be a
			// "copy" no declaration names, and CleanupStaleCopies would remove it.
			if err := o.fs.MkdirAll(member.Target, defaultDirMode); err != nil {
				return fmt.Errorf("creating %s: %w", member.Target, err)
			}
		default:
			if err := o.settleCopyFile(ctx, tool.Name, member, cp.Mode, policy); err != nil {
				return err
			}
		}
	}
	return nil
}

// settleCopyFile settles one copied file through settleWholeFile.
func (o *Orchestrator) settleCopyFile(ctx context.Context, toolName string, member drift.CopyMember, mode string, policy drift.Policy) error {
	data, err := o.fs.ReadFile(member.Source)
	if err != nil {
		return fmt.Errorf("reading %s: %w", member.Source, err)
	}
	info, err := o.fs.Stat(member.Source)
	if err != nil {
		return fmt.Errorf("stat %s: %w", member.Source, err)
	}

	return o.settleWholeFile(ctx, wholeFileRequest{
		toolName: toolName,
		fileType: "copy",
		path:     member.Target,
		desired:  string(data),
		mode:     mode,
		// Copying a file keeps its permission, so an executable script stays
		// executable at its target unless the declaration states a mode.
		source:      member.Source,
		defaultMode: info.Mode().Perm(),
		policy:      policy,
	})
}

// clearForeignCopyTarget deals with a target a copy cannot settle as its own (see
// drift.ForeignEntry). Such an entry has no recorded base, so it is decided as
// drift.StateUnmanaged under the declared policy: moved aside to a backup, or kept
// with a warning. It reports whether the copy may go ahead.
func (o *Orchestrator) clearForeignCopyTarget(toolName, target string, wantDir bool, policy drift.Policy) (bool, error) {
	foreign, err := drift.ForeignEntry(o.fs, target, wantDir)
	if err != nil || !foreign {
		return err == nil, err
	}
	_, proceed, err := o.contentForAction(actionRequest{
		action: drift.Decide(drift.StateUnmanaged, policy),
		state:  drift.StateUnmanaged,
		path:   target,
		label:  target,
		tool:   toolName,
	})
	return proceed, err
}
