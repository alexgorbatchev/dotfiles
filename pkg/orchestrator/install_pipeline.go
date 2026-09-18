package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/lifecycle"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

// InstallTools executes the installation pipeline for all provided tools sequentially in topological order.
func (o *Orchestrator) InstallTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	pruned := pruneTools(tools)
	sorted, err := TopologicalSort(pruned)
	if err != nil {
		return fmt.Errorf("resolving dependencies: %w", err)
	}

	if err := o.CleanupStaleArtifacts(ctx, sorted, projCfg); err != nil {
		o.logger.Error("Cleanup during install warning", err)
	}

	for _, tool := range sorted {
		if tool.Disabled {
			continue
		}

		if tool.Hostname != "" && !matchesHostname(tool.Hostname) {
			continue
		}

		if err := o.InstallTool(ctx, tool, projCfg); err != nil {
			return fmt.Errorf("installing tool %q: %w", tool.Name, err)
		}
	}

	if err := o.generateShellScripts(ctx, sorted, projCfg); err != nil {
		return fmt.Errorf("generating shell scripts: %w", err)
	}

	if err := o.syncTypeScriptTypes(ctx, sorted, projCfg); err != nil {
		o.logger.Error("Syncing TypeScript types warning", err)
	}

	return nil
}

func isAutoInstall(tool *config.ToolConfig) bool {
	if tool == nil || tool.InstallParams == nil {
		return false
	}
	autoVal, ok := tool.InstallParams["auto"]
	if !ok {
		return false
	}
	switch val := autoVal.(type) {
	case bool:
		return val
	case string:
		return val == "true"
	}
	return false
}

