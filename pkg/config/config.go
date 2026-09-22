package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// CacheConfig defines the cache settings.
type CacheConfig struct {
	// Enabled turns the cache off when false. Nil means the default, which is on.
	Enabled *bool `json:"enabled,omitempty" yaml:"enabled,omitempty"`
	// TTL is how long a cached entry is reused, in milliseconds. Zero selects the
	// consumer's own default.
	TTL int64 `json:"ttl" yaml:"ttl"`
}

// IsEnabled reports whether the cache is on, which is what a configuration that
// says nothing about it asks for.
func (c CacheConfig) IsEnabled() bool {
	return c.Enabled == nil || *c.Enabled
}

// HostConfig defines host-specific API and auth settings.
type HostConfig struct {
	Host      string      `json:"host" yaml:"host"`
	Cache     CacheConfig `json:"cache" yaml:"cache"`
	Token     string      `json:"token" yaml:"token"`
	UserAgent string      `json:"userAgent" yaml:"userAgent"`
}

// PathsConfig defines directory paths for the orchestrator.
type PathsConfig struct {
	HomeDir         string      `json:"homeDir" yaml:"homeDir"`
	DotfilesDir     string      `json:"dotfilesDir" yaml:"dotfilesDir"`
	TargetDir       string      `json:"targetDir" yaml:"targetDir"`
	GeneratedDir    string      `json:"generatedDir" yaml:"generatedDir"`
	ToolConfigsDir  interface{} `json:"toolConfigsDir" yaml:"toolConfigsDir"`
	ShellScriptsDir string      `json:"shellScriptsDir" yaml:"shellScriptsDir"`
	BinariesDir     string      `json:"binariesDir" yaml:"binariesDir"`
}

// GetToolConfigsDirs returns every configured tool configuration directory, whether the
// setting was written as a string or as a list. On a configuration that has been through
// ResolvePlaceholders these are absolute directories ready to scan, including the default
// that ResolvePlaceholders fills in; on a raw one they are whatever the configuration
// declared, which may be empty.
func (p PathsConfig) GetToolConfigsDirs() []string {
	var entries []interface{}
	switch v := p.ToolConfigsDir.(type) {
	case string:
		entries = []interface{}{v}
	case []string:
		for _, s := range v {
			entries = append(entries, s)
		}
	case []interface{}:
		entries = v
	}

	var dirs []string
	for _, entry := range entries {
		if s, ok := entry.(string); ok && s != "" {
			dirs = append(dirs, s)
		}
	}
	return dirs
}

// GetPrimaryToolConfigsDir returns the tool configuration directory the CLI writes to,
// or "" when the configuration names none.
func (p PathsConfig) GetPrimaryToolConfigsDir() string {
	dirs := p.GetToolConfigsDirs()
	if len(dirs) == 0 {
		return ""
	}
	return dirs[0]
}

// SystemConfig defines system elevation settings.
type SystemConfig struct {
	SudoPrompt string `json:"sudoPrompt" yaml:"sudoPrompt"`
}

// CargoConfig defines Cargo registry and repository hosts.
type CargoConfig struct {
	CratesIo      HostConfig `json:"cratesIo" yaml:"cratesIo"`
	GithubRaw     HostConfig `json:"githubRaw" yaml:"githubRaw"`
	GithubRelease HostConfig `json:"githubRelease" yaml:"githubRelease"`
	UserAgent     string     `json:"userAgent" yaml:"userAgent"`
}

// DownloaderConfig defines general downloader configurations.
type DownloaderConfig struct {
	// Timeout bounds a single download attempt, in milliseconds. Zero leaves the
	// attempt unbounded.
	Timeout int64 `json:"timeout" yaml:"timeout"`
	// RetryCount is how many times a failed attempt is repeated. Zero attempts the
	// download once.
	RetryCount int64 `json:"retryCount" yaml:"retryCount"`
	// RetryDelay is the base delay between attempts, in milliseconds, multiplied by
	// the attempt number for linear backoff.
	RetryDelay int64       `json:"retryDelay" yaml:"retryDelay"`
	Cache      CacheConfig `json:"cache" yaml:"cache"`
}

// CatalogConfig defines CATALOG.md generation configuration.
type CatalogConfig struct {
	Generate bool   `json:"generate" yaml:"generate"`
	FilePath string `json:"filePath" yaml:"filePath"`
}

