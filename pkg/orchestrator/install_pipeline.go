package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/google/uuid"
)

// InstallTools executes the installation pipeline for all provided tools sequentially in topological order.
func (o *Orchestrator) InstallTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	config.ResolvePlatformConfigs(tools, "", "")
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
		uuidStr := uuid.New().String()
		stagingDir = filepath.Join(projCfg.Paths.BinariesDir, tool.Name, uuidStr)
		installDir = stagingDir
	} else {
		installDir = toolDestDir
	}

	activeFS := o.getTrackedFS(ctx, nil, tool.Name, "binary")
	installer.SetFS(inst, activeFS)
	installer.SetLogger(inst, o.logger.WithName(inst.Name()))

	if !isExternal {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
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
	case *installer.GiteaInstaller:
		installerInstance.BinDir = installDir
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
	ctx = config.WithProjectConfig(ctx, projCfg)
	res, err := inst.Install(ctx, tool)
	if err != nil {
		if !isExternal && stagingDir != "" {
			_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
				activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
				_ = removeAll(activeFSWithTx, stagingDir)
				// Try to remove parent tool directory if it is empty
				toolDir := filepath.Dir(stagingDir)
				if entries, err := activeFSWithTx.ReadDir(toolDir); err == nil && len(entries) == 0 {
					_ = activeFSWithTx.Remove(toolDir)
				}
				return nil
			})
		}
		return fmt.Errorf("running installer: %w", err)
	}

	if !isExternal && !installer.IsDryRun() {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
			if err := removeAll(activeFSWithTx, toolDestDir); err != nil {
				return err
			}
			return activeFSWithTx.Rename(stagingDir, toolDestDir)
		})
		if err != nil {
			_ = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
				activeFSWithTx := o.getTrackedFS(ctx, tx, tool.Name, "binary")
				_ = removeAll(activeFSWithTx, stagingDir)
				return nil
			})
			return fmt.Errorf("promoting staging directory to current: %w", err)
		}
	}

	// Run after-install hooks
	if !installer.IsDryRun() {
		if tool.InstallParams != nil {
			if params, ok := tool.InstallParams["hooks"].(map[string]interface{}); ok {
				if afterInstall, ok := params["after-install"].([]interface{}); ok {
					for _, hook := range afterInstall {
						hookCmdStr, ok := hook.(string)
						if !ok || hookCmdStr == "" {
							continue
						}

						o.logger.GetSubLogger("", tool.Name).Info(logger.Message(fmt.Sprintf("$ %s", hookCmdStr)))

						var runCmd exec.Cmd
						if strings.HasPrefix(hookCmdStr, "./") {
							toolConfigDir := filepath.Dir(tool.ConfigFilePath)
							scriptPath := filepath.Join(toolConfigDir, hookCmdStr)
							chmodCmd := o.runner.CommandContext(ctx, "chmod", "+x", scriptPath)
							_ = chmodCmd.Run()
							runCmd = o.runner.CommandContext(ctx, scriptPath)
							runCmd.SetDir(toolConfigDir)
						} else {
							runCmd = o.runner.CommandContext(ctx, "bash", "-c", hookCmdStr)
							runCmd.SetDir(filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current"))
						}

						writer := logger.NewLineWriter(o.logger.GetSubLogger("", tool.Name), "|")
						runCmd.SetStdout(writer)
						runCmd.SetStderr(writer)

						if err := runCmd.Run(); err != nil {
							writer.Flush()
							return fmt.Errorf("hook %q failed: %w", hookCmdStr, err)
						}
						writer.Flush()
					}
				}
			}
		}
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

	// 4. Create Symlinks
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

	// 5. Insert Database Entry for Tool Installation
	if !installer.IsDryRun() {
		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			now := time.Now().UnixMilli()
			binariesJSON, _ := json.Marshal(binaryNames)

			var versionStr string
			if tool.Version != nil {
				versionStr = *tool.Version
			} else {
				versionStr = "latest"
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

// UninstallTool uninstalls a tool, deletes its registered shims, symlinks, and files, and purges its db entries.
func (o *Orchestrator) UninstallTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}

	o.logger.Info(logger.Message(fmt.Sprintf("Uninstalling tool: %s", tool.Name)))

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
		o.logger.Info(logger.Message(fmt.Sprintf("Cleaning up orphaned tool: %s", toolName)))
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
