package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shellinit"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
	"github.com/google/uuid"
)

// Orchestrator manages tool installation pipelines.
type Orchestrator struct {
	logger         *logger.Logger
	fs             fs.FS
	runner         exec.CommandRunner
	reg            *registry.Registry
	instRegistry   *installer.Registry
	symlinkFS      fs.FS
	configFilePath string
}

// NewOrchestrator creates a new Orchestrator instance.
func NewOrchestrator(log *logger.Logger, fsys fs.FS, runner exec.CommandRunner, reg *registry.Registry, instReg *installer.Registry) *Orchestrator {
	if log == nil {
		log = logger.New(logger.Config{Name: "Orchestrator"})
	} else {
		log = log.WithName("Orchestrator")
	}
	return &Orchestrator{
		logger:       log,
		fs:           fsys,
		runner:       runner,
		reg:          reg,
		instRegistry: instReg,
	}
}

// SetLogger updates the Orchestrator's logger.
func (o *Orchestrator) SetLogger(log *logger.Logger) {
	if log != nil {
		o.logger = log.WithName("Orchestrator")
	}
}

func (o *Orchestrator) getTrackedFS(ctx context.Context, tx *sql.Tx, toolName, fileType string) *fs.TrackedFileSystem {
	if tfs, ok := o.fs.(*fs.TrackedFileSystem); ok {
		return tfs.WithTx(ctx, tx).WithToolName(toolName).WithFileType(fileType)
	}
	return fs.NewTrackedFileSystem(o.fs, o.reg, toolName).WithTx(ctx, tx).WithFileType(fileType)
}

// SetSymlinkFS allows injecting a custom fs.FS (primarily for testing).
func (o *Orchestrator) SetSymlinkFS(sfs fs.FS) {
	o.symlinkFS = sfs
}

// SetConfigFilePath updates the Orchestrator's main configuration file path.
func (o *Orchestrator) SetConfigFilePath(path string) {
	o.configFilePath = path
}

func (o *Orchestrator) getConfigFilePath() string {
	if o.configFilePath != "" {
		return o.configFilePath
	}
	return "dotfiles.config.ts"
}

func (o *Orchestrator) getSymlinkEvaluator() *symlink.Evaluator {
	if o.symlinkFS != nil {
		return symlink.NewEvaluatorWithFS(o.symlinkFS)
	}
	return symlink.NewEvaluator()
}

// TopologicalSort sorts a slice of ToolConfigs topologically based on their dependencies.
// It returns an error if a dependency cycle or an unregistered dependency is detected.
func TopologicalSort(tools []*config.ToolConfig) ([]*config.ToolConfig, error) {
	toolMap := make(map[string]*config.ToolConfig)
	for _, tool := range tools {
		if _, exists := toolMap[tool.Name]; exists {
			return nil, fmt.Errorf("duplicate tool name %q in configuration", tool.Name)
		}
		toolMap[tool.Name] = tool
	}

	binaryProviders := make(map[string]string)
	for _, tool := range tools {
		bins := getBinaryNames(tool.Binaries)
		if len(bins) == 0 {
			bins = []string{tool.Name}
		}
		for _, bin := range bins {
			if existing, exists := binaryProviders[bin]; exists {
				return nil, fmt.Errorf("ambiguous dependency: binary %q is provided by multiple tools: %q and %q", bin, existing, tool.Name)
			}
			binaryProviders[bin] = tool.Name
		}
	}

	adj := make(map[string][]string)
	inDegree := make(map[string]int)

	for _, tool := range tools {
		inDegree[tool.Name] = 0
	}

	for _, tool := range tools {
		for _, dep := range tool.Dependencies {
			provider, exists := binaryProviders[dep]
			if !exists {
				if _, toolExists := toolMap[dep]; toolExists {
					provider = dep
				} else {
					return nil, fmt.Errorf("tool %q depends on missing dependency %q", tool.Name, dep)
				}
			}
			inDegree[tool.Name]++
			adj[provider] = append(adj[provider], tool.Name)
		}
	}

	var queue []string
	for _, tool := range tools {
		if inDegree[tool.Name] == 0 {
			queue = append(queue, tool.Name)
		}
	}

	var sorted []string
	for len(queue) > 0 {
		u := queue[0]
		queue = queue[1:]
		sorted = append(sorted, u)

		for _, v := range adj[u] {
			inDegree[v]--
			if inDegree[v] == 0 {
				queue = append(queue, v)
			}
		}
	}

	if len(sorted) < len(tools) {
		var cycled []string
		for name, deg := range inDegree {
			if deg > 0 {
				cycled = append(cycled, name)
			}
		}
		sort.Strings(cycled)
		return nil, fmt.Errorf("dependency cycle detected among tools: %s", strings.Join(cycled, ", "))
	}

	result := make([]*config.ToolConfig, 0, len(sorted))
	for _, name := range sorted {
		result = append(result, toolMap[name])
	}

	return result, nil
}

