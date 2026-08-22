package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

// GenerateTools executes standalone shim, symlink, and shell script generation.
// It skips the installation pipeline except for tools with "auto: true" in their install params.
func (o *Orchestrator) GenerateTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	config.ResolvePlatformConfigs(tools, "", "")
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

	for _, tool := range sorted {
		if tool.Disabled {
			continue
		}

		if tool.Hostname != "" && !matchesHostname(tool.Hostname) {
			continue
		}

		if isAutoInstall(tool) {
			skip, err := o.shouldSkipInstallation(ctx, tool, projCfg)
			if err != nil {
				return err
			}
			if !skip {
				o.logger.Info(logger.Message(fmt.Sprintf("Installing tool: %s", tool.Name)))
				if err := o.InstallTool(ctx, tool, projCfg); err != nil {
					o.logger.GetSubLogger("", tool.Name).Error("Auto-install failed", err)
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

	// Skip shim generation for manual tools without binaryPath
	if tool.InstallationMethod == "manual" {
		binaryPath := getStringParam(tool.InstallParams, "binaryPath", "")
		if binaryPath == "" {
			o.logger.GetSubLogger("", tool.Name).Warn(logger.Message("Skipping shim generation (manual tool has .bin() but no binaryPath — use shell functions instead)"))
			return nil
		}
	}

	// 1. Resolve binaries to shim
	binaryNames := getBinaryNames(tool.Binaries)

	// 2. Generate Shims
	shimGen := shim.NewGenerator(o.fs)
	shimDir := projCfg.Paths.TargetDir

	for _, binName := range binaryNames {
		shimPath := filepath.Join(shimDir, binName)
		binaryPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", binName)

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
	symEvaluator := o.getSymlinkEvaluator()
	for _, sym := range tool.Symlinks {
		src := sym.Source
		if !filepath.IsAbs(src) && tool.ConfigFilePath != "" {
			src = filepath.Join(filepath.Dir(tool.ConfigFilePath), src)
		}
		wasCreated, err := symEvaluator.CreateSymlink(src, sym.Target, symlink.Options{Overwrite: true})
		if err != nil {
			return fmt.Errorf("creating symlink from %q to %q: %w", sym.Source, sym.Target, err)
		}

		if wasCreated {
			err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
				activeFS := o.getTrackedFS(ctx, tx, tool.Name, "symlink")
				return activeFS.RecordExistingSymlink(src, sym.Target)
			})
			if err != nil {
				return fmt.Errorf("recording symlink operation: %w", err)
			}
		}
	}

	// 4. Generate completions
	if err := o.GenerateCompletionsForTool(ctx, tool, projCfg); err != nil {
		o.logger.GetSubLogger("", tool.Name).Error("Failed to generate completions", err)
	}

	return nil
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
		binNames := getBinaryNames(tool.Binaries)

		isManualWithoutBinPath := false
		if tool.InstallationMethod == "manual" {
			binaryPath := getStringParam(tool.InstallParams, "binaryPath", "")
			if binaryPath == "" {
				isManualWithoutBinPath = true
			}
		}

		if !isManualWithoutBinPath {
			for _, binName := range binNames {
				shimPath := filepath.Join(shimDir, binName)
				expectedShimPaths[shimPath] = true
				if abs, err := o.fs.Abs(shimPath); err == nil {
					expectedShimPaths[abs] = true
				}
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
					return activeFS.Remove(state.FilePath)
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

			absFilePath, err := o.fs.Abs(state.FilePath)
			if err != nil {
				absFilePath = state.FilePath
			}

			if !expectedSymlinks[absFilePath] && !expectedSymlinks[state.FilePath] {
				o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Removing stale symlink: %s", o.formatPath(projCfg, state.FilePath))))

				_, _ = symEvaluator.RemoveSymlink(state.FilePath, "")
				_ = o.fs.Remove(state.FilePath)
				_ = o.fs.Remove(absFilePath)

				_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
					activeFS := o.getTrackedFS(ctx, tx, tool.Name, "symlink")
					return activeFS.Remove(state.FilePath)
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

		for _, cp := range tool.Copies {
			expandedTarget := cp.Target
			if strings.HasPrefix(expandedTarget, "~") {
				expandedTarget = utils.ExpandHomePath(projCfg.Paths.HomeDir, expandedTarget)
			}
			expectedFiles[cp.Target] = true
			expectedFiles[expandedTarget] = true
			if absTarget, err := o.fs.Abs(expandedTarget); err == nil {
				expectedFiles[absTarget] = true
			}
		}

		shellScriptsDir := projCfg.Paths.ShellScriptsDir
		if shellScriptsDir == "" {
			shellScriptsDir = filepath.Join(projCfg.Paths.GeneratedDir, "shell-scripts")
		}

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

			if !expectedFiles[absFilePath] && !expectedFiles[resolvedFilePath] && !expectedFiles[state.FilePath] {
				o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Removing stale file: %s", o.formatPath(projCfg, resolvedFilePath))))

				_ = o.fs.Remove(resolvedFilePath)
				_ = o.fs.Remove(absFilePath)

				_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
					activeFS := o.getTrackedFS(ctx, tx, tool.Name, state.FileType)
					return activeFS.Remove(state.FilePath)
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

	shellScriptsDir := projCfg.Paths.ShellScriptsDir
	if shellScriptsDir == "" {
		shellScriptsDir = filepath.Join(projCfg.Paths.GeneratedDir, "shell-scripts")
	}

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
				if filepath.IsAbs(comp) {
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
								// Check directly for actual tool binary in binariesDir to avoid executing the shim
								toolBinPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", cmdName)
								if exists, err := fsys.Exists(toolBinPath); err == nil && exists {
									execPath = toolBinPath
								}
							}

							if execPath == "" {
								o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Skipping %s completion for %s: binary %q not installed at %s", sh, tool.Name, parts[0], filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current"))))
								return nil
							}

							cmdName = execPath
							o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("Generating %s completion using: %s", sh, cmdValResolved)))
							cmdCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
							cmdExec := o.runner.CommandContext(cmdCtx, cmdName, parts[1:]...)
							cmdExec.SetProcessGroup(true)
							pathEnv := os.Getenv("PATH")
							newPathEnv := projCfg.Paths.TargetDir + string(filepath.ListSeparator) + pathEnv
							cmdExec.SetEnv(append(os.Environ(), "PATH="+newPathEnv))
							output, err := cmdExec.Output()
							cancel()
							if err == nil {
								_ = fsys.WriteFile(completionFilePath, output, 0644)
							} else {
								o.logger.GetSubLogger("", tool.Name).Warn(logger.Message(fmt.Sprintf("Completion command %q failed or timed out: %v", cmdValResolved, err)))
							}
						}
					}
				} else if srcVal, ok := comp["source"].(string); ok && srcVal != "" {
					var srcPath string
					if filepath.IsAbs(srcVal) {
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