// InstallTool installs a single tool, generates shims, creates symlinks, and records the state.
func (o *Orchestrator) InstallTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}

	skip, err := o.shouldSkipInstallation(ctx, tool, projCfg)
	if err != nil {
		return err
	}
	if skip {
		return o.GenerateTool(ctx, tool, projCfg)
	}

	if tool.InstallationMethod == "" {
		if len(tool.Binaries) > 0 {
			return fmt.Errorf("installation method not specified")
		}
		// For shell-only tools (which have no installation method), proceed directly to generate shims, copies, and symlinks.
		return o.GenerateTool(ctx, tool, projCfg)
	}

	inst, err := o.instRegistry.Get(tool.InstallationMethod)
	if err != nil {
		return fmt.Errorf("getting installer: %w", err)
	}

	if err := installer.ValidateSudo(inst, tool); err != nil {
		return err
	}

	// Dynamically configure BinDir and BaseURL if supported by the installer
	isExternal := isExternallyManaged(tool.InstallationMethod)
	toolDestDir := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current")
	var stagingDir string
	var installDir string

	if !isExternal {
		stagingDir = filepath.Join(projCfg.Paths.BinariesDir, tool.Name, ".staging")
		installDir = stagingDir
	} else {
		installDir = toolDestDir
	}

	activeFS := o.getTrackedFS(ctx, nil, tool.Name, "binary")
	installer.SetFS(inst, activeFS)
	installer.SetLogger(inst, o.logger.WithName(inst.Name()))

	downloadCacheDir := filepath.Join(".generated", "cache", "downloads")
	if projCfg.Paths.GeneratedDir != "" {
		downloadCacheDir = filepath.Join(projCfg.Paths.GeneratedDir, "cache", "downloads")
	}
	var downloadCacheTTL time.Duration = 30 * 24 * time.Hour
	if projCfg.Downloader.Cache.TTL > 0 {
		downloadCacheTTL = time.Duration(projCfg.Downloader.Cache.TTL) * time.Millisecond
	}
	downloadCacheEnabled := true
	installer.SetDownloadCache(inst, downloadCacheDir, downloadCacheTTL, downloadCacheEnabled)

	if !isExternal {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
			if err := removeAll(activeFSWithTx, stagingDir); err != nil {
				return fmt.Errorf("cleaning stale staging directory: %w", err)
			}
			return activeFSWithTx.MkdirAll(stagingDir, 0755)
		})
		if err != nil {
			return fmt.Errorf("creating staging directory: %w", err)
		}
	}

	switch installerInstance := inst.(type) {
	case *installer.GitHubInstaller:
		installerInstance.BinDir = installDir
		if projCfg.Github.Host != "" {
			installerInstance.BaseURL = projCfg.Github.Host
		}
		if projCfg.Paths.GeneratedDir != "" {
			installerInstance.CacheDir = filepath.Join(projCfg.Paths.GeneratedDir, "cache", "github-api")
		}
		if projCfg.Github.Cache.TTL > 0 {
			installerInstance.CacheTTL = time.Duration(projCfg.Github.Cache.TTL) * time.Millisecond
		}
	case *installer.GiteaInstaller:
		installerInstance.BinDir = installDir
		if projCfg.Paths.GeneratedDir != "" {
			installerInstance.CacheDir = filepath.Join(projCfg.Paths.GeneratedDir, "cache", "gitea-api")
		}
	case *installer.CargoInstaller:
		installerInstance.BinDir = installDir
	case *installer.CurlBinaryInstaller:
		installerInstance.BinDir = installDir
	case *installer.CurlScriptInstaller:
		installerInstance.BinDir = installDir
	case *installer.CurlTarInstaller:
		installerInstance.BinDir = installDir
	case *installer.DmgInstaller:
		installerInstance.BinDir = installDir
	case *installer.ManualInstaller:
		installerInstance.BinDir = installDir
	case *installer.ZshPluginInstaller:
		installerInstance.BinDir = installDir
	case *installer.PkgInstaller:
		installerInstance.BinDir = installDir
	}

	// 1. Download, unpack, and install via the native installer plugin
	beforeInstallCtx := vm.HookContext{StagingDir: stagingDir, Env: o.buildHookEnv(tool, projCfg, nil)}
	if err := o.runHooks(ctx, vm.HookBeforeInstall, tool, projCfg, beforeInstallCtx); err != nil {
		return fmt.Errorf("running before-install hooks: %w", err)
	}

	ctx = config.WithProjectConfig(ctx, projCfg)
	// Downloading and extraction happen inside the installer, so it announces them
	// through the context rather than the orchestrator guessing when they occurred.
	ctx = lifecycle.WithEmitter(ctx, func(emitCtx context.Context, event lifecycle.Event, details lifecycle.Details) error {
		return o.runHooks(emitCtx, string(event), tool, projCfg, vm.HookContext{
			StagingDir:   stagingDir,
			DownloadPath: details.DownloadPath,
			ExtractDir:   details.ExtractDir,
			Env:          o.buildHookEnv(tool, projCfg, nil),
		})
	})
	res, err := inst.Install(ctx, tool)
	if err != nil {
		if !isExternal {
			o.discardStaging(ctx, tool.Name, stagingDir)
		}
		return err
	}

	if !isExternal && !installer.IsDryRun() {
		if err := o.requireStagedPayload(ctx, tool, activeFS, stagingDir); err != nil {
			return err
		}
	}

	if isExternal && !installer.IsDryRun() {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
			toolDir := filepath.Join(projCfg.Paths.BinariesDir, tool.Name)
			externalDir := filepath.Join(toolDir, "external")
			if err := activeFSWithTx.MkdirAll(externalDir, 0755); err != nil {
				return err
			}
			for _, binPath := range res.Binaries {
				if binPath != "" {
					binName := filepath.Base(binPath)
					destBinSymlink := filepath.Join(externalDir, binName)
					_ = activeFSWithTx.Remove(destBinSymlink)
					_ = activeFSWithTx.Symlink(binPath, destBinSymlink)
				}
			}
			currentSymlink := filepath.Join(toolDir, "current")
			_ = activeFSWithTx.Remove(currentSymlink)
			return activeFSWithTx.Symlink("external", currentSymlink)
		})
		if err != nil {
			return fmt.Errorf("creating external symlink: %w", err)
		}
	} else if !isExternal && !installer.IsDryRun() {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
			if err := removeAll(activeFSWithTx, toolDestDir); err != nil {
				return err
			}
			return activeFSWithTx.Rename(stagingDir, toolDestDir)
		})
		if err != nil {
			o.discardStaging(ctx, tool.Name, stagingDir)
			return fmt.Errorf("promoting staging directory to current: %w", err)
		}
	}

	// Run after-install hooks
	afterInstallCtx := vm.HookContext{
		StagingDir:   stagingDir,
		InstalledDir: toolDestDir,
		Env:          o.buildHookEnv(tool, projCfg, res),
	}
	if res != nil {
		afterInstallCtx.BinaryPaths = res.Binaries
		afterInstallCtx.Version = res.Version
	}
	if err := o.runHooks(ctx, vm.HookAfterInstall, tool, projCfg, afterInstallCtx); err != nil {
		return fmt.Errorf("running after-install hooks: %w", err)
	}

	// 2. Resolve binaries to shim
	var binaryNames []string
	if res != nil {
		binaryNames = res.Binaries
	}
	if len(binaryNames) == 0 {
		binaryNames = getBinaryNames(tool.Binaries)
	}

	// 3. Generate Shims
	shimGen := shim.NewGenerator(o.fs)
	shimDir := projCfg.Paths.TargetDir

	var recordedBinaryPaths []string

	for _, binItem := range binaryNames {
		var binName string
		var binaryPath string

		absBinItem := binItem
		if o.fs.IsAbs(binItem) {
			if abs, err := o.fs.Abs(binItem); err == nil {
				absBinItem = abs
			}
		}

		if filepath.IsAbs(absBinItem) && installer.IsRealBinaryPath(ctx, o.fs, absBinItem) {
			binName = filepath.Base(absBinItem)
			binaryPath = absBinItem
		} else {
			binName = filepath.Base(binItem)
			binaryPath = filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current", binName)
			if isExternal {
				if sysBin, err := o.findSystemBinary(binName, projCfg); err == nil {
					binaryPath = sysBin
				}
			}
		}

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

		shimPath := filepath.Join(shimDir, binName)

		// An externally-managed binary the installer could not locate keeps the
		// current entrypoint as its target rather than a guessed system path; the
		// entrypoint symlink created above is what the shim re-checks after installing.
		if binaryPath == shimPath || !installer.IsRealBinaryPath(ctx, o.fs, binaryPath) {
			if sysBin, err := o.findSystemBinary(binName, projCfg); err == nil && sysBin != shimPath {
				binaryPath = sysBin
			}
		}

		recordedBinaryPaths = append(recordedBinaryPaths, binaryPath)

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

	// 4. Create Symlinks
	symEvaluator := o.getSymlinkEvaluator()
	for _, sym := range tool.Symlinks {
		src := sym.Source
		if !o.fs.IsAbs(src) && tool.ConfigFilePath != "" {
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

	// 5. Apply copies
	if err := o.applyCopies(ctx, tool); err != nil {
		return err
	}

	// 6. Insert Database Entry for Tool Installation
	if !installer.IsDryRun() {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			now := time.Now().UnixMilli()
			binariesJSON, _ := json.Marshal(recordedBinaryPaths)

			var versionStr string
			if tool.Version != nil && *tool.Version != "" && *tool.Version != "latest" && *tool.Version != "unknown" {
				versionStr = *tool.Version
			} else if res != nil && res.Version != "" && res.Version != "latest" && res.Version != "unknown" {
				versionStr = res.Version
			} else {
				versionStr = utils.GenerateTimestamp()
			}

			installPath := filepath.Join(projCfg.Paths.BinariesDir, tool.Name)

			instRecord := &registry.ToolInstallationRecord{
				ToolName:          tool.Name,
				Version:           versionStr,
				InstallPath:       installPath,
				Timestamp:         time.Now().Format(time.RFC3339),
				InstalledAt:       now,
				BinaryPaths:       string(binariesJSON),
				ConfiguredVersion: tool.Version,
				InstallMethod:     &tool.InstallationMethod,
			}
			return o.reg.RecordToolInstallation(ctx, tx, instRecord)
		})
		if err != nil {
			return fmt.Errorf("recording tool installation: %w", err)
		}
	}

	// 6. Generate completions (matches TS reconcileToolArtifacts)
	if err := o.GenerateCompletionsForTool(ctx, tool, projCfg); err != nil {
		o.logger.GetSubLogger("", tool.Name).Error("Failed to generate completions", err)
	}

	return nil
}