// InstallTools executes the installation pipeline for all provided tools sequentially in topological order.
func (o *Orchestrator) InstallTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	sorted, err := TopologicalSort(tools)
	if err != nil {
		return fmt.Errorf("resolving dependencies: %w", err)
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

	return nil
}

// GenerateTools executes standalone shim, symlink, and shell script generation.
// It skips the installation pipeline except for tools with "auto: true" in their install params.
func (o *Orchestrator) GenerateTools(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	sorted, err := TopologicalSort(tools)
	if err != nil {
		return fmt.Errorf("resolving dependencies: %w", err)
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
			o.logger.GetSubLogger("", "system", tool.Name).Warn("Skipping shim generation (manual tool has .bin() but no binaryPath — use shell functions instead)")
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
				if !shouldOverwrite() {
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
		wasCreated, err := symEvaluator.CreateSymlink(sym.Source, sym.Target, symlink.Options{Overwrite: true})
		if err != nil {
			return fmt.Errorf("creating symlink from %q to %q: %w", sym.Source, sym.Target, err)
		}

		if wasCreated {
			err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
				activeFS := o.getTrackedFS(ctx, tx, tool.Name, "symlink")
				return activeFS.RecordExistingSymlink(sym.Source, sym.Target)
			})
			if err != nil {
				return fmt.Errorf("recording symlink operation: %w", err)
			}
		}
	}

	return nil
}

func isAutoInstall(tool *config.ToolConfig) bool {
	if tool.InstallParams == nil {
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

	if tool.Sudo && !inst.SupportsSudo() {
		return fmt.Errorf("installer %q does not support sudo installations", tool.InstallationMethod)
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

	if !isExternal {
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

						writer := &lineLogWriter{logger: o.logger.GetSubLogger("", tool.Name), prefix: "|"}
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
				if !shouldOverwrite() {
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
		wasCreated, err := symEvaluator.CreateSymlink(sym.Source, sym.Target, symlink.Options{Overwrite: true})
		if err != nil {
			return fmt.Errorf("creating symlink from %q to %q: %w", sym.Source, sym.Target, err)
		}

		if wasCreated {
			err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
				activeFS := o.getTrackedFS(ctx, tx, tool.Name, "symlink")
				return activeFS.RecordExistingSymlink(sym.Source, sym.Target)
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
		o.logger.GetSubLogger("", tool.Name).Warn(logger.Message(fmt.Sprintf("Failed to generate completions: %v", err)))
	}

	return nil
}

// UninstallTool uninstalls a tool, deletes its registered shims, symlinks, and files, and purges its db entries.
func (o *Orchestrator) UninstallTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
	}

	// 1. Resolve registered file states for the tool from the registry.
	fileStates, err := o.reg.GetFileStatesForTool(ctx, tool.Name)
	if err == nil {
		// 2. Clean up each registered file/shim/symlink gracefully
		for _, fileState := range fileStates {
			if fileState.LastOperation != "rm" {
				exists, err := o.fs.Exists(fileState.FilePath)
				if err == nil && exists {
					_ = o.fs.Remove(fileState.FilePath)
				}
			}
		}
	}

	// 3. Invoke the native installer plugin's Uninstall method if it exists
	if inst, err := o.instRegistry.Get(tool.InstallationMethod); err == nil {
		_ = inst.Uninstall(ctx, tool)
	}

	// 4. Transactionally remove all file operations and the tool installation from the database
	err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		if err := o.reg.RemoveFileOperationsByTool(ctx, tx, tool.Name); err != nil {
			return err
		}
		return o.reg.RemoveToolInstallation(ctx, tx, tool.Name)
	})
	if err != nil {
		return fmt.Errorf("removing registry records: %w", err)
	}

	return nil
}

