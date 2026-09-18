package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// completionCommandTimeout bounds a tool's own completion-generating subcommand.
// Printing a completion script is near-instant, but this runs against a binary that
// was installed moments ago and macOS verifies a newly written executable on its
// first exec, which can take seconds when several tools are installed at once.
const completionCommandTimeout = 30 * time.Second

// GenerateTools executes standalone shim, symlink, and shell script generation.
// It skips the installation pipeline except for tools with "auto: true" in their install params.
func (o *Orchestrator) GenerateTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	pruned := o.pruneToolsWithLogging(tools)
	sorted, err := TopologicalSort(pruned)
	if err != nil {
		return fmt.Errorf("resolving dependencies: %w", err)
	}

	if err := o.CleanupStaleArtifacts(ctx, sorted, projCfg); err != nil {
		o.logger.Error("Cleanup during generate warning", err)
	}

	// Ensure system directories are created and tracked under "system" name
	err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		sysFS := o.getTrackedFS(ctx, tx, "system", "shim")
		if err := sysFS.MkdirAll(projCfg.Paths.TargetDir, 0755); err != nil {
			return err
		}
		usageDir := filepath.Join(projCfg.Paths.GeneratedDir, "usage")
		if err := sysFS.MkdirAll(usageDir, 0755); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Build binaryProviders and toolMap to trace dependencies
	toolMap := make(map[string]*config.ToolConfig)
	binaryProviders := make(map[string]string)
	for _, tool := range sorted {
		toolMap[tool.Name] = tool
		bins := getBinaryNames(tool.Binaries)
		if len(bins) == 0 {
			bins = []string{tool.Name}
		}
		for _, b := range bins {
			binaryProviders[b] = tool.Name
		}
	}

	// Determine which tools need installation (either explicit auto-install or required by an auto-install tool)
	autoInstallTools := make(map[string]bool)
	for _, tool := range sorted {
		if isAutoInstall(tool) {
			autoInstallTools[tool.Name] = true
		}
	}

	// Propagate auto-install status backward to dependencies
	changed := true
	for changed {
		changed = false
		for _, tool := range sorted {
			if autoInstallTools[tool.Name] {
				for _, dep := range tool.Dependencies {
					providerName := dep
					if p, ok := binaryProviders[dep]; ok {
						providerName = p
					}
					if depTool, ok := toolMap[providerName]; ok {
						if !autoInstallTools[depTool.Name] {
							autoInstallTools[depTool.Name] = true
							changed = true
						}
					}
				}
			}
		}
	}

	failedAutoInstalls := make(map[string]bool)

	for _, tool := range sorted {
		if tool.Disabled {
			continue
		}

		if tool.Hostname != "" && !matchesHostname(tool.Hostname) {
			continue
		}

		if autoInstallTools[tool.Name] {
			// Check if any required dependency failed auto-installation
			hasFailedDep := false
			var failedDepName string
			for _, dep := range tool.Dependencies {
				providerName := dep
				if p, ok := binaryProviders[dep]; ok {
					providerName = p
				}
				if failedAutoInstalls[providerName] {
					hasFailedDep = true
					failedDepName = providerName
					break
				}
			}

			if hasFailedDep {
				failedAutoInstalls[tool.Name] = true
				o.logger.GetSubLogger("", tool.Name).Error(logger.Message(fmt.Sprintf("Auto-install failed: dependency %q failed to install", failedDepName)))
				if err := o.GenerateTool(ctx, tool, projCfg); err != nil {
					return fmt.Errorf("generating tool %q: %w", tool.Name, err)
				}
				continue
			}

			skip, err := o.shouldSkipInstallation(ctx, tool, projCfg)
			if err != nil {
				return err
			}
			if !skip {
				o.logger.GetSubLogger("", tool.Name).Info(logger.Message("Installing..."))
				if err := o.InstallTool(ctx, tool, projCfg); err != nil {
					failedAutoInstalls[tool.Name] = true
					o.logger.GetSubLogger("", tool.Name).Error(logger.Message(fmt.Sprintf("Auto-install failed: %v", err)))
					if genErr := o.GenerateTool(ctx, tool, projCfg); genErr != nil {
						return fmt.Errorf("generating tool %q fallback: %w", tool.Name, genErr)
					}
				}
			} else {
				if err := o.GenerateTool(ctx, tool, projCfg); err != nil {
					return fmt.Errorf("generating tool %q: %w", tool.Name, err)
				}
			}
		} else {
			if err := o.GenerateTool(ctx, tool, projCfg); err != nil {
				return fmt.Errorf("generating tool %q: %w", tool.Name, err)
			}
		}
	}

	if err := o.generateShellScripts(ctx, sorted, projCfg); err != nil {
		return fmt.Errorf("generating shell scripts: %w", err)
	}

	if err := o.syncTypeScriptTypes(ctx, sorted, projCfg); err != nil {
		o.logger.Error("Syncing TypeScript types warning", err)
	}

	o.logger.GetSubLogger("", "system").Info(logger.Message("DONE"))
	return nil
}