// requireStagedPayload fails an install whose before-install hook was meant to stage
// the tool's files but left the staging directory empty.
//
// A before-install hook is handed stagingDir so it can put files there; for a manual
// tool without binaryPath it is the only thing that ever does. Promoting an empty
// directory would make the tool look installed while nothing was, so the attempt is
// discarded and reported instead.
func (o *Orchestrator) requireStagedPayload(ctx context.Context, tool *config.ToolConfig, fsys fs.FS, stagingDir string) error {
	if !vm.HasHook(tool, vm.HookBeforeInstall) {
		return nil
	}
	entries, err := fsys.ReadDir(stagingDir)
	if err != nil {
		o.discardStaging(ctx, tool.Name, stagingDir)
		return fmt.Errorf("inspecting staging directory %s: %w", stagingDir, err)
	}
	if len(entries) > 0 {
		return nil
	}
	o.discardStaging(ctx, tool.Name, stagingDir)
	return fmt.Errorf(
		"staging directory %s is empty after the before-install hook and the %q installer ran: nothing was staged into stagingDir",
		stagingDir, tool.InstallationMethod,
	)
}

// discardStaging removes a staging directory that will not be promoted, and the tool's
// directory with it when nothing else is left there, so a failed attempt leaves no
// trace. Cleanup is best-effort: the error that caused the discard is what the caller
// reports, and a cleanup failure must not displace it.
func (o *Orchestrator) discardStaging(ctx context.Context, toolName, stagingDir string) {
	if stagingDir == "" {
		return
	}
	_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		activeFSWithTx := o.getTrackedFS(ctx, tx, toolName, "binary")
		_ = removeAll(activeFSWithTx, stagingDir)
		toolDir := filepath.Dir(stagingDir)
		if entries, err := activeFSWithTx.ReadDir(toolDir); err == nil && len(entries) == 0 {
			_ = activeFSWithTx.Remove(toolDir)
		}
		return nil
	})
}