func matchesHostname(pattern string) bool {
	current, err := os.Hostname()
	if err != nil {
		return false
	}
	if pattern == "" {
		return true
	}

	if len(pattern) >= 2 && strings.HasPrefix(pattern, "/") && strings.HasSuffix(pattern, "/") {
		body := pattern[1 : len(pattern)-1]
		re, err := regexp.Compile(body)
		if err != nil {
			return current == pattern
		}
		return re.MatchString(current)
	}

	return current == pattern || strings.Contains(current, pattern)
}

func getBinaryNames(toolBinaries []interface{}) []string {
	names := make([]string, 0, len(toolBinaries))
	for _, b := range toolBinaries {
		switch val := b.(type) {
		case string:
			names = append(names, val)
		case map[string]interface{}:
			if name, ok := val["name"].(string); ok {
				names = append(names, name)
			}
		case config.BinaryConfig:
			names = append(names, val.Name)
		case *config.BinaryConfig:
			if val != nil {
				names = append(names, val.Name)
			}
		}
	}
	return names
}

func (o *Orchestrator) generateShellScripts(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	shellScriptsDir := projCfg.Paths.ShellScriptsDir
	if shellScriptsDir == "" {
		shellScriptsDir = filepath.Join(projCfg.Paths.GeneratedDir, "shell-scripts")
	}

	return o.reg.WithTx(ctx, func(tx *sql.Tx) error {
		fsys := o.getTrackedFS(ctx, tx, "system", "init")

		// 1. Ensure directories exist
		if err := fsys.MkdirAll(shellScriptsDir, 0755); err != nil {
			return err
		}
		onceDir := filepath.Join(shellScriptsDir, ".once")
		if err := fsys.MkdirAll(onceDir, 0755); err != nil {
			return err
		}

		// Prune existing files in .once/ during consecutive generate commands
		for i := 1; i <= 1000; i++ {
			for _, ext := range []string{"zsh", "bash", "sh", "ps1"} {
				filePath := filepath.Join(onceDir, fmt.Sprintf("once-%03d.%s", i, ext))
				if exists, err := fsys.Exists(filePath); err == nil && exists {
					_ = fsys.Remove(filePath)
				}
			}
		}

		// We generate for zsh, bash, powershell
		shells := []string{"zsh", "bash", "powershell"}

		for _, sh := range shells {
			var scriptLines []string

			// Add header
			scriptLines = append(scriptLines, "# Generated by dotfiles installer")

			// Prepend targetDir (user-bin) to PATH with protection guard
			scriptLines = append(scriptLines, shellinit.FormatPath(sh, projCfg.Paths.TargetDir))

			// Zsh fpath completion
			if sh == "zsh" {
				completionsDir := filepath.Join(shellScriptsDir, "zsh", "completions")
				if err := fsys.MkdirAll(completionsDir, 0755); err != nil {
					return err
				}
				scriptLines = append(scriptLines, shellinit.FormatFpath(completionsDir))
			}

			// Iterate through tools
			onceCounter := 1
			for _, tool := range tools {
				if tool.Disabled {
					continue
				}
				if tool.Hostname != "" && !matchesHostname(tool.Hostname) {
					continue
				}

				// Get tool shell config
				var stc *config.ShellTypeConfig
				if tool.ShellConfigs != nil {
					if sh == "zsh" {
						stc = tool.ShellConfigs.Zsh
					} else if sh == "bash" {
						stc = tool.ShellConfigs.Bash
					} else if sh == "powershell" {
						stc = tool.ShellConfigs.Powershell
					}
				}

				if stc == nil {
					continue
				}

				// 2. Environment variables
				for k, v := range stc.Env {
					vResolved, err := o.resolvePlaceholder(v, tool, projCfg)
					if err != nil {
						return fmt.Errorf("resolving env variable %q: %w", k, err)
					}
					if sh == "powershell" {
						scriptLines = append(scriptLines, fmt.Sprintf("$env:%s = %q", k, vResolved))
					} else {
						scriptLines = append(scriptLines, fmt.Sprintf("export %s=%q", k, vResolved))
					}
				}

				// 3. Aliases
				for k, v := range stc.Aliases {
					vResolved, err := o.resolvePlaceholder(v, tool, projCfg)
					if err != nil {
						return fmt.Errorf("resolving alias %q: %w", k, err)
					}
					if sh == "powershell" {
						scriptLines = append(scriptLines, fmt.Sprintf("Set-Alias -Name %s -Value %q", k, vResolved))
					} else {
						scriptLines = append(scriptLines, fmt.Sprintf("alias %s='%s'", k, vResolved))
					}
				}

				// 4. Scripts (always vs once)
				for _, scr := range stc.Scripts {
					valResolved, err := o.resolvePlaceholder(scr.Value, tool, projCfg)
					if err != nil {
						return fmt.Errorf("resolving script: %w", err)
					}
					if scr.Kind == "always" {
						scriptLines = append(scriptLines, valResolved)
					} else if scr.Kind == "once" {
						// Write once script to a file
						ext := sh
						if sh == "powershell" {
							ext = "ps1"
						} else if sh == "bash" {
							ext = "sh"
						}
						onceFileName := fmt.Sprintf("once-%03d.%s", onceCounter, ext)
						onceCounter++
						onceFilePath := filepath.Join(onceDir, onceFileName)

						var scriptContent string
						if sh == "powershell" {
							scriptContent = valResolved + "\nRemove-Item $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue\n"
						} else if sh == "zsh" {
							scriptContent = valResolved + "\nrm -f \"${(%):-%x}\"\n"
						} else { // bash
							scriptContent = valResolved + "\nrm -f \"${BASH_SOURCE[0]}\"\n"
						}

						err := fsys.WriteFile(onceFilePath, []byte(scriptContent), 0777)
						if err != nil {
							return err
						}
					}
				}

				// 5. Native Functions
				for name, body := range stc.Functions {
					if sh == "powershell" {
						scriptLines = append(scriptLines, fmt.Sprintf("function %s {\n%s\n}", name, body))
					} else {
						scriptLines = append(scriptLines, fmt.Sprintf("%s() {\n%s\n}", name, body))
					}
				}

				cleanToolName := strings.ReplaceAll(tool.Name, "-", "_")

				// 6. Native SourceFiles
				for i, relPath := range stc.SourceFiles {
					var resolvedPath string
					if filepath.IsAbs(relPath) {
						resolvedPath = relPath
					} else {
						toolConfigDir := filepath.Dir(tool.ConfigFilePath)
						resolvedPath = filepath.Join(toolConfigDir, relPath)
					}
					resolvedPath = filepath.ToSlash(resolvedPath)

					funcName := fmt.Sprintf("__dotfiles_source_%s_%d", cleanToolName, i)
					var body string
					if sh == "powershell" {
						body = fmt.Sprintf("if (Test-Path %q) { Get-Content %q -Raw }", resolvedPath, resolvedPath)
						scriptLines = append(scriptLines, fmt.Sprintf("function %s {\n%s\n}", funcName, body))
						scriptLines = append(scriptLines, fmt.Sprintf(". (%s)", funcName))
						scriptLines = append(scriptLines, fmt.Sprintf("Remove-Item Function:\\%s -ErrorAction SilentlyContinue", funcName))
					} else {
						body = fmt.Sprintf("[[ -f %q ]] && cat %q", resolvedPath, resolvedPath)
						scriptLines = append(scriptLines, fmt.Sprintf("%s() {\n%s\n}", funcName, body))
						scriptLines = append(scriptLines, fmt.Sprintf("source <(%s)", funcName))
						scriptLines = append(scriptLines, fmt.Sprintf("unset -f %s", funcName))
					}
				}

				// 7. Native Sources (inline script blocks)
				for i, content := range stc.Sources {
					funcName := fmt.Sprintf("__dotfiles_source_inline_%s_%d", cleanToolName, i)
					if sh == "powershell" {
						scriptLines = append(scriptLines, fmt.Sprintf("function %s {\n%s\n}", funcName, content))
						scriptLines = append(scriptLines, fmt.Sprintf(". (%s)", funcName))
						scriptLines = append(scriptLines, fmt.Sprintf("Remove-Item Function:\\%s -ErrorAction SilentlyContinue", funcName))
					} else {
						scriptLines = append(scriptLines, fmt.Sprintf("%s() {\n%s\n}", funcName, content))
						scriptLines = append(scriptLines, fmt.Sprintf("source <(%s)", funcName))
						scriptLines = append(scriptLines, fmt.Sprintf("unset -f %s", funcName))
					}
				}

				// 8. Native SourceFunctions
				for _, funcName := range stc.SourceFunctions {
					if sh == "powershell" {
						scriptLines = append(scriptLines, fmt.Sprintf(". (%s)", funcName))
					} else {
						scriptLines = append(scriptLines, fmt.Sprintf("source <(%s)", funcName))
					}
				}

			}

			// Add dynamic once-scripts glob matching loop if any once scripts were created
			if onceCounter > 1 {
				scriptLines = append(scriptLines, shellinit.FormatOnceLoop(sh, onceDir))
			}

			// Write final main script file
			ext := sh
			if sh == "powershell" {
				ext = "ps1"
			}
			mainFilePath := filepath.Join(shellScriptsDir, "main."+ext)
			err := fsys.WriteFile(mainFilePath, []byte(strings.Join(scriptLines, "\n")+"\n"), 0666)
			if err != nil {
				return err
			}
		}

		return nil
	})
}