// GenerateTool generates shims and creates symlinks for a tool, recording file operations in the registry.
func (o *Orchestrator) GenerateTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}

	// 1. Resolve binaries to shim
	binaryNames := shimBinaries(tool)
	o.warnUnshimmedBinaries(tool)

	// Check DB registry for recorded binary paths
	var recordedBinaryPaths map[string]string
	if instRecord, err := o.reg.GetToolInstallation(ctx, tool.Name); err == nil && instRecord != nil && instRecord.BinaryPaths != "" {
		var paths []string
		if err := json.Unmarshal([]byte(instRecord.BinaryPaths), &paths); err == nil {
			recordedBinaryPaths = make(map[string]string)
			for _, p := range paths {
				recordedBinaryPaths[filepath.Base(p)] = p
				recordedBinaryPaths[p] = p
			}
		}
	}

	// 2. Generate Shims
	shimGen := shim.NewGenerator(o.fs)
	shimDir := projCfg.Paths.TargetDir

	for _, binName := range binaryNames {
		shimPath := filepath.Join(shimDir, binName)
		binaryPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", binName)

		if tool.InstallationMethod == "manual" {
			if manualPath := getStringParam(tool.InstallParams, "binaryPath", ""); manualPath != "" {
				if projCfg != nil {
					if resolved, err := config.ResolvePlaceholders(manualPath, tool.Name, projCfg); err == nil {
						manualPath = resolved
					}
				}
				if o.fs.IsAbs(manualPath) {
					if abs, err := o.fs.Abs(manualPath); err == nil {
						binaryPath = abs
					} else {
						binaryPath = manualPath
					}
				} else if tool.ConfigFilePath != "" {
					relPath := filepath.Join(filepath.Dir(tool.ConfigFilePath), manualPath)
					if abs, err := o.fs.Abs(relPath); err == nil {
						binaryPath = abs
					} else {
						binaryPath = relPath
					}
				} else {
					binaryPath = filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", manualPath)
				}
			}
		}

		pattern := getPatternForBinary(tool.Binaries, binName)
		if pattern != "" && (strings.Contains(pattern, "/") || strings.Contains(pattern, "\\")) && !strings.ContainsAny(pattern, "*?[") {
			binaryPath = filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", pattern)
		}

		if exists, _ := o.fs.Exists(binaryPath); !exists {
			if recPath, ok := recordedBinaryPaths[binName]; ok {
				if installer.IsRealBinaryPath(ctx, o.fs, recPath) {
					binaryPath = recPath
				}
			}
		}

		if exists, _ := o.fs.Exists(binaryPath); !exists {
			if sysBin, err := o.findSystemBinary(binName, projCfg); err == nil {
				binaryPath = sysBin
			}
		}

		// When nothing real is found the shim keeps targeting the dotfiles-managed
		// current entrypoint: for externally-managed tools the install pipeline links
		// it to wherever the package manager put the binary, so the bootstrap shim's
		// post-install re-check succeeds without guessing a system path.
		if binaryPath == shimPath || !installer.IsRealBinaryPath(ctx, o.fs, binaryPath) {
			if sysBin, err := o.findSystemBinary(binName, projCfg); err == nil && sysBin != shimPath {
				binaryPath = sysBin
			}
		}

		shimCfg := shim.Config{
			ToolName:       tool.Name,
			BinaryName:     binName,
			BinaryPath:     binaryPath,
			Sudo:           tool.Sudo,
			CliCommand:     o.getCliCommand(),
			ConfigFilePath: o.getConfigFilePath(),
			UsageLogPath:   filepath.Join(projCfg.Paths.GeneratedDir, "usage", "shim-usage.log"),
		}

		// Check for conflict
		exists, err := o.fs.Exists(shimPath)
		if err == nil && exists {
			isShim, err := shimGen.IsGeneratedShim(shimPath)
			if err == nil && !isShim {
				if !shouldOverwrite(ctx) {
					o.logger.GetSubLogger("", tool.Name).Warn(logger.Message(fmt.Sprintf("Cannot create shim for %q: conflicting file exists at %s. Use --overwrite to replace it.", binName, shimPath)))
					continue
				}
			}
		}

		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFS := o.getTrackedFS(ctx, tx, tool.Name, "shim")
			shimGenWithTx := shim.NewGenerator(activeFS)
			return shimGenWithTx.Generate(shimPath, shimCfg)
		})
		if err != nil {
			return fmt.Errorf("generating shim for %q: %w", binName, err)
		}
	}

	// 3. Create Symlinks
	if err := o.createSymlinks(ctx, tool); err != nil {
		return err
	}

	// 4. Apply copies
	if err := o.applyCopies(ctx, tool); err != nil {
		return err
	}

	// 5. Generate completions
	if err := o.GenerateCompletionsForTool(ctx, tool, projCfg); err != nil {
		o.logger.GetSubLogger("", tool.Name).Error("Failed to generate completions", err)
	}

	return nil
}