// ShellInstallConfig defines target shells configurations.
type ShellInstallConfig struct {
	Zsh        string `json:"zsh,omitempty" yaml:"zsh,omitempty"`
	Bash       string `json:"bash,omitempty" yaml:"bash,omitempty"`
	Powershell string `json:"powershell,omitempty" yaml:"powershell,omitempty"`
}

// FeaturesConfig defines core features configurations.
type FeaturesConfig struct {
	Catalog      CatalogConfig       `json:"catalog" yaml:"catalog"`
	ShellInstall *ShellInstallConfig `json:"shellInstall,omitempty" yaml:"shellInstall,omitempty"`
}

// ProjectConfig is the root configuration structure matching packages/core/src/config/projectConfigSchema.ts.
type ProjectConfig struct {
	Paths      PathsConfig      `json:"paths" yaml:"paths"`
	System     SystemConfig     `json:"system" yaml:"system"`
	Github     HostConfig       `json:"github" yaml:"github"`
	Cargo      CargoConfig      `json:"cargo" yaml:"cargo"`
	Downloader DownloaderConfig `json:"downloader" yaml:"downloader"`
	Features   FeaturesConfig   `json:"features" yaml:"features"`
	// ConfigFileDir is the directory holding the configuration file this configuration
	// was read from. It is what every relative setting is anchored to, and what
	// `{configFileDir}` and `ctx.configFileDir` mean, so whoever evaluates a hook or
	// resolver later has to be able to ask for it rather than reach for a setting
	// that merely tends to hold the same value.
	// ResolvePlaceholders records it, because that is where the directory is known.
	//
	// It is not part of the configuration's JSON surface: an author does not write it,
	// and a configuration that claimed a different directory than the one it was read
	// from would be describing a layout that does not exist.
	ConfigFileDir string `json:"-" yaml:"-"`
}

// Validate reports whether the three anchor paths every other path is derived from
// hold a value. It runs at the end of a load, after ResolvePlaceholders has applied
// the defaults, so it fails only for a setting that has neither a value in the
// configuration nor a default the environment could supply: paths.homeDir when no
// home directory can be discovered, for instance.
func (p *ProjectConfig) Validate() error {
	if p.Paths.HomeDir == "" {
		return fmt.Errorf("paths.homeDir is required")
	}
	if p.Paths.DotfilesDir == "" {
		return fmt.Errorf("paths.dotfilesDir is required")
	}
	if p.Paths.TargetDir == "" {
		return fmt.Errorf("paths.targetDir is required")
	}
	return nil
}

// BinaryConfig defines settings for pattern-based binary execution detection.
type BinaryConfig struct {
	Name    string `json:"name" yaml:"name"`
	Pattern string `json:"pattern" yaml:"pattern"`
	// Shim is whether a shim is generated for the binary in the target directory.
	// Nil means the default, which is to generate one.
	Shim *bool `json:"shim,omitempty" yaml:"shim,omitempty"`
}

// WantsShim reports whether a shim should be generated for the binary.
func (bc *BinaryConfig) WantsShim() bool {
	return bc.Shim == nil || *bc.Shim
}

// Validate checks that the BinaryConfig contains required fields.
func (bc *BinaryConfig) Validate() error {
	if bc.Name == "" {
		return fmt.Errorf("binary name cannot be empty")
	}
	if bc.Pattern == "" {
		return fmt.Errorf("binary pattern cannot be empty")
	}
	return nil
}

// SymlinkConfig represents standard symbolic link directives.
type SymlinkConfig struct {
	Source string `json:"source" yaml:"source"`
	Target string `json:"target" yaml:"target"`
	// Mode is the permission enforced on what the link points at. A symlink has no
	// permission of its own, so this is applied to the source file: it is how a
	// private key declared here ends up at 0600 without an imperative chmod hook.
	Mode string `json:"mode,omitempty" yaml:"mode,omitempty"`
}

// Validate ensures symlink configurations are populated.
func (sc *SymlinkConfig) Validate() error {
	if sc.Source == "" {
		return fmt.Errorf("symlink source path cannot be empty")
	}
	if sc.Target == "" {
		return fmt.Errorf("symlink target path cannot be empty")
	}
	return validateOptionalMode(sc.Mode)
}

// CopyConfig represents standard file/directory copy operations.
type CopyConfig struct {
	Source string `json:"source" yaml:"source"`
	Target string `json:"target" yaml:"target"`
	Mode   string `json:"mode,omitempty" yaml:"mode,omitempty"`
	// Conflict is what to do when both the copied file and its source have changed
	// since dotfiles last wrote it. An empty value means the default, "merge".
	Conflict string `json:"conflict,omitempty" yaml:"conflict,omitempty"`
}

