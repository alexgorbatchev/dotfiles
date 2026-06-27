package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type InstallResult struct {
	Binaries []string
	ShellEnv map[string]string
}

type UpdateCheckResult struct {
	HasUpdate     bool
	LocalVersion  string
	LatestVersion string
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

// SetFS dynamically binds the orchestrator's context-aware TrackedFileSystem to installer plugins prior to execution.
func SetFS(inst Installer, fsys fs.FS) {
	switch v := inst.(type) {
	case *AptInstaller:
		v.fsys = fsys
	case *BrewInstaller:
		v.fsys = fsys
	case *CargoInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
		if v.extractor != nil {
			v.extractor.SetFS(fsys)
		}
	case *CurlBinaryInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
	case *CurlScriptInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
	case *CurlTarInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
		if v.extractor != nil {
			v.extractor.SetFS(fsys)
		}
	case *DmgInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
		if v.extractor != nil {
			v.extractor.SetFS(fsys)
		}
	case *DnfInstaller:
		v.fsys = fsys
	case *GiteaInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
		if v.extractor != nil {
			v.extractor.SetFS(fsys)
		}
	case *GitHubInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
		if v.extractor != nil {
			v.extractor.SetFS(fsys)
		}
	case *ManualInstaller:
		v.fsys = fsys
	case *NpmInstaller:
		v.fsys = fsys
	case *PacmanInstaller:
		v.fsys = fsys
	case *PkgInstaller:
		v.fsys = fsys
		if v.dl != nil {
			v.dl.SetFS(fsys)
		}
		if v.extractor != nil {
			v.extractor.SetFS(fsys)
		}
	case *ZshPluginInstaller:
		v.fsys = fsys
	}
}

// SetLogger dynamically binds the orchestrator's context-aware Logger to installer plugins prior to execution.
func SetLogger(inst Installer, log *logger.Logger) {
	switch v := inst.(type) {
	case *AptInstaller:
		v.log = log
	case *BrewInstaller:
		v.log = log
	case *CargoInstaller:
		v.log = log
	case *CurlBinaryInstaller:
		v.log = log
	case *CurlScriptInstaller:
		v.log = log
	case *CurlTarInstaller:
		v.log = log
	case *DmgInstaller:
		v.log = log
	case *DnfInstaller:
		v.log = log
	case *GiteaInstaller:
		v.log = log
	case *GitHubInstaller:
		v.log = log
	case *ManualInstaller:
		v.log = log
	case *NpmInstaller:
		v.log = log
	case *PacmanInstaller:
		v.log = log
	case *PkgInstaller:
		v.log = log
	case *ZshPluginInstaller:
		v.log = log
	}
}

// PromoteBinaries searches recursively inside destDir for files matching the expected binary names
// or their pattern definitions, and promotes (moves) them to the root of destDir.
// It returns the list of promoted binary names, or an error.
func PromoteBinaries(fsys fs.FS, destDir string, toolName string, toolBinaries []interface{}) ([]string, error) {
	binaryNames := GetBinaryNames(toolName, toolBinaries)

	for _, binName := range binaryNames {
		targetPath := filepath.Join(destDir, binName)

		// 1. If it already exists directly at the root, nothing to do.
		exists, err := fsys.Exists(targetPath)
		if err == nil && exists {
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
			// Promote the found binary to the root of destDir!
			if err := fsys.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return nil, fmt.Errorf("creating directory for promoted binary %q: %w", binName, err)
			}
			// If targetPath exists (e.g. as a directory by mistake), remove it first
			_ = fsys.Remove(targetPath)
			if err := fsys.Rename(foundPath, targetPath); err != nil {
				return nil, fmt.Errorf("promoting binary from %q to %q: %w", foundPath, targetPath, err)
			}
			_ = fsys.Chmod(targetPath, 0755)
		} else {
			return nil, fmt.Errorf("binary %q not found in extracted archive under %q", binName, destDir)
		}
	}

	return binaryNames, nil
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
