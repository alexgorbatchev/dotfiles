package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/shim"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
)

type InstallResult struct {
	Binaries  []string
	ShellEnv  map[string]string
	ShellInit string
	Version   string
}

type UpdateCheckResult struct {
	HasUpdate     bool
	LocalVersion  string
	LatestVersion string
	Cached        bool
}

type SystemContext struct {
	OS   string
	Arch string
}

func NewDefaultSystemContext() *SystemContext {
	return &SystemContext{
		OS:   arch.GetOS(),
		Arch: arch.GetArch(),
	}
}

type Installer interface {
	Name() string
	SupportsSudo() bool
	Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error)
	Uninstall(ctx context.Context, tool *config.ToolConfig) error
	CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error)
}

// Registry manages registered Installer implementations in a thread-safe manner.
type Registry struct {
	mu         sync.RWMutex
	installers map[string]Installer
}

// NewRegistry creates a new, empty Registry instance.
func NewRegistry() *Registry {
	return &Registry{
		installers: make(map[string]Installer),
	}
}

// Register registers an Installer with the registry.
// It returns an error if an installer with the same name already exists.
func (r *Registry) Register(inst Installer) error {
	if inst == nil {
		return fmt.Errorf("cannot register nil installer")
	}

	name := inst.Name()
	if name == "" {
		return fmt.Errorf("cannot register installer with empty name")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.installers == nil {
		r.installers = make(map[string]Installer)
	}

	if _, exists := r.installers[name]; exists {
		return fmt.Errorf("installer %q is already registered", name)
	}

	r.installers[name] = inst
	return nil
}

// Get retrieves an Installer by name.
// It returns an error if the installer is not found.
func (r *Registry) Get(name string) (Installer, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.installers == nil {
		return nil, fmt.Errorf("installer %q not found", name)
	}

	inst, exists := r.installers[name]
	if !exists {
		return nil, fmt.Errorf("installer %q not found", name)
	}
	return inst, nil
}

// List returns a slice of all registered installer names.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.installers == nil {
		return nil
	}

	names := make([]string, 0, len(r.installers))
	for name := range r.installers {
		names = append(names, name)
	}
	return names
}

var (
	globalRegistry = NewRegistry()
)

// DefaultRegistry returns the package-level global registry.
func DefaultRegistry() *Registry {
	return globalRegistry
}

// Register registers an Installer to the global registry.
func Register(inst Installer) error {
	return globalRegistry.Register(inst)
}