// Validate ensures copy configurations are populated.
func (cc *CopyConfig) Validate() error {
	if cc.Source == "" {
		return fmt.Errorf("copy source path cannot be empty")
	}
	if cc.Target == "" {
		return fmt.Errorf("copy target path cannot be empty")
	}
	if err := validateOptionalMode(cc.Mode); err != nil {
		return err
	}
	return validateOneOf("conflict", cc.Conflict, validConflicts)
}

// Shell script kinds. Every script-like DSL call lands in one ordered list so the
// generated shell block keeps the order the tool author wrote.
const (
	ShellScriptOnce           = "once"           // .once(): runs on the first shell start, then self-deletes
	ShellScriptAlways         = "always"         // .always(): inline on every shell start
	ShellScriptSourceFile     = "sourceFile"     // .sourceFile(): source a file when it exists
	ShellScriptSource         = "source"         // .source(): source the output of inline shell code
	ShellScriptSourceFunction = "sourceFunction" // .sourceFunction(): source the output of a declared function
)

// ShellScript is one script-like shell configuration call: its kind and its
// argument (script body, file path or function name depending on the kind).
type ShellScript struct {
	Kind  string `json:"kind" yaml:"kind"`
	Value string `json:"value" yaml:"value"`
}

// Validate checks if the shell script kind is known and its value populated.
func (ss *ShellScript) Validate() error {
	switch ss.Kind {
	case ShellScriptOnce, ShellScriptAlways, ShellScriptSourceFile, ShellScriptSource, ShellScriptSourceFunction:
	default:
		return fmt.Errorf("shell script kind must be one of 'once', 'always', 'sourceFile', 'source' or 'sourceFunction', got %q", ss.Kind)
	}
	if ss.Value == "" {
		return fmt.Errorf("shell script value cannot be empty")
	}
	return nil
}

// ShellTypeConfig structures scripts, aliases, environment fields, functions, PATH extensions, and completions.
type ShellTypeConfig struct {
	Scripts     []ShellScript     `json:"scripts,omitempty" yaml:"scripts,omitempty"`
	Aliases     map[string]string `json:"aliases,omitempty" yaml:"aliases,omitempty"`
	Env         map[string]string `json:"env,omitempty" yaml:"env,omitempty"`
	Functions   map[string]string `json:"functions,omitempty" yaml:"functions,omitempty"`
	Paths       []interface{}     `json:"paths,omitempty" yaml:"paths,omitempty"`
	Completions interface{}       `json:"completions,omitempty" yaml:"completions,omitempty"`
}

// Validate asserts nested elements of ShellTypeConfig.
func (stc *ShellTypeConfig) Validate() error {
	for _, s := range stc.Scripts {
		if err := s.Validate(); err != nil {
			return err
		}
	}
	return nil
}

// ShellConfigs manages Zsh, Bash, and PowerShell setups.
type ShellConfigs struct {
	Zsh        *ShellTypeConfig `json:"zsh,omitempty" yaml:"zsh,omitempty"`
	Bash       *ShellTypeConfig `json:"bash,omitempty" yaml:"bash,omitempty"`
	Powershell *ShellTypeConfig `json:"powershell,omitempty" yaml:"powershell,omitempty"`
}

// Validate checks all nested shells.
func (sc *ShellConfigs) Validate() error {
	if sc.Zsh != nil {
		if err := sc.Zsh.Validate(); err != nil {
			return err
		}
	}
	if sc.Bash != nil {
		if err := sc.Bash.Validate(); err != nil {
			return err
		}
	}
	if sc.Powershell != nil {
		if err := sc.Powershell.Validate(); err != nil {
			return err
		}
	}
	return nil
}

// ToolConfigUpdateCheck configures semver checks and boundaries.
type ToolConfigUpdateCheck struct {
	Enabled    *bool   `json:"enabled,omitempty" yaml:"enabled,omitempty"`
	Constraint *string `json:"constraint,omitempty" yaml:"constraint,omitempty"`
}

// UpdateCheckEnabled reports whether update checks should consider this tool. A tool
// that declares no updateCheck block, or leaves enabled unset, is checked.
func (tc *ToolConfig) UpdateCheckEnabled() bool {
	return tc.UpdateCheck == nil || tc.UpdateCheck.Enabled == nil || *tc.UpdateCheck.Enabled
}

