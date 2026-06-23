package installer

import (
	"context"
	"fmt"
	"os"
	"sync"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
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

// IsDryRun checks if the dry-run flag is present in the command-line arguments.
func IsDryRun() bool {
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
		}
	}
	if len(names) == 0 {
		names = []string{toolName}
	}
	return names
}