// symlinkOptions is v1's policy for .symlink() targets: a wrong or broken link is
// replaced, and a regular file or directory already at the target is kept as
// <target>.bak rather than deleted.
var symlinkOptions = symlink.Options{Overwrite: true, Backup: true}

// createSymlinks links every .symlink() declaration of a tool into place and records
// each newly created link under the tool so the stale cleanup can find it later.
// Sources resolve against the tool's directory.
func (o *Orchestrator) createSymlinks(ctx context.Context, tool *config.ToolConfig) error {
	symEvaluator := o.getSymlinkEvaluator()
	for _, sym := range tool.Symlinks {
		src := sym.Source
		if !o.fs.IsAbs(src) && tool.ConfigFilePath != "" {
			src = filepath.Join(filepath.Dir(tool.ConfigFilePath), src)
		}
		wasCreated, err := symEvaluator.CreateSymlink(src, sym.Target, symlinkOptions)
		if err != nil {
			return fmt.Errorf("creating symlink from %q to %q: %w", sym.Source, sym.Target, err)
		}
		if !wasCreated {
			continue
		}
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFS := o.getTrackedFS(ctx, tx, tool.Name, "symlink")
			return activeFS.RecordExistingSymlink(src, sym.Target)
		})
		if err != nil {
			return fmt.Errorf("recording symlink operation: %w", err)
		}
	}
	return nil
}

// applyCopies places every .copy() declaration of a tool at its target. Sources
// resolve against the tool's directory like symlink sources do, and targets go
// through the filesystem so ~ expands to the configured home. Copied files are
// written through the tracked filesystem as "copy", which is the record
// CleanupStaleCopies reaps once a declaration disappears.
func (o *Orchestrator) applyCopies(ctx context.Context, tool *config.ToolConfig) error {
	for _, cp := range tool.Copies {
		src := cp.Source
		if !o.fs.IsAbs(src) && tool.ConfigFilePath != "" {
			src = filepath.Join(filepath.Dir(tool.ConfigFilePath), src)
		}
		if err := o.copyPath(ctx, tool.Name, src, cp.Target); err != nil {
			return fmt.Errorf("copying %q to %q: %w", cp.Source, cp.Target, err)
		}
	}
	return nil
}

// copyPath copies source to target with v1's overwrite-and-backup policy: whatever
// already sits at the target is kept as <target>.bak, replacing an older backup.
// A target that already matches the source is only re-registered, so a repeated
// generate neither rewrites the copy nor displaces the backup made the first time.
func (o *Orchestrator) copyPath(ctx context.Context, toolName, source, target string) error {
	absSource, err := o.fs.Abs(source)
	if err != nil {
		return fmt.Errorf("getting absolute source path: %w", err)
	}
	absTarget, err := o.fs.Abs(target)
	if err != nil {
		return fmt.Errorf("getting absolute target path: %w", err)
	}

	if _, err := o.fs.Stat(absSource); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("source path does not exist: %s", absSource)
		}
		return fmt.Errorf("stat source path: %w", err)
	}

	_, err = o.fs.Lstat(absTarget)
	targetExists := err == nil
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lstat target path: %w", err)
	}

	if targetExists {
		same, err := sameContent(o.fs, absSource, absTarget)
		if err != nil {
			return err
		}
		if !same {
			if err := o.backupPath(absTarget); err != nil {
				return err
			}
		}
	}

	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		return copyTree(o.fs, o.getTrackedFS(ctx, tx, toolName, "copy"), absSource, absTarget)
	})
}