// UninstallTool uninstalls a tool, deletes its registered shims, symlinks, and files, and purges its db entries.
func (o *Orchestrator) UninstallTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}

	o.logger.GetSubLogger("", tool.Name).Info(logger.Message("Uninstalling..."))

	// 1. Invoke the native installer plugin's Uninstall method if it exists
	if tool.InstallationMethod != "" && o.instRegistry != nil {
		if inst, err := o.instRegistry.Get(tool.InstallationMethod); err == nil && inst != nil {
			_ = inst.Uninstall(ctx, tool)
		}
	}

	// 2. Purge file operations, shims, symlinks, binaries dir, and DB entries
	return o.purgeToolState(ctx, tool.Name, projCfg)
}

func (o *Orchestrator) purgeToolState(ctx context.Context, toolName string, projCfg *config.ProjectConfig) error {
	fileStates, err := o.reg.GetFileStatesForTool(ctx, toolName)
	if err == nil {
		for _, fileState := range fileStates {
			if fileState.LastOperation != "rm" {
				exists, err := o.fs.Exists(fileState.FilePath)
				if err == nil && exists {
					_ = o.fs.Remove(fileState.FilePath)
				}
			}
		}
	}

	if projCfg != nil && projCfg.Paths.BinariesDir != "" {
		toolBinDir := filepath.Join(projCfg.Paths.BinariesDir, toolName)
		_ = removeAll(o.fs, toolBinDir)
	}

	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		if err := o.reg.RemoveFileOperationsByTool(ctx, tx, toolName); err != nil {
			return err
		}
		return o.reg.RemoveToolInstallation(ctx, tx, toolName)
	})
}

// CleanupOrphanedTools removes tools that are registered in the registry DB but no longer present in active tool configs.
func (o *Orchestrator) CleanupOrphanedTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil || o.reg == nil {
		return nil
	}

	activeTools := make(map[string]bool)
	for _, tool := range tools {
		if !tool.Disabled && (tool.Hostname == "" || matchesHostname(tool.Hostname)) {
			activeTools[tool.Name] = true
		}
	}

	registeredToolsMap := make(map[string]bool)

	opsTools, err := o.reg.GetRegisteredTools(ctx)
	if err == nil {
		for _, name := range opsTools {
			if name != "system" {
				registeredToolsMap[name] = true
			}
		}
	}

	installations, err := o.reg.GetAllToolInstallations(ctx)
	if err == nil {
		for _, inst := range installations {
			if inst.ToolName != "system" {
				registeredToolsMap[inst.ToolName] = true
			}
		}
	}

	var orphanedTools []string
	for name := range registeredToolsMap {
		if !activeTools[name] {
			orphanedTools = append(orphanedTools, name)
		}
	}
	sort.Strings(orphanedTools)

	for _, toolName := range orphanedTools {
		o.logger.GetSubLogger("", toolName).Info(logger.Message("Cleaning up orphaned tool..."))
		if err := o.cleanupToolArtifacts(ctx, toolName, projCfg); err != nil {
			o.logger.GetSubLogger("", toolName).Error("Failed to cleanup orphaned tool", err)
		}
	}

	return nil
}

