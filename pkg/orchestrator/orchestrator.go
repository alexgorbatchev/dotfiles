package orchestrator

import (
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

	adj := make(map[string][]string)
	inDegree := make(map[string]int)

	for _, tool := range tools {
		inDegree[tool.Name] = 0
		for _, dep := range tool.Dependencies {
			if _, exists := toolMap[dep]; exists {
				inDegree[tool.Name]++
				adj[dep] = append(adj[dep], tool.Name)
			} else {
				return nil, fmt.Errorf("tool %q depends on unregistered tool %q", tool.Name, dep)
			}
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

	return nil
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

	// 1. Download, unpack, and install via the native installer plugin
	res, err := inst.Install(ctx, tool)
	if err != nil {
		return fmt.Errorf("running installer: %w", err)
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