func (o *Orchestrator) resolvePlaceholder(val string, tool *config.ToolConfig, projCfg *config.ProjectConfig) (string, error) {
	return config.ResolvePlaceholders(val, tool.Name, projCfg)
}

type lineLogWriter struct {
	logger *logger.Logger
	prefix string
	buf    bytes.Buffer
}

func (l *lineLogWriter) Write(p []byte) (n int, err error) {
	n = len(p)
	l.buf.Write(p)
	for {
		line, err := l.buf.ReadString('\n')
		if err != nil {
			l.buf.Write([]byte(line))
			break
		}
		trimmed := strings.TrimSuffix(line, "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		l.logger.Info(logger.Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
	}
	return n, nil
}

func (l *lineLogWriter) Flush() {
	if l.buf.Len() > 0 {
		trimmed := strings.TrimSuffix(l.buf.String(), "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		if trimmed != "" {
			l.logger.Info(logger.Message(fmt.Sprintf("%s %s", l.prefix, trimmed)))
		}
		l.buf.Reset()
	}
}

func shouldOverwrite() bool {
	for _, arg := range os.Args {
		if arg == "--overwrite" {
			return true
		}
	}
	return os.Getenv("DOTFILES_OVERWRITE") == "true"
}

func isExternallyManaged(method string) bool {
	switch method {
	case "apt", "pkg", "brew", "npm", "dmg", "pacman", "dnf":
		return true
	}
	return false
}

func getStringParam(params map[string]interface{}, key string, defaultValue string) string {
	if params == nil {
		return defaultValue
	}
	val, ok := params[key]
	if !ok {
		return defaultValue
	}
	str, ok := val.(string)
	if !ok {
		return defaultValue
	}
	return str
}

func removeAll(fsys fs.FS, path string) error {
	exists, err := fsys.Exists(path)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}

	entries, err := fsys.ReadDir(path)
	if err != nil {
		// It's a file, or not a directory. Remove it.
		return fsys.Remove(path)
	}

	// It's a directory. Recursively remove all entries.
	for _, entry := range entries {
		entryPath := filepath.Join(path, entry)
		if err := removeAll(fsys, entryPath); err != nil {
			return err
		}
	}

	// Finally, remove the directory itself.
	return fsys.Remove(path)
}