// backupPath moves whatever sits at path to <path>.bak, removing an older backup
// first, as v1 did before overwriting a symlink or copy target. The rename runs on
// the plain filesystem on purpose: recorded under the tool, the backup would itself
// be judged stale and removed on the next run.
func (o *Orchestrator) backupPath(path string) error {
	backup := path + ".bak"
	if _, err := o.fs.Lstat(backup); err == nil {
		if err := o.fs.RemoveAll(backup); err != nil {
			return fmt.Errorf("removing previous backup %s: %w", backup, err)
		}
	}
	if err := o.fs.Rename(path, backup); err != nil {
		return fmt.Errorf("backing up %s: %w", path, err)
	}
	return nil
}

// copyTree copies a file, or a directory recursively, into place. Files go through
// the tracked filesystem so each one is registered; a file already holding the
// source content is registered without being rewritten. Directories are created on
// the plain filesystem, because a recorded directory would be measured against the
// declared targets by CleanupStaleCopies and the parent of a copied file never is one.
func copyTree(plain fs.FS, tracked *fs.TrackedFileSystem, source, target string) error {
	info, err := plain.Stat(source)
	if err != nil {
		return fmt.Errorf("stat %s: %w", source, err)
	}

	if !info.IsDir() {
		if err := plain.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return fmt.Errorf("creating %s: %w", filepath.Dir(target), err)
		}
		if same, err := sameContent(plain, source, target); err == nil && same {
			return tracked.RecordExistingFile(target)
		}
		if err := tracked.CopyFile(source, target); err != nil {
			return fmt.Errorf("copying %s: %w", source, err)
		}
		return nil
	}

	if err := plain.MkdirAll(target, 0755); err != nil {
		return fmt.Errorf("creating %s: %w", target, err)
	}
	names, err := plain.ReadDir(source)
	if err != nil {
		return fmt.Errorf("reading %s: %w", source, err)
	}
	for _, name := range names {
		if err := copyTree(plain, tracked, filepath.Join(source, name), filepath.Join(target, name)); err != nil {
			return err
		}
	}
	return nil
}

// sameContent reports whether target already holds exactly what source holds: the
// same bytes for a file, the same members with the same content for a directory. A
// symlink at the target never counts, whatever it points at.
func sameContent(fsys fs.FS, source, target string) (bool, error) {
	srcInfo, err := fsys.Stat(source)
	if err != nil {
		return false, fmt.Errorf("stat %s: %w", source, err)
	}
	tgtInfo, err := fsys.Lstat(target)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("lstat %s: %w", target, err)
	}
	if tgtInfo.Mode()&os.ModeSymlink != 0 || srcInfo.IsDir() != tgtInfo.IsDir() {
		return false, nil
	}

	if !srcInfo.IsDir() {
		srcData, err := fsys.ReadFile(source)
		if err != nil {
			return false, fmt.Errorf("reading %s: %w", source, err)
		}
		tgtData, err := fsys.ReadFile(target)
		if err != nil {
			return false, fmt.Errorf("reading %s: %w", target, err)
		}
		return bytes.Equal(srcData, tgtData), nil
	}

	srcNames, err := fsys.ReadDir(source)
	if err != nil {
		return false, fmt.Errorf("reading %s: %w", source, err)
	}
	tgtNames, err := fsys.ReadDir(target)
	if err != nil {
		return false, fmt.Errorf("reading %s: %w", target, err)
	}
	slices.Sort(srcNames)
	slices.Sort(tgtNames)
	if !slices.Equal(srcNames, tgtNames) {
		return false, nil
	}
	for _, name := range srcNames {
		same, err := sameContent(fsys, filepath.Join(source, name), filepath.Join(target, name))
		if err != nil || !same {
			return false, err
		}
	}
	return true, nil
}

