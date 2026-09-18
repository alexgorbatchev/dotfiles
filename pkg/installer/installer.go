package installer

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

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

// DownloadSettingsSetter is implemented by installers that download files, so that
// the `downloader` section of the project configuration reaches the downloader they
// use.
type DownloadSettingsSetter interface {
	SetDownloadSettings(downloader.Settings)
}

// GitHubSettings is the credential and identity half of the project configuration's
// `github` section, shared by every installation method that resolves releases
// through the GitHub API.
type GitHubSettings struct {
	// Token authenticates API requests and asset downloads for every tool that does
	// not name a `token` install parameter of its own.
	Token string
	// UserAgent identifies the client to the API; empty selects the built-in value.
	UserAgent string
	// CacheEnabled reuses previously fetched release descriptions when true.
	CacheEnabled bool
}

// GitHubSettingsSetter is implemented by installers that resolve GitHub releases.
type GitHubSettingsSetter interface {
	SetGitHubSettings(GitHubSettings)
}

// HTTPClientSetter is implemented by installers that talk HTTP. SetHTTPClient
// must route both their API calls and their downloads through the client, so
// that a caller who injects one (the development proxy) captures all traffic.
type HTTPClientSetter interface {
	SetHTTPClient(client *http.Client)
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

// SetDownloadSettings dynamically configures caching, timeout and retry policy on
// installer plugins prior to execution.
func SetDownloadSettings(inst Installer, settings downloader.Settings) {
	if s, ok := inst.(DownloadSettingsSetter); ok {
		s.SetDownloadSettings(settings)
	}
}

// SetGitHubSettings dynamically configures GitHub API access on installer plugins
// prior to execution.
func SetGitHubSettings(inst Installer, settings GitHubSettings) {
	if s, ok := inst.(GitHubSettingsSetter); ok {
		s.SetGitHubSettings(settings)
	}
}

// SetHTTPClient routes an installer's HTTP traffic through client when the installer performs any.
func SetHTTPClient(inst Installer, client *http.Client) {
	if s, ok := inst.(HTTPClientSetter); ok {
		s.SetHTTPClient(client)
	}
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

// PromoteBinaries makes every binary a tool declares with .bin() available at the root of
// destDir under its declared name and returns the declared names. Each binary is located
// by its .bin() pattern, or by the default pattern when none was given (see
// findBinaryByPattern). A match already at the root is made executable in place; a match
// nested in a subdirectory is reached through a relative symlink at the root so that the
// files it ships with (lib, src, completions) stay where the binary expects them; a match
// at the root under another name is renamed.
//
// All binaries are located before any is promoted: promoting one may move a directory
// aside (see clearBinaryName), and a pattern written against the archive layout must not
// be evaluated against the rearranged tree.
func PromoteBinaries(fsys fs.FS, destDir string, toolName string, toolBinaries []interface{}) ([]string, error) {
	binaryNames := GetBinaryNames(toolName, toolBinaries)

	located := make([]string, len(binaryNames))
	for i, binName := range binaryNames {
		pattern := getPatternForBinary(toolBinaries, binName)
		if pattern == "" {
			pattern = defaultBinaryPattern(binName)
		}
		foundPath, err := findBinaryByPattern(fsys, destDir, pattern, binName)
		if err != nil {
			return nil, fmt.Errorf("searching for binary %q: %w", binName, err)
		}
		if foundPath == "" {
			return nil, fmt.Errorf("binary %q not found in extracted archive under %q: nothing matches pattern %q",
				binName, formatDisplayPath(fsys, destDir), pattern)
		}
		located[i] = foundPath
	}

	for i, binName := range binaryNames {
		movedFrom, movedTo, err := promoteBinary(fsys, destDir, binName, located[i])
		if err != nil {
			return nil, err
		}
		if movedFrom == "" {
			continue
		}
		for j := i + 1; j < len(located); j++ {
			if rest, ok := strings.CutPrefix(located[j], movedFrom+string(filepath.Separator)); ok {
				located[j] = movedTo + string(filepath.Separator) + rest
			}
		}
	}

	return binaryNames, nil
}

// promoteBinary exposes foundPath as destDir/binName. When a directory occupying that
// name had to be moved aside, the returned pair is its old and new path so that the
// caller can follow binaries located inside it.
func promoteBinary(fsys fs.FS, destDir, binName, foundPath string) (movedFrom, movedTo string, err error) {
	targetPath := filepath.Join(destDir, binName)
	if foundPath == targetPath {
		return "", "", makeExecutable(fsys, targetPath)
	}

	relPath, err := filepath.Rel(destDir, foundPath)
	if err != nil {
		return "", "", fmt.Errorf("resolving %q relative to %q: %w", foundPath, destDir, err)
	}
	relPath, movedFrom, movedTo, err = clearBinaryName(fsys, destDir, binName, relPath)
	if err != nil {
		return "", "", err
	}
	foundPath = filepath.Join(destDir, relPath)
	if err := makeExecutable(fsys, foundPath); err != nil {
		return "", "", err
	}

	if strings.ContainsRune(relPath, filepath.Separator) {
		// A relative symlink keeps the binary inside the layout it was shipped in. A file
		// system that cannot create symlinks gets the binary moved to the root instead.
		if err := fsys.Symlink(relPath, targetPath); err == nil {
			return movedFrom, movedTo, nil
		}
	}
	if err := fsys.Rename(foundPath, targetPath); err != nil {
		return "", "", fmt.Errorf("promoting binary from %q to %q: %w", foundPath, targetPath, err)
	}
	return movedFrom, movedTo, nil
}

// clearBinaryName frees destDir/binName for the promoted binary and returns where relPath
// lives afterwards. A stale file or symlink left by an earlier promotion is removed. A
// directory is moved aside to <binName>-root rather than deleted: an archive laid out as
// go/bin/go keeps its toolchain in that directory. The moved directory's old and new paths
// are returned so that binaries located inside it can be followed.
func clearBinaryName(fsys fs.FS, destDir, binName, relPath string) (newRelPath, movedFrom, movedTo string, err error) {
	targetPath := filepath.Join(destDir, binName)
	info, err := fsys.Lstat(targetPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return relPath, "", "", nil
		}
		return "", "", "", fmt.Errorf("inspecting %q: %w", targetPath, err)
	}
	if !info.IsDir() {
		if err := fsys.Remove(targetPath); err != nil {
			return "", "", "", fmt.Errorf("removing stale %q: %w", targetPath, err)
		}
		return relPath, "", "", nil
	}

	rootDir := targetPath + "-root"
	if err := fsys.RemoveAll(rootDir); err != nil {
		return "", "", "", fmt.Errorf("removing %q: %w", rootDir, err)
	}
	if err := fsys.Rename(targetPath, rootDir); err != nil {
		return "", "", "", fmt.Errorf("moving directory %q aside to %q: %w", targetPath, rootDir, err)
	}
	if rest, ok := strings.CutPrefix(relPath, binName+string(filepath.Separator)); ok {
		relPath = filepath.Join(filepath.Base(rootDir), rest)
	}
	return relPath, targetPath, rootDir, nil
}

func makeExecutable(fsys fs.FS, path string) error {
	if err := fsys.Chmod(path, 0755); err != nil {
		return fmt.Errorf("making %q executable: %w", path, err)
	}
	return nil
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