func (o *Orchestrator) getCliCommand() string {
	if cmd := os.Getenv("DOTFILES_CLI_COMMAND"); cmd != "" {
		return cmd
	}

	execPath, err := os.Executable()
	if err != nil {
		return "dotfiles"
	}

	tempDir := os.TempDir()
	isTemp := strings.HasPrefix(execPath, tempDir) ||
		strings.Contains(execPath, "go-build") ||
		strings.Contains(execPath, "_test")

	if isTemp {
		if os.Getenv("DOTFILES_E2E_TEST") == "true" {
			return execPath
		}

		repoRoot := os.Getenv("DOTFILES_REPO_ROOT")
		if repoRoot == "" {
			dir, _ := os.Getwd()
			for dir != "/" && dir != "." {
				if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
					repoRoot = dir
					break
				}
				dir = filepath.Dir(dir)
			}
		}

		if repoRoot != "" {
			return fmt.Sprintf("go run %s", filepath.Join(repoRoot, "cmd", "dotfiles"))
		}
		return "dotfiles"
	}

	return execPath
}

func (o *Orchestrator) isExistingInstallationHealthy(ctx context.Context, toolName string, existingInstallation *registry.ToolInstallationRecord, tool *config.ToolConfig, projCfg *config.ProjectConfig) bool {
	// 1. Check if existingInstallation.InstallPath exists on disk
	exists, err := o.fs.Exists(existingInstallation.InstallPath)
	if err != nil || !exists {
		o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Existing install path missing: %s", existingInstallation.InstallPath)))
		return false
	}

	// 2. Check if the current symlink exists and target exists
	expectedBinaryNames := getBinaryNames(tool.Binaries)
	if len(expectedBinaryNames) == 0 {
		return true
	}

	currentDir := filepath.Join(projCfg.Paths.BinariesDir, toolName, "current")
	currentDirExists, err := o.fs.Exists(currentDir)
	if err != nil || !currentDirExists {
		o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Current directory missing: %s", currentDir)))
		return false
	}

	for _, binName := range expectedBinaryNames {
		binaryPath := filepath.Join(currentDir, binName)
		binExists, err := o.fs.Exists(binaryPath)
		if err != nil || !binExists {
			o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Current binary missing: %s", binaryPath)))
			return false
		}
	}

	return true
}

