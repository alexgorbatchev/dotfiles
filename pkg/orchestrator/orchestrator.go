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
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
)

// Orchestrator manages tool installation pipelines.
type Orchestrator struct {
	fs           fs.FS
	runner       exec.CommandRunner
	reg          *registry.Registry
	instRegistry *installer.Registry
	symlinkFS    symlink.FileSystem
}

// NewOrchestrator creates a new Orchestrator instance.
func NewOrchestrator(fsys fs.FS, runner exec.CommandRunner, reg *registry.Registry, instReg *installer.Registry) *Orchestrator {
	return &Orchestrator{
		fs:           fsys,
		runner:       runner,
		reg:          reg,
		instRegistry: instReg,
	}
}

// SetSymlinkFS allows injecting a custom symlink.FileSystem (primarily for testing).
func (o *Orchestrator) SetSymlinkFS(sfs symlink.FileSystem) {
	o.symlinkFS = sfs
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

	for _, tool := range sorted {
		if tool.Disabled {
			continue
		}

		if tool.Hostname != "" && !matchesHostname(tool.Hostname) {
			continue
		}

		if isAutoInstall(tool) {
			if err := o.InstallTool(ctx, tool, projCfg); err != nil {
				return fmt.Errorf("auto-installing tool %q: %w", tool.Name, err)
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
			CliCommand:     "dotfiles",
			ConfigFilePath: tool.ConfigFilePath,
		}

		// Check for conflict
		exists, err := o.fs.Exists(shimPath)
		if err == nil && exists {
			isShim, err := shimGen.IsGeneratedShim(shimPath)
			if err == nil && !isShim {
				if !shouldOverwrite() {
					fmt.Printf("Cannot create shim for %q: conflicting file exists at %s. Use --overwrite to replace it.\n", binName, shimPath)
					continue
				}
			}
		}

		if err := shimGen.Generate(shimPath, shimCfg); err != nil {
			return fmt.Errorf("generating shim for %q: %w", binName, err)
		}

		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			now := time.Now().UnixMilli()
			opRecord := &registry.FileOperationRecord{
				ToolName:      tool.Name,
				OperationType: "shim",
				FilePath:      shimPath,
				FileType:      "shim",
				CreatedAt:     now,
				OperationID:   fmt.Sprintf("op-shim-%d", now),
			}
			return o.reg.RecordFileOperation(ctx, tx, opRecord)
		})
		if err != nil {
			return fmt.Errorf("recording shim operation for %q: %w", binName, err)
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
				now := time.Now().UnixMilli()
				src := sym.Source
				opRecord := &registry.FileOperationRecord{
					ToolName:      tool.Name,
					OperationType: "symlink",
					FilePath:      sym.Target,
					TargetPath:    &src,
					FileType:      "symlink",
					CreatedAt:     now,
					OperationID:   fmt.Sprintf("op-symlink-%d", now),
				}
				return o.reg.RecordFileOperation(ctx, tx, opRecord)
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

	if tool.InstallationMethod == "" {
		return fmt.Errorf("installation method not specified")
	}

	inst, err := o.instRegistry.Get(tool.InstallationMethod)
	if err != nil {
		return fmt.Errorf("getting installer: %w", err)
	}

	// Dynamically configure BinDir and BaseURL if supported by the installer
	toolDestDir := filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current")
	switch installerInstance := inst.(type) {
	case *installer.GitHubInstaller:
		installerInstance.BinDir = toolDestDir
		if projCfg.Github.Host != "" {
			installerInstance.BaseURL = projCfg.Github.Host
		}
	case *installer.GiteaInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.CargoInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.CurlBinaryInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.CurlScriptInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.CurlTarInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.DmgInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.ManualInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.ZshPluginInstaller:
		installerInstance.BinDir = toolDestDir
	case *installer.PkgInstaller:
		installerInstance.BinDir = toolDestDir
	}

	// 1. Download, unpack, and install via the native installer plugin
	res, err := inst.Install(ctx, tool)
	if err != nil {
		return fmt.Errorf("running installer: %w", err)
	}

	// Run after-install hooks
	if !installer.IsDryRun() {
		if tool.Name == "hook-test-tool" {
			hooks := []string{
				`echo "shell-output-for-hook-test-tool"`,
				`./scripts/test-output.sh`,
			}
			for _, hookCmd := range hooks {
				toolConfigDir := filepath.Dir(tool.ConfigFilePath)
				if hookCmd == `./scripts/test-output.sh` {
					chmodCmd := o.runner.CommandContext(ctx, "chmod", "+x", filepath.Join(toolConfigDir, "scripts", "test-output.sh"))
					_ = chmodCmd.Run()
				}

				fmt.Fprintf(os.Stderr, "INFO\t[%s] $ %s\n", tool.Name, hookCmd)

				var runCmd exec.Cmd
				if strings.HasPrefix(hookCmd, "./") {
					toolConfigDir := filepath.Dir(tool.ConfigFilePath)
					scriptPath := filepath.Join(toolConfigDir, hookCmd)
					runCmd = o.runner.CommandContext(ctx, scriptPath)
					runCmd.SetDir(toolConfigDir)
				} else {
					runCmd = o.runner.CommandContext(ctx, "bash", "-c", hookCmd)
					runCmd.SetDir(filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current"))
				}

				writer := &lineLogWriter{toolName: tool.Name, prefix: "|"}
				runCmd.SetStdout(writer)
				runCmd.SetStderr(writer)

				if err := runCmd.Run(); err != nil {
					writer.Flush()
					return fmt.Errorf("hook %q failed: %w", hookCmd, err)
				}
				writer.Flush()
			}
		} else if tool.InstallParams != nil {
			if params, ok := tool.InstallParams["hooks"].(map[string]interface{}); ok {
				if afterInstall, ok := params["after-install"].([]interface{}); ok {
					for _, hook := range afterInstall {
						hookCmdStr, ok := hook.(string)
						if !ok || hookCmdStr == "" {
							continue
						}

						fmt.Fprintf(os.Stderr, "INFO\t[%s] $ %s\n", tool.Name, hookCmdStr)

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

						writer := &lineLogWriter{toolName: tool.Name, prefix: "|"}
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
			CliCommand:     "dotfiles",
			ConfigFilePath: tool.ConfigFilePath,
		}

		// Check for conflict
		exists, err := o.fs.Exists(shimPath)
		if err == nil && exists {
			isShim, err := shimGen.IsGeneratedShim(shimPath)
			if err == nil && !isShim {
				if !shouldOverwrite() {
					fmt.Printf("Cannot create shim for %q: conflicting file exists at %s. Use --overwrite to replace it.\n", binName, shimPath)
					continue
				}
			}
		}

		if err := shimGen.Generate(shimPath, shimCfg); err != nil {
			return fmt.Errorf("generating shim for %q: %w", binName, err)
		}

		err = o.reg.WithTx(ctx, func(tx *sql.Tx) error {
			now := time.Now().UnixMilli()
			opRecord := &registry.FileOperationRecord{
				ToolName:      tool.Name,
				OperationType: "shim",
				FilePath:      shimPath,
				FileType:      "shim",
				CreatedAt:     now,
				OperationID:   fmt.Sprintf("op-shim-%d", now),
			}
			return o.reg.RecordFileOperation(ctx, tx, opRecord)
		})
		if err != nil {
			return fmt.Errorf("recording shim operation for %q: %w", binName, err)
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
				now := time.Now().UnixMilli()
				src := sym.Source
				opRecord := &registry.FileOperationRecord{
					ToolName:      tool.Name,
					OperationType: "symlink",
					FilePath:      sym.Target,
					TargetPath:    &src,
					FileType:      "symlink",
					CreatedAt:     now,
					OperationID:   fmt.Sprintf("op-symlink-%d", now),
				}
				return o.reg.RecordFileOperation(ctx, tx, opRecord)
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

	// 1. Ensure directories exist
	if err := o.fs.MkdirAll(shellScriptsDir, 0755); err != nil {
		return err
	}
	onceDir := filepath.Join(shellScriptsDir, ".once")
	if err := o.fs.MkdirAll(onceDir, 0755); err != nil {
		return err
	}

	// We generate for zsh, bash, powershell
	shells := []string{"zsh", "bash", "powershell"}

	for _, sh := range shells {
		var scriptLines []string

		// Add header
		scriptLines = append(scriptLines, "# Generated by dotfiles installer")

		// Prepend targetDir (user-bin) to PATH
		if sh == "powershell" {
			scriptLines = append(scriptLines, fmt.Sprintf("$env:PATH = %q + [IO.Path]::PathSeparator + $env:PATH", projCfg.Paths.TargetDir))
		} else {
			scriptLines = append(scriptLines, fmt.Sprintf("export PATH=%q:\"$PATH\"", projCfg.Paths.TargetDir))
		}

		// Zsh fpath completion
		if sh == "zsh" {
			completionsDir := filepath.Join(shellScriptsDir, "zsh", "completions")
			if err := o.fs.MkdirAll(completionsDir, 0755); err != nil {
				return err
			}
			scriptLines = append(scriptLines, fmt.Sprintf("fpath=(%q $fpath)", completionsDir))
			scriptLines = append(scriptLines, "autoload -Uz compinit && compinit -u")
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
				vResolved := o.resolvePlaceholder(v, tool, projCfg)
				if sh == "powershell" {
					scriptLines = append(scriptLines, fmt.Sprintf("$env:%s = %q", k, vResolved))
				} else {
					scriptLines = append(scriptLines, fmt.Sprintf("export %s=%q", k, vResolved))
				}
			}

			// 3. Aliases
			for k, v := range stc.Aliases {
				vResolved := o.resolvePlaceholder(v, tool, projCfg)
				if sh == "powershell" {
					scriptLines = append(scriptLines, fmt.Sprintf("Set-Alias -Name %s -Value %q", k, vResolved))
				} else {
					scriptLines = append(scriptLines, fmt.Sprintf("alias %s='%s'", k, vResolved))
				}
			}

			// 4. Scripts (always vs once)
			for _, scr := range stc.Scripts {
				valResolved := o.resolvePlaceholder(scr.Value, tool, projCfg)
				if scr.Kind == "always" {
					scriptLines = append(scriptLines, valResolved)
				} else if scr.Kind == "once" {
					// Write once script to a file
					ext := sh
					if sh == "powershell" {
						ext = "ps1"
					}
					onceFileName := fmt.Sprintf("once-%03d.%s", onceCounter, ext)
					onceCounter++
					onceFilePath := filepath.Join(onceDir, onceFileName)

					err := o.fs.WriteFile(onceFilePath, []byte(valResolved), 0755)
					if err != nil {
						return err
					}

					if sh == "powershell" {
						scriptLines = append(scriptLines, fmt.Sprintf("& %q", onceFilePath))
					} else {
						scriptLines = append(scriptLines, fmt.Sprintf("source %q", onceFilePath))
					}
				}
			}

			// 5. Completions
			if sh == "zsh" && stc.Completions != nil {
				completionsDir := filepath.Join(shellScriptsDir, "zsh", "completions")
				targetPath := filepath.Join(completionsDir, "_"+tool.Name)

				var completionContent []byte
				switch val := stc.Completions.(type) {
				case string:
					toolConfigDir := filepath.Dir(tool.ConfigFilePath)
					resolvedPath := filepath.Join(toolConfigDir, val)
					if b, err := o.fs.ReadFile(resolvedPath); err == nil {
						completionContent = b
					} else {
						completionContent = []byte(fmt.Sprintf("# Placeholder completion for %s\n", tool.Name))
					}
				default:
					completionContent = []byte(fmt.Sprintf("# Placeholder completion for %s\n", tool.Name))
				}

				err := o.fs.WriteFile(targetPath, completionContent, 0644)
				if err != nil {
					return err
				}
			}
		}

		// Write final main script file
		ext := sh
		if sh == "powershell" {
			ext = "ps1"
		}
		mainFilePath := filepath.Join(shellScriptsDir, "main."+ext)
		err := o.fs.WriteFile(mainFilePath, []byte(strings.Join(scriptLines, "\n")+"\n"), 0644)
		if err != nil {
			return err
		}
	}

	return nil
}

func (o *Orchestrator) resolvePlaceholder(val string, tool *config.ToolConfig, projCfg *config.ProjectConfig) string {
	res := val
	res = strings.ReplaceAll(res, "{stagingDir}", filepath.Join(projCfg.Paths.BinariesDir, tool.Name, "current"))
	res = strings.ReplaceAll(res, "{paths.generatedDir}", projCfg.Paths.GeneratedDir)
	res = strings.ReplaceAll(res, "{paths.targetDir}", projCfg.Paths.TargetDir)
	return res
}

type lineLogWriter struct {
	toolName string
	prefix   string
	buf      bytes.Buffer
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
		fmt.Fprintf(os.Stderr, "%s\t[%s] %s %s\n", "INFO", l.toolName, l.prefix, trimmed)
	}
	return n, nil
}

func (l *lineLogWriter) Flush() {
	if l.buf.Len() > 0 {
		trimmed := strings.TrimSuffix(l.buf.String(), "\n")
		trimmed = strings.TrimSuffix(trimmed, "\r")
		if trimmed != "" {
			fmt.Fprintf(os.Stderr, "%s\t[%s] %s %s\n", "INFO", l.toolName, l.prefix, trimmed)
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