// UpdateCheckConstraint returns the semver range bounding which versions count as an
// available update for this tool, or "" when it declares none.
func (tc *ToolConfig) UpdateCheckConstraint() string {
	if tc.UpdateCheck == nil || tc.UpdateCheck.Constraint == nil {
		return ""
	}
	return *tc.UpdateCheck.Constraint
}

// ToolConfig matches complete configurations of individual packages or tools.
type ToolConfig struct {
	Name               string                 `json:"name" yaml:"name"`
	Version            *string                `json:"version,omitempty" yaml:"version,omitempty"`
	ConfigFilePath     string                 `json:"configFilePath,omitempty" yaml:"configFilePath,omitempty"`
	Binaries           []interface{}          `json:"binaries,omitempty" yaml:"binaries,omitempty"` // Can be strings or BinaryConfigs
	Dependencies       []string               `json:"dependencies,omitempty" yaml:"dependencies,omitempty"`
	Disabled           bool                   `json:"disabled,omitempty" yaml:"disabled,omitempty"`
	Hostname           string                 `json:"hostname,omitempty" yaml:"hostname,omitempty"`
	Sudo               bool                   `json:"sudo,omitempty" yaml:"sudo,omitempty"`
	ShellConfigs       *ShellConfigs          `json:"shellConfigs,omitempty" yaml:"shellConfigs,omitempty"`
	Symlinks           []SymlinkConfig        `json:"symlinks,omitempty" yaml:"symlinks,omitempty"`
	Copies             []CopyConfig           `json:"copies,omitempty" yaml:"copies,omitempty"`
	Directories        []DirectoryConfig      `json:"directories,omitempty" yaml:"directories,omitempty"`
	Blocks             []BlockConfig          `json:"blocks,omitempty" yaml:"blocks,omitempty"`
	Templates          []TemplateConfig       `json:"templates,omitempty" yaml:"templates,omitempty"`
	UpdateCheck        *ToolConfigUpdateCheck `json:"updateCheck,omitempty" yaml:"updateCheck,omitempty"`
	InstallationMethod string                 `json:"installationMethod,omitempty" yaml:"installationMethod,omitempty"`
	InstallParams      map[string]interface{} `json:"installParams,omitempty" yaml:"installParams,omitempty"`
}

// installParamDefaults lists the install parameters an installation method fills
// in when a tool configuration omits them. Each entry mirrors a default the
// method's v1 schema applied at parse time, so a configuration written against
// v1 keeps its meaning without repeating the value.
var installParamDefaults = map[string]map[string]interface{}{
	"zsh-plugin": {"auto": true},
}

// UnmarshalJSON decodes a tool configuration and materialises the installation
// method's parameter defaults into InstallParams. Decoding is the one point every
// loaded configuration passes through, which lets consumers such as the
// auto-install check read InstallParams directly instead of knowing each
// method's defaults. Unknown properties are rejected, matching the loader's
// strictness for the rest of the document.
func (tc *ToolConfig) UnmarshalJSON(data []byte) error {
	type plain ToolConfig
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode((*plain)(tc)); err != nil {
		return err
	}
	tc.applyInstallParamDefaults()
	return nil
}

// applyInstallParamDefaults sets every default of tc.InstallationMethod whose key
// the configuration did not spell out.
func (tc *ToolConfig) applyInstallParamDefaults() {
	defaults, ok := installParamDefaults[tc.InstallationMethod]
	if !ok {
		return
	}
	if tc.InstallParams == nil {
		tc.InstallParams = make(map[string]interface{}, len(defaults))
	}
	for key, value := range defaults {
		if _, set := tc.InstallParams[key]; !set {
			tc.InstallParams[key] = value
		}
	}
}