// isWithin reports whether path is dir itself or lies beneath it.
func isWithin(dir, path string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func (o *Orchestrator) CleanupStaleShims(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil || o.reg == nil {
		return nil
	}

	shimDir := projCfg.Paths.TargetDir

	for _, tool := range tools {
		if tool.Disabled || (tool.Hostname != "" && !matchesHostname(tool.Hostname)) {
			continue
		}

		expectedShimPaths := make(map[string]bool)
		for _, binName := range shimBinaries(tool) {
			shimPath := filepath.Join(shimDir, binName)
			expectedShimPaths[shimPath] = true
			if abs, err := o.fs.Abs(shimPath); err == nil {
				expectedShimPaths[abs] = true
			}
		}

		fileStates, err := o.reg.GetFileStatesForTool(ctx, tool.Name)
		if err != nil {
			continue
		}

		for _, state := range fileStates {
			if state.FileType != "shim" || state.LastOperation == "rm" {
				continue
			}

			absFilePath, err := o.fs.Abs(state.FilePath)
			if err != nil {
				absFilePath = state.FilePath
			}

			if !expectedShimPaths[absFilePath] && !expectedShimPaths[state.FilePath] {
				o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Removing stale shim: %s", o.formatPath(projCfg, state.FilePath))))

				_ = o.fs.Remove(state.FilePath)
				_ = o.fs.Remove(absFilePath)

				_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
					activeFS := o.getTrackedFS(ctx, tx, tool.Name, "shim")
					_ = activeFS.RecordRemoved(state.FilePath)
					_ = activeFS.RecordRemoved(absFilePath)
					return nil
				})
			}
		}
	}

	return nil
}

// CleanupStaleSymlinks removes symlinks recorded in the registry for active tools that are no longer declared in their symlinks list.
func (o *Orchestrator) CleanupStaleSymlinks(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil || o.reg == nil {
		return nil
	}

	symEvaluator := o.getSymlinkEvaluator()
	binariesDir := projCfg.Paths.BinariesDir
	if binariesDir == "" {
		binariesDir = filepath.Join(projCfg.Paths.GeneratedDir, "binaries")
	}

	for _, tool := range tools {
		if tool.Disabled || (tool.Hostname != "" && !matchesHostname(tool.Hostname)) {
			continue
		}

		expectedSymlinks := make(map[string]bool)
		for _, sym := range tool.Symlinks {
			expandedTarget := sym.Target
			if strings.HasPrefix(expandedTarget, "~") {
				expandedTarget = utils.ExpandHomePath(projCfg.Paths.HomeDir, expandedTarget)
			}
			expectedSymlinks[sym.Target] = true
			expectedSymlinks[expandedTarget] = true
			if absTarget, err := o.fs.Abs(expandedTarget); err == nil {
				expectedSymlinks[absTarget] = true
			}
		}

		fileStates, err := o.reg.GetFileStatesForTool(ctx, tool.Name)
		if err != nil {
			continue
		}

		for _, state := range fileStates {
			if state.FileType != "symlink" || state.LastOperation == "rm" {
				continue
			}

			// Do not treat internal installation 'current' symlinks in binariesDir as stale config symlinks
			if strings.HasPrefix(state.FilePath, binariesDir) || strings.HasSuffix(state.FilePath, "/current") {
				continue
			}

			resolvedFilePath, _ := config.ResolvePlaceholders(state.FilePath, tool.Name, projCfg)
			absFilePath, err := o.fs.Abs(resolvedFilePath)
			if err != nil {
				absFilePath = resolvedFilePath
			}

			if !expectedSymlinks[absFilePath] && !expectedSymlinks[resolvedFilePath] && !expectedSymlinks[state.FilePath] {
				o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Removing stale symlink: %s", o.formatPath(projCfg, resolvedFilePath))))

				_, _ = symEvaluator.RemoveSymlink(state.FilePath, "")
				_ = o.fs.Remove(state.FilePath)
				_ = o.fs.Remove(resolvedFilePath)
				_ = o.fs.Remove(absFilePath)

				_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
					activeFS := o.getTrackedFS(ctx, tx, tool.Name, "symlink")
					_ = activeFS.RecordRemoved(state.FilePath)
					_ = activeFS.RecordRemoved(resolvedFilePath)
					_ = activeFS.RecordRemoved(absFilePath)
					return nil
				})
			}
		}
	}

	return nil
}