// Get retrieves an Installer from the global registry.
func Get(name string) (Installer, error) {
	return globalRegistry.Get(name)
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

func getBoolParam(params map[string]interface{}, key string, defaultValue bool) bool {
	if params == nil {
		return defaultValue
	}
	val, ok := params[key]
	if !ok {
		return defaultValue
	}
	if b, ok := val.(bool); ok {
		return b
	}
	if s, ok := val.(string); ok {
		return s == "true" || s == "yes" || s == "1"
	}
	return defaultValue
}

func getStringSliceParam(params map[string]interface{}, key string) []string {
	if params == nil {
		return nil
	}
	val, ok := params[key]
	if !ok {
		return nil
	}
	if str, ok := val.(string); ok {
		return []string{str}
	}
	if slice, ok := val.([]interface{}); ok {
		var res []string
		for _, item := range slice {
			if s, ok := item.(string); ok {
				res = append(res, s)
			}
		}
		return res
	}
	if slice, ok := val.([]string); ok {
		return slice
	}
	return nil
}

// IsRealBinaryPath returns true if the path is a real binary executable and not dotfiles' own generated shim or targetDir shim.
func IsRealBinaryPath(ctx context.Context, fsys fs.FS, path string) bool {
	if path == "" {
		return false
	}

	cleanPath := path
	if absPath, err := fsys.Abs(cleanPath); err == nil {
		cleanPath = absPath
	}

	projCfg := config.GetProjectConfig(ctx)
	if projCfg != nil && projCfg.Paths.TargetDir != "" {
		targetDir := projCfg.Paths.TargetDir
		if strings.HasPrefix(targetDir, "~") {
			targetDir = utils.ExpandHomePath(projCfg.Paths.HomeDir, targetDir)
		}
		if absTarget, err := fsys.Abs(targetDir); err == nil {
			targetDir = absTarget
		}
		if filepath.Dir(cleanPath) == filepath.Clean(targetDir) {
			return false
		}
	}

	// Always reject paths inside .generated/bin even if projCfg is nil
	slashPath := filepath.ToSlash(cleanPath)
	if strings.Contains(slashPath, "/.generated/bin/") || strings.HasSuffix(slashPath, "/.generated/bin") || (filepath.Base(filepath.Dir(cleanPath)) == "bin" && filepath.Base(filepath.Dir(filepath.Dir(cleanPath))) == ".generated") {
		return false
	}

	exists, err := fsys.Exists(path)
	if err != nil || !exists {
		return false
	}

	shimGen := shim.NewGenerator(fsys)
	if isShim, err := shimGen.IsGeneratedShim(path); err == nil && isShim {
		return false
	}

	return true
}

// ResolveBinaryPaths resolves system or prefix paths for declared binaries, skipping generated shims.
func ResolveBinaryPaths(ctx context.Context, fsys fs.FS, binNames []string, fallbackFunc func(binName string) string) []string {
	projCfg := config.GetProjectConfig(ctx)
	targetDirClean := ""
	if projCfg != nil && projCfg.Paths.TargetDir != "" {
		targetDirClean = projCfg.Paths.TargetDir
		if strings.HasPrefix(targetDirClean, "~") {
			targetDirClean = utils.ExpandHomePath(projCfg.Paths.HomeDir, targetDirClean)
		}
		if abs, err := fsys.Abs(targetDirClean); err == nil {
			targetDirClean = abs
		}
	}

	pathEnv := os.Getenv("PATH")
	var dirs []string
	if pathEnv != "" {
		dirs = filepath.SplitList(pathEnv)
	}

	var resolved []string
	for _, binName := range binNames {
		// 1. Try searching $PATH excluding targetDir and shims (Nix / custom PATH support)
		foundInPath := ""
		if len(dirs) > 0 {
			for _, dir := range dirs {
				if dir == "" {
					continue
				}
				cleanDir := dir
				if strings.HasPrefix(cleanDir, "~") && projCfg != nil {
					cleanDir = utils.ExpandHomePath(projCfg.Paths.HomeDir, cleanDir)
				}
				if abs, err := fsys.Abs(cleanDir); err == nil {
					cleanDir = abs
				}
				if targetDirClean != "" && cleanDir == targetDirClean {
					continue
				}
				cand := filepath.Join(cleanDir, binName)
				if exists, err := fsys.Exists(cand); err == nil && exists {
					if IsRealBinaryPath(ctx, fsys, cand) {
						foundInPath = cand
						break
					}
				}
			}
		}

		if foundInPath != "" {
			resolved = append(resolved, foundInPath)
			continue
		}

		// 2. Try installer-provided fallback function or raw binary name
		var fbPath string
		if fallbackFunc != nil {
			fbPath = fallbackFunc(binName)
		}

		if fbPath != "" {
			resolved = append(resolved, fbPath)
		} else {
			resolved = append(resolved, binName)
		}
	}
	return resolved
}

// IsDryRun checks if the dry-run flag is present in the command-line arguments or set via environment.
func IsDryRun() bool {
	if os.Getenv("DOTFILES_DRY_RUN") == "true" {
		return true
	}
	for _, arg := range os.Args {
		if arg == "--dry-run" || arg == "-d" {
			return true
		}
	}
	return false
}

// GetBinaryNames returns the binary names declared in a tool config's Binaries slice.
func GetBinaryNames(toolName string, toolBinaries []interface{}) []string {
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
	if len(names) == 0 {
		names = []string{toolName}
	}
	return names
}

// removeAll recursively removes files and directories from the fsys.
func removeAll(fsys fs.FS, path string) error {
	if r, ok := fsys.(interface{ RemoveAll(string) error }); ok {
		return r.RemoveAll(path)
	}
	exists, err := fsys.Exists(path)
	if err != nil || !exists {
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

type FSSetter interface {
	SetFS(fs.FS)
}

type LoggerSetter interface {
	SetLogger(*logger.Logger)
}

type DownloadCacheSetter interface {
	SetDownloadCache(cacheDir string, ttl time.Duration, enabled bool)
}

// SetFS dynamically binds the orchestrator's context-aware TrackedFileSystem to installer plugins prior to execution.
func SetFS(inst Installer, fsys fs.FS) {
	if s, ok := inst.(FSSetter); ok {
		s.SetFS(fsys)
	}
}

// SetLogger dynamically binds the orchestrator's context-aware Logger to installer plugins prior to execution.
func SetLogger(inst Installer, log *logger.Logger) {
	if s, ok := inst.(LoggerSetter); ok {
		s.SetLogger(log)
	}
}

// SetDownloadCache dynamically configures persistent download caching on installer plugins prior to execution.
func SetDownloadCache(inst Installer, cacheDir string, ttl time.Duration, enabled bool) {
	if s, ok := inst.(DownloadCacheSetter); ok {
		s.SetDownloadCache(cacheDir, ttl, enabled)
	}
}

// ApplyDownloadCacheSettings updates downloader configuration with the provided cache directory, TTL, and enabled flag.
func ApplyDownloadCacheSettings(dl *downloader.Downloader, cacheDir string, ttl time.Duration, enabled bool) {
	if dl == nil {
		return
	}
	if cacheDir != "" {
		dl.CacheDir = cacheDir
	}
	if ttl > 0 {
		dl.CacheTTL = ttl
	}
	dl.CacheEnabled = enabled
}

// ValidateSudo checks if a tool requires sudo elevation and verifies whether the installer supports it.
// Returns an error if tool.Sudo is true but the installer does not support sudo elevation.
func ValidateSudo(inst Installer, tool *config.ToolConfig) error {
	if inst == nil {
		return fmt.Errorf("installer cannot be nil")
	}
	if tool != nil && tool.Sudo && !inst.SupportsSudo() {
		return fmt.Errorf("installer %q does not support sudo elevation", inst.Name())
	}
	return nil
}

// PromoteBinaries searches recursively inside destDir for files matching the expected binary names
// or their pattern definitions, and promotes (moves) them to the root of destDir.
// It returns the list of promoted binary names, or an error.
func PromoteBinaries(fsys fs.FS, destDir string, toolName string, toolBinaries []interface{}) ([]string, error) {
	binaryNames := GetBinaryNames(toolName, toolBinaries)

	for _, binName := range binaryNames {
		targetPath := filepath.Join(destDir, binName)

		// 1. If it already exists directly at targetPath as a regular file, nothing to do.
		targetInfo, statErr := fsys.Stat(targetPath)
		if statErr == nil && targetInfo.IsDir() {
			subBin := filepath.Join(targetPath, "bin", binName)
			if subInfo, subErr := fsys.Stat(subBin); subErr == nil && !subInfo.IsDir() {
				rootDir := targetPath + "-root"
				_ = fsys.RemoveAll(rootDir)
				if err := fsys.Rename(targetPath, rootDir); err == nil {
					relPath := filepath.Join(filepath.Base(rootDir), "bin", binName)
					_ = fsys.Chmod(filepath.Join(rootDir, "bin", binName), 0755)
					if errSym := fsys.Symlink(relPath, targetPath); errSym == nil {
						continue
					}
				}
			}
		} else if statErr == nil {
			_ = fsys.Chmod(targetPath, 0755)
			continue
		}

		// 2. Otherwise, find it recursively under destDir.
		foundPath, err := findFileRecursively(fsys, destDir, binName)
		if err != nil {
			return nil, fmt.Errorf("searching for binary %q: %w", binName, err)
		}

		if foundPath == "" {
			// Try with pattern matching from BinaryConfig if present
			pattern := getPatternForBinary(toolBinaries, binName)
			if pattern != "" {
				foundPath, err = findFileByPattern(fsys, destDir, pattern)
				if err != nil {
					return nil, fmt.Errorf("searching for binary %q with pattern %q: %w", binName, pattern, err)
				}
			}
		}

		if foundPath != "" {
			if foundPath == targetPath {
				_ = fsys.Chmod(targetPath, 0755)
				continue
			}

			// If the binary is nested in a subfolder (like go-root/bin/go or mytool-root/bin/mytool),
			// create a relative symlink first so toolchain assets (src, pkg, lib) stay intact relative to binary.
			relPath, errRel := filepath.Rel(destDir, foundPath)
			if errRel == nil && (strings.Contains(relPath, "/") || strings.Contains(relPath, "\\")) {
				_ = fsys.Chmod(foundPath, 0755)
				if exists, _ := fsys.Exists(targetPath); exists {
					_ = fsys.Remove(targetPath)
				}
				if errSym := fsys.Symlink(relPath, targetPath); errSym == nil {
					continue
				}
			}

			// Fallback: move binary directly to root of destDir
			if err := fsys.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return nil, fmt.Errorf("creating directory for promoted binary %q: %w", binName, err)
			}
			if exists, _ := fsys.Exists(targetPath); exists {
				_ = fsys.Remove(targetPath)
			}
			if err := fsys.Rename(foundPath, targetPath); err != nil {
				return nil, fmt.Errorf("promoting binary from %q to %q: %w", foundPath, targetPath, err)
			}
			_ = fsys.Chmod(targetPath, 0755)
		} else {
			displayDir := formatDisplayPath(fsys, destDir)
			return nil, fmt.Errorf("binary %q not found in extracted archive under %q", binName, displayDir)
		}
	}

	return binaryNames, nil
}

func formatDisplayPath(fsys fs.FS, path string) string {
	type homeDirProvider interface {
		HomeDir() string
	}
	home := ""
	if hdp, ok := fsys.(homeDirProvider); ok {
		home = hdp.HomeDir()
	}
	if home == "" {
		if uHome, err := os.UserHomeDir(); err == nil {
			home = uHome
		}
	}
	return utils.ContractHomePath(home, path)
}

func findFileRecursively(fsys fs.FS, dir string, name string) (string, error) {
	entries, err := fsys.ReadDir(dir)
	if err != nil {
		return "", err
	}

	for _, entryName := range entries {
		path := filepath.Join(dir, entryName)
		info, err := fsys.Lstat(path)
		if err != nil {
			continue
		}

		if info.IsDir() {
			found, err := findFileRecursively(fsys, path, name)
			if err == nil && found != "" {
				return found, nil
			}
		} else {
			if info.Name() == name {
				return path, nil
			}
		}
	}

	return "", nil
}

func findFileByPattern(fsys fs.FS, destDir string, pattern string) (string, error) {
	normalizedPattern := filepath.Clean(strings.ReplaceAll(pattern, "/", string(filepath.Separator)))
	path := filepath.Join(destDir, normalizedPattern)
	exists, err := fsys.Exists(path)
	if err == nil && exists {
		return path, nil
	}
	return "", nil
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

func compileRegex(pattern string) (*regexp.Regexp, error) {
	if inner, flags, ok := ParseSlashRegex(pattern); ok {
		if strings.Contains(flags, "i") {
			inner = "(?i)" + inner
		}
		if strings.Contains(flags, "m") {
			inner = "(?m)" + inner
		}
		if strings.Contains(flags, "s") {
			inner = "(?s)" + inner
		}
		return regexp.Compile(inner)
	}
	return regexp.Compile(pattern)
}

func detectVersionViaCli(ctx context.Context, runner exec.CommandRunner, binaryPath string, args []string, regex string) (string, error) {
	cmd := runner.CommandContext(ctx, binaryPath, args...)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("executing binary %s: %w", binaryPath, err)
	}

	outputStr := string(out)
	if regex == "" {
		return strings.TrimSpace(outputStr), nil
	}

	re, err := compileRegex(regex)
	if err != nil {
		return "", fmt.Errorf("compiling regex %q: %w", regex, err)
	}

	matches := re.FindStringSubmatch(outputStr)
	if len(matches) > 1 {
		return matches[1], nil
	} else if len(matches) > 0 {
		return matches[0], nil
	}

	return "", fmt.Errorf("no regex match found in output: %q", outputStr)
}