// Validate asserts the tool configurations correctness.
func (tc *ToolConfig) Validate() error {
	if strings.TrimSpace(tc.Name) == "" {
		return fmt.Errorf("tool name is required")
	}

	for _, sym := range tc.Symlinks {
		if err := sym.Validate(); err != nil {
			return fmt.Errorf("invalid symlink in tool %q: %w", tc.Name, err)
		}
	}

	for _, cp := range tc.Copies {
		if err := cp.Validate(); err != nil {
			return fmt.Errorf("invalid copy in tool %q: %w", tc.Name, err)
		}
	}

	for _, dir := range tc.Directories {
		if err := dir.Validate(); err != nil {
			return fmt.Errorf("invalid directory in tool %q: %w", tc.Name, err)
		}
	}

	for _, blk := range tc.Blocks {
		if err := blk.Validate(); err != nil {
			return fmt.Errorf("invalid block in tool %q: %w", tc.Name, err)
		}
	}

	for _, tmpl := range tc.Templates {
		if err := tmpl.Validate(); err != nil {
			return fmt.Errorf("invalid template in tool %q: %w", tc.Name, err)
		}
	}

	if err := tc.validateUniqueBlocks(); err != nil {
		return err
	}

	if err := tc.ValidateInstallParams(); err != nil {
		return err
	}

	if tc.ShellConfigs != nil {
		if err := tc.ShellConfigs.Validate(); err != nil {
			return fmt.Errorf("invalid shell config in tool %q: %w", tc.Name, err)
		}
	}

	return nil
}

// FindTool searches toolConfigs for a tool matching query by name, name suffix ("--"+query), binary name, or shell alias/function name.
func FindTool(toolConfigs []*ToolConfig, query string) *ToolConfig {
	if strings.TrimSpace(query) == "" {
		return nil
	}
	for _, tc := range toolConfigs {
		if tc.Name == query || strings.HasSuffix(tc.Name, "--"+query) {
			return tc
		}
		for _, b := range tc.Binaries {
			binName := getBinaryName(b)
			if binName == query {
				return tc
			}
		}
		if tc.ShellConfigs != nil {
			shells := []*ShellTypeConfig{
				tc.ShellConfigs.Zsh,
				tc.ShellConfigs.Bash,
				tc.ShellConfigs.Powershell,
			}
			for _, sh := range shells {
				if sh == nil {
					continue
				}
				if _, ok := sh.Aliases[query]; ok {
					return tc
				}
				if _, ok := sh.Functions[query]; ok {
					return tc
				}
			}
		}
	}
	return nil
}

func hasKey(m map[string]interface{}, key string) bool {
	keyLower := strings.ToLower(key)
	for k := range m {
		if strings.ToLower(k) == keyLower {
			return true
		}
	}
	return false
}

// getBinaryName returns the name an entry of ToolConfig.Binaries declares. `.bin()`
// records one object per call (`{name, pattern?, shim?}`), so an entry is a map; the
// typed forms are what Go code builds directly.
func getBinaryName(b interface{}) string {
	switch val := b.(type) {
	case map[string]interface{}:
		if name, ok := val["name"].(string); ok {
			return name
		}
	case BinaryConfig:
		return val.Name
	case *BinaryConfig:
		if val != nil {
			return val.Name
		}
	}
	return ""
}

// Merge deep-merges ShellTypeConfig override into this ShellTypeConfig.
func (stc *ShellTypeConfig) Merge(override *ShellTypeConfig) {
	if len(override.Scripts) > 0 {
		stc.Scripts = append(stc.Scripts, override.Scripts...)
	}
	if len(override.Aliases) > 0 {
		if stc.Aliases == nil {
			stc.Aliases = make(map[string]string)
		}
		for k, v := range override.Aliases {
			stc.Aliases[k] = v
		}
	}
	if len(override.Env) > 0 {
		if stc.Env == nil {
			stc.Env = make(map[string]string)
		}
		for k, v := range override.Env {
			stc.Env[k] = v
		}
	}
	if len(override.Functions) > 0 {
		if stc.Functions == nil {
			stc.Functions = make(map[string]string)
		}
		for k, v := range override.Functions {
			stc.Functions[k] = v
		}
	}
	if len(override.Paths) > 0 {
		stc.Paths = append(stc.Paths, override.Paths...)
	}
	if override.Completions != nil {
		stc.Completions = override.Completions
	}
}

// Merge deep-merges ShellConfigs override into this ShellConfigs.
func (sc *ShellConfigs) Merge(override *ShellConfigs) {
	if override.Zsh != nil {
		if sc.Zsh == nil {
			sc.Zsh = &ShellTypeConfig{}
		}
		sc.Zsh.Merge(override.Zsh)
	}
	if override.Bash != nil {
		if sc.Bash == nil {
			sc.Bash = &ShellTypeConfig{}
		}
		sc.Bash.Merge(override.Bash)
	}
	if override.Powershell != nil {
		if sc.Powershell == nil {
			sc.Powershell = &ShellTypeConfig{}
		}
		sc.Powershell.Merge(override.Powershell)
	}
}