// CleanupStaleCopies removes copies or completion files recorded in the registry for active tools that are no longer declared.
func (o *Orchestrator) CleanupStaleCopies(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil || o.reg == nil {
		return nil
	}

	for _, tool := range tools {
		if tool.Disabled || (tool.Hostname != "" && !matchesHostname(tool.Hostname)) {
			continue
		}

		expectedFiles := make(map[string]bool)

		// A copied directory registers each file beneath the declared target, so a
		// recorded path counts as expected when it lies inside one of these too.
		copyTargets := make(map[string]bool)
		for _, cp := range tool.Copies {
			expandedTarget := cp.Target
			if strings.HasPrefix(expandedTarget, "~") {
				expandedTarget = utils.ExpandHomePath(projCfg.Paths.HomeDir, expandedTarget)
			}
			copyTargets[cp.Target] = true
			copyTargets[expandedTarget] = true
			if absTarget, err := o.fs.Abs(expandedTarget); err == nil {
				copyTargets[absTarget] = true
			}
		}
		isExpected := func(path string) bool {
			if expectedFiles[path] || copyTargets[path] {
				return true
			}
			for dir := range copyTargets {
				if isWithin(dir, path) {
					return true
				}
			}
			return false
		}

		shellScriptsDir := shellScriptsDirOf(projCfg)

		for _, sh := range []string{"zsh", "bash"} {
			var stc *config.ShellTypeConfig
			if tool.ShellConfigs != nil {
				if sh == "zsh" {
					stc = tool.ShellConfigs.Zsh
				} else if sh == "bash" {
					stc = tool.ShellConfigs.Bash
				}
			}
			if stc != nil && stc.Completions != nil {
				completionFileName := getCompletionFileName(tool, sh, stc)
				compPath := filepath.Join(shellScriptsDir, sh, "completions", completionFileName)
				expectedFiles[compPath] = true
				if absCompPath, err := o.fs.Abs(compPath); err == nil {
					expectedFiles[absCompPath] = true
				}
			}
		}

		fileStates, err := o.reg.GetFileStatesForTool(ctx, tool.Name)
		if err != nil {
			continue
		}

		for _, state := range fileStates {
			if (state.FileType != "copy" && state.FileType != "written" && state.FileType != "completion") || state.LastOperation == "rm" {
				continue
			}

			resolvedFilePath, _ := config.ResolvePlaceholders(state.FilePath, tool.Name, projCfg)
			absFilePath, err := o.fs.Abs(resolvedFilePath)
			if err != nil {
				absFilePath = resolvedFilePath
			}

			if !isExpected(absFilePath) && !isExpected(resolvedFilePath) && !isExpected(state.FilePath) {
				o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Removing stale file: %s", o.formatPath(projCfg, resolvedFilePath))))

				_ = o.fs.Remove(resolvedFilePath)
				_ = o.fs.Remove(absFilePath)

				_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
					activeFS := o.getTrackedFS(ctx, tx, tool.Name, state.FileType)
					_ = activeFS.RecordRemoved(state.FilePath)
					_ = activeFS.RecordRemoved(resolvedFilePath)
					_ = activeFS.RecordRemoved(absFilePath)
					return nil
				})
			}
		}
	}

	return nil
}

// CleanupStaleArtifacts runs all orchestrator cleanup routines: orphaned tools, stale shims, stale symlinks, and stale copies.
func (o *Orchestrator) CleanupStaleArtifacts(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	_ = o.CleanupOrphanedTools(ctx, tools, projCfg)
	_ = o.CleanupStaleShims(ctx, tools, projCfg)
	_ = o.CleanupStaleSymlinks(ctx, tools, projCfg)
	_ = o.CleanupStaleCopies(ctx, tools, projCfg)
	return nil
}

