package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
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
	"github.com/alexgorbatchev/dotfiles/pkg/scaffold"
	"github.com/alexgorbatchev/dotfiles/pkg/symlink"
	"github.com/alexgorbatchev/dotfiles/pkg/typecheck"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
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
	if instReg == nil {
		instReg = installer.DefaultRegistry()
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

// declaredBinaries returns the binaries a tool declares with .bin() that its shape can
// actually produce. The declared set is what the install pipeline installs and records
// and what CleanupStaleShims reconciles the target directory against, so it is the
// authority on which binaries a tool owns; what an installer happens to report is only
// used to locate them.
//
// A manual tool without binaryPath has nothing a shim could point at unless a
// before-install hook stages its files, so it produces none: as in v1, its command is
// expected to come from shell functions.
func declaredBinaries(tool *config.ToolConfig) []string {
	if isManualWithoutPayload(tool) {
		return nil
	}
	return getBinaryNames(tool.Binaries)
}

// shimBinaries narrows declaredBinaries to the binaries that also get a shim in the
// target directory. Shim generation and CleanupStaleShims both derive the set from
// here so they cannot disagree and undo each other on every run. A binary declared
// with `shim: false` is installed and recorded but deliberately kept off the target
// directory.
func shimBinaries(tool *config.ToolConfig) []string {
	var names []string
	for _, name := range declaredBinaries(tool) {
		if wantsShim(tool.Binaries, name) {
			names = append(names, name)
		}
	}
	return names
}

// warnUndeclaredBinaries reports binaries an installer produced that the tool never
// declared with .bin(). They get no shim: CleanupStaleShims reconciles the target
// directory against the declared set, so a shim written for one of them would be
// removed as stale by the very next generate and recreated by the next install.
func (o *Orchestrator) warnUndeclaredBinaries(tool *config.ToolConfig, reported []string) {
	declared := make(map[string]struct{})
	for _, name := range getBinaryNames(tool.Binaries) {
		declared[name] = struct{}{}
	}

	seen := make(map[string]struct{})
	var undeclared []string
	for _, path := range reported {
		name := filepath.Base(path)
		if _, isDeclared := declared[name]; isDeclared {
			continue
		}
		if _, isSeen := seen[name]; isSeen {
			continue
		}
		seen[name] = struct{}{}
		undeclared = append(undeclared, name)
	}
	if len(undeclared) == 0 {
		return
	}

	sort.Strings(undeclared)
	o.logger.GetSubLogger("", tool.Name).Warn(logger.Message(fmt.Sprintf(
		"Installer reported binaries the tool does not declare with .bin(): %s (no shim generated; add .bin() for each one that should be on PATH)",
		strings.Join(undeclared, ", "),
	)))
}

// isManualWithoutPayload reports whether a manual tool has neither a binaryPath nor
// a before-install hook, that is, no way of ever producing a binary to shim.
func isManualWithoutPayload(tool *config.ToolConfig) bool {
	return tool.InstallationMethod == "manual" &&
		getStringParam(tool.InstallParams, "binaryPath", "") == "" &&
		!vm.HasHook(tool, vm.HookBeforeInstall)
}

// warnUnshimmedBinaries tells the author of a manual tool without binaryPath that its
// .bin() declarations produced no shim, so the command has to come from shell functions.
func (o *Orchestrator) warnUnshimmedBinaries(tool *config.ToolConfig) {
	if !isManualWithoutPayload(tool) || len(getBinaryNames(tool.Binaries)) == 0 {
		return
	}
	o.logger.GetSubLogger("", tool.Name).Warn(logger.Message("Skipping shim generation (manual tool has .bin() but no binaryPath: provide the command from shell functions instead)"))
}

// wantsShim reports whether the binary named binName should get a shim in the target
// directory. Only an explicit `shim: false` on the binary's declaration turns it off;
// the binary itself is still installed and reachable under the tool's current
// directory.
func wantsShim(toolBinaries []interface{}, binName string) bool {
	for _, b := range toolBinaries {
		switch val := b.(type) {
		case map[string]interface{}:
			if name, ok := val["name"].(string); ok && name == binName {
				if shim, ok := val["shim"].(bool); ok {
					return shim
				}
				return true
			}
		case config.BinaryConfig:
			if val.Name == binName {
				return val.WantsShim()
			}
		case *config.BinaryConfig:
			if val != nil && val.Name == binName {
				return val.WantsShim()
			}
		}
	}
	return true
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
	if r, ok := fsys.(interface{ RemoveAll(string) error }); ok {
		return r.RemoveAll(path)
	}
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

func (o *Orchestrator) formatPath(projCfg *config.ProjectConfig, p string) string {
	if projCfg == nil || projCfg.Paths.HomeDir == "" {
		return p
	}
	return utils.ContractHomePath(projCfg.Paths.HomeDir, p)
}

func (o *Orchestrator) isExistingInstallationHealthy(ctx context.Context, toolName string, existingInstallation *registry.ToolInstallationRecord, tool *config.ToolConfig, projCfg *config.ProjectConfig) bool {
	isExternal := isExternallyManaged(tool.InstallationMethod)

	if !isExternal {
		exists, err := o.fs.Exists(existingInstallation.InstallPath)
		if err != nil || !exists {
			o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Existing install path missing: %s", o.formatPath(projCfg, existingInstallation.InstallPath))))
			return false
		}

		currentDir := filepath.Join(projCfg.Paths.BinariesDir, toolName, "current")
		currentDirExists, err := o.fs.Exists(currentDir)
		if err != nil || !currentDirExists {
			o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Current directory missing: %s", o.formatPath(projCfg, currentDir))))
			return false
		}

		expectedBinaryNames := getBinaryNames(tool.Binaries)
		for _, binName := range expectedBinaryNames {
			binaryPath := filepath.Join(currentDir, binName)
			binExists, err := o.fs.Exists(binaryPath)
			if err != nil || !binExists {
				o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("Current binary missing: %s", o.formatPath(projCfg, binaryPath))))
				return false
			}
		}
		return true
	}

	// For externally managed tools, verify expected binary executables exist
	var recordedPaths []string
	if existingInstallation != nil && existingInstallation.BinaryPaths != "" {
		_ = json.Unmarshal([]byte(existingInstallation.BinaryPaths), &recordedPaths)
	}

	expectedBinaryNames := getBinaryNames(tool.Binaries)
	for _, binName := range expectedBinaryNames {
		found := false
		for _, p := range recordedPaths {
			if filepath.Base(p) == binName || p == binName {
				if installer.IsRealBinaryPath(ctx, o.fs, p) {
					found = true
					break
				}
			}
		}
		if !found {
			if sysBin, err := o.findSystemBinary(binName, projCfg); err == nil && sysBin != "" {
				found = true
			}
		}
		if !found {
			o.logger.GetSubLogger("", toolName).Warn(logger.Message(fmt.Sprintf("External binary missing: %s", binName)))
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
	if config.IsForceEnabled(ctx) {
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
			o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Already installed at version %s", targetVersion)))
			return true, nil
		}
		o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Outdated version %s (target is %s)", existing.Version, targetVersion)))
		return false, nil
	}

	o.logger.GetSubLogger("", tool.Name).Debug(logger.Message(fmt.Sprintf("Already installed (version: %s)", existing.Version)))
	return true, nil
}

// SyncTypeScriptTypes writes what type-checking the project's tool configurations
// needs under the generated directory: the authoring package's declarations, the
// bin-name registry (as a module, so it augments the package instead of declaring a
// second one), and the tsconfig the CLI owns. A project without a tsconfig.json of its
// own is given one that extends the CLI's.
func (o *Orchestrator) SyncTypeScriptTypes(ctx context.Context, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
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

		projNodeModulesDir := filepath.Join(projCfg.Paths.DotfilesDir, "node_modules", "@alexgorbatchev")
		_ = o.fs.MkdirAll(projNodeModulesDir, 0755)
		projPkgDir := filepath.Join(projNodeModulesDir, "dotfiles")

		relTarget := filepath.Join("..", "..", ".generated", "node_modules", "@alexgorbatchev", "dotfiles")
		if rel, err := filepath.Rel(projNodeModulesDir, pkgGenDir); err == nil {
			relTarget = rel
		}

		needsSymlink := true
		if fi, err := o.fs.Lstat(projPkgDir); err == nil && fi.Mode()&os.ModeSymlink != 0 {
			if target, err := o.fs.Readlink(projPkgDir); err == nil && target == relTarget {
				needsSymlink = false
			}
		}

		if needsSymlink {
			_ = removeAll(o.fs, projPkgDir)
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

	// The import makes this file a module, so the declare block augments the package's
	// declarations; as a script it would declare a second module of the same name.
	toolTypesContent := fmt.Sprintf(`// Auto-generated by dotfiles CLI. Do not edit.
import %[1]q;

declare module %[1]q {
  export interface z_internal_IKnownBinNameRegistry {
%[2]s
  }
}
`, typecheck.PackageName, strings.Join(registryLines, "\n"))

	toolTypesPath := filepath.Join(projCfg.Paths.GeneratedDir, typecheck.RegistryFileName)
	if err := o.fs.WriteFile(toolTypesPath, []byte(toolTypesContent), 0644); err != nil {
		return fmt.Errorf("writing bin-name registry %s: %w", toolTypesPath, err)
	}

	return o.writeTypeCheckProgram(projCfg, pkgGenDir, toolTypesPath)
}

// writeTypeCheckProgram writes the tsconfig the CLI owns under the generated directory
// and, when the project has no tsconfig.json or still has the one an earlier version
// generated, a project tsconfig that extends it.
func (o *Orchestrator) writeTypeCheckProgram(projCfg *config.ProjectConfig, declarationsDir, registryFile string) error {
	configFile := o.getConfigFilePath()
	if !o.fs.IsAbs(configFile) && projCfg.Paths.DotfilesDir != "" {
		configFile = filepath.Join(projCfg.Paths.DotfilesDir, configFile)
	}

	program := typecheck.Program{
		Dir:             projCfg.Paths.GeneratedDir,
		ToolConfigsDirs: vm.ResolveToolConfigsDirs(o.fs, projCfg, filepath.Dir(configFile)),
		DeclarationsDir: declarationsDir,
		RegistryFile:    registryFile,
	}
	// A JSON configuration has nothing to type-check; only a TypeScript one joins the
	// program.
	if strings.HasSuffix(configFile, ".ts") {
		program.ConfigFile = configFile
	}

	content, err := program.TSConfig()
	if err != nil {
		return fmt.Errorf("rendering the type-check tsconfig: %w", err)
	}
	generatedTSConfig := typecheck.TSConfigPath(projCfg.Paths.GeneratedDir)
	if err := o.fs.WriteFile(generatedTSConfig, content, 0644); err != nil {
		return fmt.Errorf("writing %s: %w", generatedTSConfig, err)
	}

	// The project's tsconfig lives with its configuration file: in dotfilesDir when the
	// project names one, otherwise next to dotfiles.config.ts itself.
	projectDir := projCfg.Paths.DotfilesDir
	if projectDir == "" {
		projectDir = filepath.Dir(configFile)
	}
	projectTSConfig := filepath.Join(projectDir, "tsconfig.json")
	exists, err := o.fs.Exists(projectTSConfig)
	if err != nil {
		return fmt.Errorf("checking %s: %w", projectTSConfig, err)
	}
	if exists {
		existing, err := o.fs.ReadFile(projectTSConfig)
		if err != nil {
			return fmt.Errorf("reading %s: %w", projectTSConfig, err)
		}
		// Anything the user wrote is theirs to keep; only the file an earlier version of
		// this project generated is brought up to date.
		if !scaffold.IsLegacyProjectTSConfig(existing) {
			return nil
		}
		o.logger.GetSubLogger("", "system").Info(logger.Message(fmt.Sprintf("Updating generated %s to extend %s", o.formatPath(projCfg, projectTSConfig), o.formatPath(projCfg, generatedTSConfig))))
	}

	extends := generatedTSConfig
	if rel, err := filepath.Rel(projectDir, generatedTSConfig); err == nil {
		extends = filepath.ToSlash(rel)
		if !strings.HasPrefix(extends, "./") && !strings.HasPrefix(extends, "../") {
			extends = "./" + extends
		}
	}
	content, err = scaffold.ProjectTSConfig(extends)
	if err != nil {
		return err
	}
	if err := o.fs.WriteFile(projectTSConfig, content, 0644); err != nil {
		return fmt.Errorf("writing %s: %w", projectTSConfig, err)
	}
	return nil
}