// Merge deep-merges another ToolConfig override into this ToolConfig,
// using rawOverride map to check field presence of primitive fields.
func (tc *ToolConfig) Merge(override *ToolConfig, rawOverride map[string]interface{}) {
	if hasKey(rawOverride, "name") {
		tc.Name = override.Name
	}
	if hasKey(rawOverride, "version") {
		tc.Version = override.Version
	}
	if hasKey(rawOverride, "configFilePath") {
		tc.ConfigFilePath = override.ConfigFilePath
	}
	if len(override.Binaries) > 0 {
		for _, newBin := range override.Binaries {
			newName := getBinaryName(newBin)
			if newName == "" {
				tc.Binaries = append(tc.Binaries, newBin)
				continue
			}
			exists := false
			for _, existing := range tc.Binaries {
				if getBinaryName(existing) == newName {
					exists = true
					break
				}
			}
			if !exists {
				tc.Binaries = append(tc.Binaries, newBin)
			}
		}
	}
	if len(override.Dependencies) > 0 {
		for _, dep := range override.Dependencies {
			exists := false
			for _, existing := range tc.Dependencies {
				if existing == dep {
					exists = true
					break
				}
			}
			if !exists {
				tc.Dependencies = append(tc.Dependencies, dep)
			}
		}
	}
	if hasKey(rawOverride, "disabled") {
		tc.Disabled = override.Disabled
	}
	if hasKey(rawOverride, "hostname") {
		tc.Hostname = override.Hostname
	}
	if hasKey(rawOverride, "sudo") {
		tc.Sudo = override.Sudo
	}
	if override.ShellConfigs != nil {
		if tc.ShellConfigs == nil {
			tc.ShellConfigs = &ShellConfigs{}
		}
		tc.ShellConfigs.Merge(override.ShellConfigs)
	}
	if len(override.Symlinks) > 0 {
		for _, sym := range override.Symlinks {
			exists := false
			for _, existing := range tc.Symlinks {
				if existing.Source == sym.Source && existing.Target == sym.Target {
					exists = true
					break
				}
			}
			if !exists {
				tc.Symlinks = append(tc.Symlinks, sym)
			}
		}
	}
	if len(override.Copies) > 0 {
		for _, cp := range override.Copies {
			exists := false
			for _, existing := range tc.Copies {
				if existing.Source == cp.Source && existing.Target == cp.Target {
					exists = true
					break
				}
			}
			if !exists {
				tc.Copies = append(tc.Copies, cp)
			}
		}
	}
	// The declarative file lists merge the same way: a .platform() block contributes
	// what it declares rather than replacing what was declared outside it, and a
	// declaration repeated in both places is kept once. Identity is the thing being
	// written -- a directory's path, a block's id within its file, a template's
	// target -- not the whole declaration, so restating one with a different mode
	// inside a platform block does not produce two of it.
	for _, dir := range override.Directories {
		if !slices.ContainsFunc(tc.Directories, func(existing DirectoryConfig) bool {
			return existing.Path == dir.Path
		}) {
			tc.Directories = append(tc.Directories, dir)
		}
	}
	for _, blk := range override.Blocks {
		if !slices.ContainsFunc(tc.Blocks, func(existing BlockConfig) bool {
			return existing.Target == blk.Target && existing.ID == blk.ID
		}) {
			tc.Blocks = append(tc.Blocks, blk)
		}
	}
	for _, tmpl := range override.Templates {
		if !slices.ContainsFunc(tc.Templates, func(existing TemplateConfig) bool {
			return existing.Target == tmpl.Target
		}) {
			tc.Templates = append(tc.Templates, tmpl)
		}
	}
	if override.UpdateCheck != nil {
		if tc.UpdateCheck == nil {
			tc.UpdateCheck = &ToolConfigUpdateCheck{}
		}
		if override.UpdateCheck.Enabled != nil {
			tc.UpdateCheck.Enabled = override.UpdateCheck.Enabled
		}
		if override.UpdateCheck.Constraint != nil {
			tc.UpdateCheck.Constraint = override.UpdateCheck.Constraint
		}
	}
	if hasKey(rawOverride, "installationMethod") {
		tc.InstallationMethod = override.InstallationMethod
	}
	if len(override.InstallParams) > 0 {
		if tc.InstallParams == nil {
			tc.InstallParams = make(map[string]interface{})
		}
		for k, v := range override.InstallParams {
			tc.InstallParams[k] = v
		}
	}
}