func (o *Orchestrator) GenerateCompletionsForTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}

	if installer.IsDryRun() {
		return nil
	}

	shellScriptsDir := shellScriptsDirOf(projCfg)

	for _, sh := range []string{"zsh", "bash"} {
		var stc *config.ShellTypeConfig
		if tool.ShellConfigs != nil {
			if sh == "zsh" {
				stc = tool.ShellConfigs.Zsh
			} else if sh == "bash" {
				stc = tool.ShellConfigs.Bash
			}
		}

		if stc == nil || stc.Completions == nil {
			continue
		}

		completionFileName := getCompletionFileName(tool, sh, stc)

		completionsDir := filepath.Join(shellScriptsDir, sh, "completions")
		if err := o.fs.MkdirAll(completionsDir, 0755); err != nil {
			return fmt.Errorf("creating completions directory: %w", err)
		}

		err := o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			fsys := o.getTrackedFS(ctx, tx, tool.Name, "completion")
			completionFilePath := filepath.Join(completionsDir, completionFileName)

			switch comp := stc.Completions.(type) {
			case string:
				var srcPath string
				if fsys.IsAbs(comp) {
					srcPath = comp
				} else {
					srcPath = filepath.Join(filepath.Dir(tool.ConfigFilePath), comp)
				}
				srcPathResolved, err := o.resolvePlaceholder(srcPath, tool, projCfg)
				if err == nil {
					exists, err := fsys.Exists(srcPathResolved)
					if err == nil && exists {
						_ = fsys.Remove(completionFilePath)
						_ = fsys.Symlink(srcPathResolved, completionFilePath)
					}
				}
			case map[string]interface{}:
				if cmdVal, ok := comp["cmd"].(string); ok && cmdVal != "" {
					cmdValResolved, err := o.resolvePlaceholder(cmdVal, tool, projCfg)
					if err == nil {
						parts := strings.Fields(cmdValResolved)
						if len(parts) > 0 {
							cmdName := parts[0]
							var execPath string
							if strings.Contains(cmdName, "/") || strings.Contains(cmdName, "\\") {
								if exists, _ := fsys.Exists(cmdName); exists {
									execPath = cmdName
								}
							} else {
								// Check directly for actual tool binary in binariesDir or recorded DB paths to avoid executing shims or system PATH binaries
								toolBinPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", cmdName)
								if exists, err := fsys.Exists(toolBinPath); err == nil && exists {
									execPath = toolBinPath
								} else if instRecord, err := o.reg.GetToolInstallation(ctx, tool.Name); err == nil && instRecord != nil && instRecord.BinaryPaths != "" {
									var paths []string
									if err := json.Unmarshal([]byte(instRecord.BinaryPaths), &paths); err == nil {
										for _, p := range paths {
											if filepath.Base(p) == cmdName || p == cmdName {
												if exists, _ := fsys.Exists(p); exists {
													execPath = p
													break
												}
											}
										}
									}
								}
							}

							if execPath == "" {
								o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Skipping %s completion: binary %q not installed at %s", sh, parts[0], filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current"))))
								return nil
							}

							if exists, _ := fsys.Exists(completionFilePath); exists && !shouldOverwrite(ctx) {
								return nil
							}

							cmdName = execPath
							o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Generating %s completion using: %s", sh, cmdValResolved)))
							cmdCtx, cancel := context.WithTimeout(ctx, completionCommandTimeout)
							cmdExec := o.runner.CommandContext(cmdCtx, cmdName, parts[1:]...)
							cmdExec.SetProcessGroup(true)
							cmdExec.SetEnv(o.buildHookEnv(tool, projCfg, nil))
							output, err := cmdExec.Output()
							// The deadline shows up on the context when the runner kills the
							// process, and on the error itself when a runner surfaces it directly.
							timedOut := errors.Is(cmdCtx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded)
							cancel()

							toolLog := o.logger.GetSubLogger("", tool.Name)
							switch {
							case err != nil && timedOut:
								toolLog.Warn(logger.Message(fmt.Sprintf("Completion command %q timed out after %s; no %s completion generated for %s", cmdValResolved, completionCommandTimeout, sh, tool.Name)))
							case err != nil:
								toolLog.Warn(logger.Message(fmt.Sprintf("Completion command %q failed: %v; no %s completion generated for %s", cmdValResolved, err, sh, tool.Name)))
							default:
								if err := fsys.WriteFile(completionFilePath, output, 0644); err != nil {
									toolLog.Warn(logger.Message(fmt.Sprintf("Writing %s completion file %q for %s: %v", sh, completionFilePath, tool.Name, err)))
								}
							}
						}
					}
				} else if srcVal, ok := comp["source"].(string); ok && srcVal != "" {
					var srcPath string
					if fsys.IsAbs(srcVal) {
						srcPath = srcVal
					} else {
						srcPath = filepath.Join(filepath.Dir(tool.ConfigFilePath), srcVal)
					}
					srcPathResolved, err := o.resolvePlaceholder(srcPath, tool, projCfg)
					if err == nil {
						exists, err := fsys.Exists(srcPathResolved)
						if err == nil && exists {
							_ = fsys.Remove(completionFilePath)
							_ = fsys.Symlink(srcPathResolved, completionFilePath)
						}
					}
				}
			}
			return nil
		})
		if err != nil {
			return fmt.Errorf("generating completion for %s: %w", sh, err)
		}
	}

	return nil
}

