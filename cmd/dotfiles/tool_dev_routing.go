package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/devtools"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

type devRoutingFile struct {
	path   string
	mode   os.FileMode
	data   []byte
	link   string
	absent bool
	owner  string
	state  *registry.FileState
}

// Snapshot only this tool's routing targets. Generation can fail after rewriting
// some shims, and restoring the manifest alone would leave those commands changed.
func snapshotDevRouting(ctx context.Context, services *Services, tool *config.ToolConfig, previous *devtools.Record) ([]devRoutingFile, error) {
	names := tool.BinaryNames()
	if previous != nil {
		for name := range previous.Binaries {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	names = slices.Compact(names)
	files := make([]devRoutingFile, 0, len(names))
	for _, name := range names {
		if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `/\`) || filepath.Base(name) != name {
			return nil, fmt.Errorf("invalid development shim name %q", name)
		}
		file, err := readDevRoutingFile(services.FS, filepath.Join(services.ProjectConfig.Paths.TargetDir, name))
		if err != nil {
			return nil, err
		}
		files = append(files, file)
	}
	if slices.Contains(names, "dotfiles") {
		shellDir := services.ProjectConfig.Paths.ShellScriptsDir
		if shellDir == "" {
			shellDir = filepath.Join(services.ProjectConfig.Paths.GeneratedDir, "shell-scripts")
		}
		for _, ext := range []string{"zsh", "bash", "ps1"} {
			file, err := readDevRoutingFile(services.FS, filepath.Join(shellDir, "main."+ext))
			if err != nil {
				return nil, err
			}
			file.owner = "system"
			files = append(files, file)
		}
	}
	for index := range files {
		file := &files[index]
		if file.owner == "" {
			file.owner = tool.Name
		}
		if services.Registry != nil {
			state, err := services.Registry.GetFileState(ctx, file.path)
			if err != nil {
				return nil, fmt.Errorf("reading routing ownership %s: %w", file.path, err)
			}
			file.state = state
		}
	}
	return files, nil
}

func readDevRoutingFile(fsys fs.FS, path string) (devRoutingFile, error) {
	file := devRoutingFile{path: path}
	info, err := fsys.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		file.absent = true
		return file, nil
	}
	if err != nil {
		return file, fmt.Errorf("inspecting development routing %s: %w", path, err)
	}
	file.mode = info.Mode()
	switch {
	case info.Mode().IsRegular():
		file.data, err = fsys.ReadFile(path)
	case info.Mode()&os.ModeSymlink != 0:
		file.link, err = fsys.Readlink(path)
	default:
		return file, fmt.Errorf("development routing target %s is not a file or symlink", path)
	}
	if err != nil {
		return file, fmt.Errorf("reading development routing %s: %w", path, err)
	}
	return file, nil
}

func restoreDevRouting(ctx context.Context, services *Services, files []devRoutingFile) error {
	fsys := fs.Untracked(services.FS)
	var failures []error
	for _, file := range files {
		if err := restoreDevRoutingFile(fsys, file); err != nil {
			failures = append(failures, err)
			continue
		}
		if services.Registry != nil {
			if err := restoreDevRoutingState(ctx, services.Registry, file); err != nil {
				failures = append(failures, fmt.Errorf("restoring routing ownership %s: %w", file.path, err))
			}
		}
	}
	return errors.Join(failures...)
}

func restoreDevRoutingFile(fsys fs.FS, file devRoutingFile) error {
	current, err := readDevRoutingFile(fsys, file.path)
	if err == nil && current.absent == file.absent && current.mode == file.mode && current.link == file.link && bytes.Equal(current.data, file.data) {
		return nil
	}
	if err := fsys.Remove(file.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("removing failed development routing %s: %w", file.path, err)
	}
	err = nil
	switch {
	case file.absent:
	case file.mode&os.ModeSymlink != 0:
		err = fsys.Symlink(file.link, file.path)
	default:
		err = fsys.WriteFile(file.path, file.data, file.mode.Perm())
		if err == nil {
			err = fsys.Chmod(file.path, file.mode.Perm())
		}
	}
	if err != nil {
		return fmt.Errorf("restoring development routing %s: %w", file.path, err)
	}
	return nil
}

// Compensating history restores the earlier ownership and drift baseline too.
// A previously unmanaged path remains unmanaged even if generation recorded it.
func restoreDevRoutingState(ctx context.Context, reg *registry.Registry, file devRoutingFile) error {
	return reg.WithTx(ctx, func(tx *sql.Tx) error {
		record := registry.FileOperationRecord{ToolName: file.owner, FilePath: file.path, OperationType: "rm", CreatedAt: time.Now().UnixMilli(), OperationID: rand.Text()}
		if err := reg.RecordFileOperation(ctx, tx, &record); err != nil {
			return err
		}
		if file.state == nil {
			return nil
		}
		state := file.state
		record.ToolName, record.FileType = state.ToolName, state.FileType
		record.OperationType, record.TargetPath = state.LastOperation, state.TargetPath
		record.Metadata, record.SizeBytes = state.Metadata, state.SizeBytes
		record.Permissions, record.ContentHash = state.Permissions, state.ContentHash
		record.BlockID, record.TargetMode = state.BlockID, state.TargetMode
		return reg.RecordFileOperation(ctx, tx, &record)
	})
}
