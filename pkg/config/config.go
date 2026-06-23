package config

// CacheConfig defines the cache settings.
type CacheConfig struct {
	Enabled bool  `json:"enabled"`
	TTL     int64 `json:"ttl"`
}

// HostConfig defines host-specific API and auth settings.
type HostConfig struct {
	Host      string      `json:"host"`
	Cache     CacheConfig `json:"cache"`
	Token     string      `json:"token"`
	UserAgent string      `json:"userAgent"`
}

// PathsConfig defines directory paths for the orchestrator.
type PathsConfig struct {
	HomeDir         string `json:"homeDir"`
	DotfilesDir     string `json:"dotfilesDir"`
	TargetDir       string `json:"targetDir"`
	GeneratedDir    string `json:"generatedDir"`
	ToolConfigsDir  string `json:"toolConfigsDir"`
	ShellScriptsDir string `json:"shellScriptsDir"`
	BinariesDir     string `json:"binariesDir"`
}

// SystemConfig defines system elevation settings.
type SystemConfig struct {
	SudoPrompt string `json:"sudoPrompt"`
}

// LoggingConfig defines logging and trace settings.
type LoggingConfig struct {
	Debug string `json:"debug"`
}

// UpdatesConfig defines orchestration update check parameters.
type UpdatesConfig struct {
	CheckOnRun    bool  `json:"checkOnRun"`
	CheckInterval int64 `json:"checkInterval"`
}

// CargoConfig defines Cargo registry and repository hosts.
type CargoConfig struct {
	CratesIo      HostConfig `json:"cratesIo"`
	GithubRaw     HostConfig `json:"githubRaw"`
	GithubRelease HostConfig `json:"githubRelease"`
	UserAgent     string     `json:"userAgent"`
}

// DownloaderConfig defines general downloader configurations.
type DownloaderConfig struct {
	Timeout    int64       `json:"timeout"`
	RetryCount int64       `json:"retryCount"`
	RetryDelay int64       `json:"retryDelay"`
	Cache      CacheConfig `json:"cache"`
}

// CatalogConfig defines CATALOG.md generation configuration.
type CatalogConfig struct {
	Generate bool   `json:"generate"`
	FilePath string `json:"filePath"`
}

// ShellInstallConfig defines target shells configurations.
type ShellInstallConfig struct {
	Zsh        string `json:"zsh,omitempty"`
	Bash       string `json:"bash,omitempty"`
	Powershell string `json:"powershell,omitempty"`
}

// FeaturesConfig defines core features configurations.
type FeaturesConfig struct {
	Catalog      CatalogConfig       `json:"catalog"`
	ShellInstall *ShellInstallConfig `json:"shellInstall,omitempty"`
}

// ProjectConfig is the root configuration structure matching packages/core/src/config/projectConfigSchema.ts.
type ProjectConfig struct {
	Paths      PathsConfig      `json:"paths"`
	System     SystemConfig     `json:"system"`
	Logging    LoggingConfig    `json:"logging"`
	Updates    UpdatesConfig    `json:"updates"`
	Github     HostConfig       `json:"github"`
	Cargo      CargoConfig      `json:"cargo"`
	Downloader DownloaderConfig `json:"downloader"`
	Features   FeaturesConfig   `json:"features"`
}