func (o *Orchestrator) cleanupToolArtifacts(ctx context.Context, toolName string, projCfg *config.ProjectConfig) error {
	fileStates, err := o.reg.GetFileStatesForTool(ctx, toolName)
	if err == nil {
		for _, fileState := range fileStates {
			if fileState.FileType == "shim" || fileState.FileType == "symlink" || fileState.FileType == "copy" || fileState.FileType == "completion" {
				if fileState.LastOperation != "rm" {
					exists, err := o.fs.Exists(fileState.FilePath)
					if err == nil && exists {
						_ = o.fs.Remove(fileState.FilePath)
					}
				}
			}
		}
	}

	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		if err := o.reg.RemoveFileOperationsByTool(ctx, tx, toolName); err != nil {
			return err
		}
		return o.reg.RemoveToolInstallation(ctx, tx, toolName)
	})
}

func isExactTopLevelVersion(v string) bool {
	if strings.ContainsAny(v, "^~><=") {
		return false
	}
	return true
}

func (o *Orchestrator) buildHookEnv(tool *config.ToolConfig, projCfg *config.ProjectConfig, res *installer.InstallResult) []string {
	var pathDirs []string

	if projCfg != nil {
		if tool != nil {
			toolDestDir := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current")
			pathDirs = append(pathDirs, toolDestDir)

			if res != nil {
				for _, b := range res.Binaries {
					absB := b
					if o.fs.IsAbs(b) {
						if abs, err := o.fs.Abs(b); err == nil {
							absB = abs
						}
					}
					if filepath.IsAbs(absB) {
						pathDirs = append(pathDirs, filepath.Dir(absB))
					} else {
						pathDirs = append(pathDirs, filepath.Join(toolDestDir, filepath.Dir(b)))
					}
				}
			}
		}

		if projCfg.Paths.TargetDir != "" {
			pathDirs = append(pathDirs, projCfg.Paths.TargetDir)
		}
	}

	if currentPath := os.Getenv("PATH"); currentPath != "" {
		pathDirs = append(pathDirs, filepath.SplitList(currentPath)...)
	}

	standardDirs := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	}
	pathDirs = append(pathDirs, standardDirs...)

	seen := make(map[string]bool)
	var uniquePaths []string
	for _, p := range pathDirs {
		clean := filepath.Clean(p)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		uniquePaths = append(uniquePaths, clean)
	}

	joinedPath := strings.Join(uniquePaths, string(os.PathListSeparator))

	envMap := make(map[string]string)
	for _, kv := range os.Environ() {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}

	envMap["PATH"] = joinedPath

	if tool != nil && tool.ShellConfigs != nil {
		if tool.ShellConfigs.Zsh != nil {
			for k, v := range tool.ShellConfigs.Zsh.Env {
				envMap[k] = v
			}
		}
		if tool.ShellConfigs.Bash != nil {
			for k, v := range tool.ShellConfigs.Bash.Env {
				envMap[k] = v
			}
		}
	}

	envSlice := make([]string, 0, len(envMap))
	for k, v := range envMap {
		envSlice = append(envSlice, fmt.Sprintf("%s=%s", k, v))
	}

	return envSlice
}

func (o *Orchestrator) runHooks(ctx context.Context, event string, tool *config.ToolConfig, projCfg *config.ProjectConfig, hookCtx vm.HookContext) error {
	if installer.IsDryRun() || tool == nil {
		return nil
	}
	return vm.RunHook(ctx, o.logger, o.fs, o.runner, tool, projCfg, event, hookCtx, vm.Target{})
}