func isExactTopLevelVersion(v string) bool {
	if strings.ContainsAny(v, "^~><=") {
		return false
	}
	return true
}

func (o *Orchestrator) getTargetVersion(tool *config.ToolConfig) string {
	switch tool.InstallationMethod {
	case "apt", "dnf", "pacman":
		if tool.InstallParams != nil {
			if v, ok := tool.InstallParams["version"].(string); ok && v != "latest" {
				return version.CleanVersion(v)
			}
		}
		return ""
	}

	if tool.Version != nil && *tool.Version != "" && *tool.Version != "latest" && isExactTopLevelVersion(*tool.Version) {
		return version.CleanVersion(*tool.Version)
	}

	return ""
}

func (o *Orchestrator) shouldSkipInstallation(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) (bool, error) {
	if os.Getenv("DOTFILES_OVERWRITE") == "true" {
		return false, nil
	}

	existing, err := o.reg.GetToolInstallation(ctx, tool.Name)
	if err != nil {
		return false, fmt.Errorf("checking existing installation: %w", err)
	}
	if existing == nil {
		return false, nil
	}

	isHealthy := o.isExistingInstallationHealthy(ctx, tool.Name, existing, tool, projCfg)
	if !isHealthy {
		return false, nil
	}

	targetVersion := o.getTargetVersion(tool)
	if targetVersion != "" {
		if version.CleanVersion(existing.Version) == targetVersion {
			o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Tool %s already installed at version %s", tool.Name, targetVersion)))
			return true, nil
		}
		o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Tool %s has outdated version %s (target is %s)", tool.Name, existing.Version, targetVersion)))
		return false, nil
	}

	o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Tool %s already installed (version: %s)", tool.Name, existing.Version)))
	return true, nil
}

// GenerateCompletionsForTool generates shell completion files for a single tool.
func (o *Orchestrator) GenerateCompletionsForTool(ctx context.Context, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil {
		return fmt.Errorf("project configuration is nil")
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

		var completionFileName string
		if sh == "zsh" {
			completionFileName = "_" + tool.Name
		} else {
			completionFileName = tool.Name
		}

		completionsDir := filepath.Join(shellScriptsDir, sh, "completions")
		err := o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			fsys := o.getTrackedFS(ctx, tx, tool.Name, "completion")
			if err := fsys.MkdirAll(completionsDir, 0755); err != nil {
				return err
			}
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
					_ = fsys.Symlink(srcPathResolved, completionFilePath)
				}
			case map[string]interface{}:
				if cmdVal, ok := comp["cmd"].(string); ok && cmdVal != "" {
					cmdValResolved, err := o.resolvePlaceholder(cmdVal, tool, projCfg)
					if err == nil {
						parts := strings.Fields(cmdValResolved)
						if len(parts) > 0 {
							cmdName := parts[0]
							if !strings.Contains(cmdName, "/") && !strings.Contains(cmdName, "\\") {
								targetPath := filepath.Join(projCfg.Paths.TargetDir, cmdName)
								if exists, err := fsys.Exists(targetPath); err == nil && exists {
									cmdName = targetPath
								}
							}
							cmdExec := o.runner.CommandContext(ctx, cmdName, parts[1:]...)
							pathEnv := os.Getenv("PATH")
							newPathEnv := projCfg.Paths.TargetDir + string(filepath.ListSeparator) + pathEnv
							cmdExec.SetEnv(append(os.Environ(), "PATH="+newPathEnv))
							output, err := cmdExec.Output()
							if err == nil {
								_ = fsys.WriteFile(completionFilePath, output, 0644)
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
						_ = fsys.Symlink(srcPathResolved, completionFilePath)
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