func getCompletionFileName(tool *config.ToolConfig, sh string, stc *config.ShellTypeConfig) string {
	baseName := tool.Name
	if stc != nil && stc.Completions != nil {
		if compMap, ok := stc.Completions.(map[string]interface{}); ok {
			if binVal, ok := compMap["bin"].(string); ok && binVal != "" {
				baseName = binVal
			}
		}
	}
	if baseName == tool.Name {
		bins := getBinaryNames(tool.Binaries)
		if len(bins) > 0 {
			baseName = bins[0]
		}
	}
	if sh == "zsh" {
		return "_" + baseName
	}
	return baseName
}

func getPatternForBinary(toolBinaries []interface{}, binName string) string {
	for _, b := range toolBinaries {
		switch val := b.(type) {
		case map[string]interface{}:
			if name, ok := val["name"].(string); ok && name == binName {
				if pattern, ok := val["pattern"].(string); ok {
					return pattern
				}
			}
		case config.BinaryConfig:
			if val.Name == binName {
				return val.Pattern
			}
		case *config.BinaryConfig:
			if val != nil && val.Name == binName {
				return val.Pattern
			}
		}
	}
	return ""
}

func (o *Orchestrator) findSystemBinary(binName string, projCfg *config.ProjectConfig) (string, error) {
	shimGen := shim.NewGenerator(o.fs)

	checkBinary := func(cand string) bool {
		exists, err := o.fs.Exists(cand)
		if err != nil || !exists {
			return false
		}
		if projCfg != nil && projCfg.Paths.TargetDir != "" {
			targetDirClean := projCfg.Paths.TargetDir
			if strings.HasPrefix(targetDirClean, "~") {
				targetDirClean = utils.ExpandHomePath(projCfg.Paths.HomeDir, targetDirClean)
			}
			if abs, err := o.fs.Abs(targetDirClean); err == nil {
				targetDirClean = abs
			}
			if filepath.Dir(cand) == targetDirClean {
				return false
			}
		}
		if strings.Contains(cand, "/.generated/bin/") || strings.HasSuffix(cand, "/.generated/bin") {
			return false
		}
		isShim, err := shimGen.IsGeneratedShim(cand)
		if err == nil && isShim {
			return false
		}
		return true
	}

	// 1. Check PATH environment variable first (respecting user PATH order: Nix, custom, Homebrew, FHS)
	pathEnv := os.Getenv("PATH")
	if pathEnv != "" {
		targetDirClean := ""
		if projCfg != nil && projCfg.Paths.TargetDir != "" {
			targetDirClean = projCfg.Paths.TargetDir
			if strings.HasPrefix(targetDirClean, "~") {
				targetDirClean = utils.ExpandHomePath(projCfg.Paths.HomeDir, targetDirClean)
			}
			if abs, err := o.fs.Abs(targetDirClean); err == nil {
				targetDirClean = abs
			}
		}

		dirs := filepath.SplitList(pathEnv)
		for _, dir := range dirs {
			if dir == "" {
				continue
			}
			cleanDir := dir
			if strings.HasPrefix(cleanDir, "~") && projCfg != nil {
				cleanDir = utils.ExpandHomePath(projCfg.Paths.HomeDir, cleanDir)
			}
			if abs, err := o.fs.Abs(cleanDir); err == nil {
				cleanDir = abs
			}
			if targetDirClean != "" && cleanDir == targetDirClean {
				continue
			}
			cand := filepath.Join(cleanDir, binName)
			if checkBinary(cand) {
				return cand, nil
			}
		}
	}

	// 2. Check standard system locations as fallback
	candidates := []string{
		filepath.Join("/usr/bin", binName),
		filepath.Join("/usr/local/bin", binName),
		filepath.Join("/bin", binName),
		filepath.Join("/opt/homebrew/bin", binName),
	}
	for _, cand := range candidates {
		if checkBinary(cand) {
			return cand, nil
		}
	}

	return "", fmt.Errorf("system binary %q not found", binName)
}
