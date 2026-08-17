package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	iofs "io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/embedded"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
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
	return fs.NewTrackedFileSystem(o.fs, o.reg, o.logger, toolName).WithTx(ctx, tx).WithFileType(fileType)
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
	return symlink.NewEvaluatorWithFS(o.fs)
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

func (o *Orchestrator) resolvePlaceholder(val string, tool *config.ToolConfig, projCfg *config.ProjectConfig) (string, error) {
	return config.ResolvePlaceholders(val, tool.Name, projCfg)
}

func shouldOverwrite(ctx context.Context) bool {
	for _, arg := range os.Args {
		if arg == "--overwrite" {
			return true
		}
	}
	return config.IsOverwriteEnabled(ctx)
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
		return fsys.Remove(path)
	}

	for _, entry := range entries {
		entryPath := filepath.Join(path, entry)
		if err := removeAll(fsys, entryPath); err != nil {
			return err
		}
	}

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
	exists, err := o.fs.Exists(existingInstallation.InstallPath)
	if err != nil || !exists {
		o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Existing install path missing: %s", existingInstallation.InstallPath)))
		return false
	}

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
	if config.IsOverwriteEnabled(ctx) {
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

func (o *Orchestrator) syncTypeScriptTypes(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
	if projCfg == nil || projCfg.Paths.GeneratedDir == "" {
		return nil
	}

	pkgGenDir := filepath.Join(projCfg.Paths.GeneratedDir, "node_modules", "@alexgorbatchev", "dotfiles")
	if err := o.fs.MkdirAll(pkgGenDir, 0755); err != nil {
		return fmt.Errorf("creating generated node_modules directory %s: %w", pkgGenDir, err)
	}

	entries, err := iofs.ReadDir(embedded.TypesFS, "dist")
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() || entry.Name() == ".gitkeep" {
				continue
			}
			data, err := iofs.ReadFile(embedded.TypesFS, filepath.Join("dist", entry.Name()))
			if err == nil {
				_ = o.fs.WriteFile(filepath.Join(pkgGenDir, entry.Name()), data, 0644)
			}
		}
	}

	if projCfg.Paths.DotfilesDir != "" {
		// Ensure minimal package.json exists if not present
		pkgJsonPath := filepath.Join(projCfg.Paths.DotfilesDir, "package.json")
		if exists, _ := o.fs.Exists(pkgJsonPath); !exists {
			defaultPkgJson := []byte("{\n  \"private\": true,\n  \"type\": \"module\"\n}\n")
			_ = o.fs.WriteFile(pkgJsonPath, defaultPkgJson, 0644)
		}

		// Ensure proper tsconfig.json exists if not present
		tsConfigPath := filepath.Join(projCfg.Paths.DotfilesDir, "tsconfig.json")
		if exists, _ := o.fs.Exists(tsConfigPath); !exists {
			defaultTsConfig := []byte("{\n  \"compilerOptions\": {\n    \"target\": \"ESNext\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"strict\": true,\n    \"noEmit\": true,\n    \"skipLibCheck\": true,\n    \"lib\": [\n      \"ESNext\"\n    ]\n  },\n  \"include\": [\n    \"dotfiles.config.ts\",\n    \"tools/**/*.ts\"\n  ]\n}\n")
			_ = o.fs.WriteFile(tsConfigPath, defaultTsConfig, 0644)
		}

		projNodeModulesDir := filepath.Join(projCfg.Paths.DotfilesDir, "node_modules", "@alexgorbatchev")
		_ = o.fs.MkdirAll(projNodeModulesDir, 0755)
		projPkgDir := filepath.Join(projNodeModulesDir, "dotfiles")

		relTarget := filepath.Join("..", "..", ".generated", "node_modules", "@alexgorbatchev", "dotfiles")
		if rel, err := filepath.Rel(projNodeModulesDir, pkgGenDir); err == nil {
			relTarget = rel
		}

		if exists, _ := o.fs.Exists(projPkgDir); !exists {
			if err := o.fs.Symlink(relTarget, projPkgDir); err != nil {
				_ = o.fs.MkdirAll(projPkgDir, 0755)
				if entries, err := iofs.ReadDir(embedded.TypesFS, "dist"); err == nil {
					for _, entry := range entries {
						if entry.IsDir() || entry.Name() == ".gitkeep" {
							continue
						}
						data, _ := iofs.ReadFile(embedded.TypesFS, filepath.Join("dist", entry.Name()))
						_ = o.fs.WriteFile(filepath.Join(projPkgDir, entry.Name()), data, 0644)
					}
				}
			}
		}
	}

	var binNames []string
	seen := make(map[string]bool)

	for _, t := range tools {
		if t.Name != "" && !seen[t.Name] {
			seen[t.Name] = true
			binNames = append(binNames, t.Name)
		}
		for _, b := range t.Binaries {
			switch val := b.(type) {
			case string:
				if val != "" && !seen[val] {
					seen[val] = true
					binNames = append(binNames, val)
				}
			case map[string]interface{}:
				if name, ok := val["name"].(string); ok && name != "" && !seen[name] {
					seen[name] = true
					binNames = append(binNames, name)
				}
			}
		}
	}

	sort.Strings(binNames)

	var registryLines []string
	for _, name := range binNames {
		registryLines = append(registryLines, fmt.Sprintf("    %q: never;", name))
	}

	toolTypesContent := fmt.Sprintf(`// Auto-generated by dotfiles CLI. Do not edit.
declare module "@alexgorbatchev/dotfiles" {
  export interface z_internal_IKnownBinNameRegistry {
%s
  }
}
`, strings.Join(registryLines, "\n"))

	toolTypesPath := filepath.Join(projCfg.Paths.GeneratedDir, "tool-types.d.ts")
	_ = o.fs.WriteFile(toolTypesPath, []byte(toolTypesContent), 0644)

	return nil
}
