package installer

import (
	"path/filepath"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// GitHubSettings is the credential, identity and cache configuration from the
// project configuration's `github` section, shared by every installation method
// that resolves releases through the GitHub API.
type GitHubSettings struct {
	// Host is the API root every release lookup addresses, which is how a GitHub
	// Enterprise instance is reached. Empty selects api.github.com.
	Host string
	// Token authenticates API requests and asset downloads for every tool that does
	// not name a `token` install parameter of its own.
	Token string
	// UserAgent identifies the client to the API; empty selects the built-in value.
	UserAgent string
	// CacheEnabled reuses previously fetched release descriptions when true.
	CacheEnabled bool
	// CacheDir is the directory where fetched release descriptions are stored on disk.
	CacheDir string
	// CacheTTL is how long a fetched release description is reused.
	CacheTTL time.Duration
}

// GitHubSettingsSetter is implemented by installers that resolve GitHub releases.
type GitHubSettingsSetter interface {
	SetGitHubSettings(GitHubSettings)
}

// SetGitHubSettings dynamically configures GitHub API access on installer plugins
// prior to execution.
func SetGitHubSettings(inst Installer, settings GitHubSettings) {
	if s, ok := inst.(GitHubSettingsSetter); ok {
		s.SetGitHubSettings(settings)
	}
}

// NewGitHubSettings carries the project configuration's `github` section over,
// configuring the release cache directory and TTL based on the project paths.
func NewGitHubSettings(projCfg *config.ProjectConfig) GitHubSettings {
	if projCfg == nil {
		return GitHubSettings{}
	}
	var cacheDir string
	if projCfg.Paths.GeneratedDir != "" {
		cacheDir = filepath.Join(projCfg.Paths.GeneratedDir, "cache", "github-api")
	}
	var cacheTTL time.Duration
	if projCfg.Github.Cache.TTL > 0 {
		cacheTTL = time.Duration(projCfg.Github.Cache.TTL) * time.Millisecond
	}
	return GitHubSettings{
		Host:         projCfg.Github.Host,
		Token:        projCfg.Github.Token,
		UserAgent:    projCfg.Github.UserAgent,
		CacheEnabled: projCfg.Github.Cache.IsEnabled(),
		CacheDir:     cacheDir,
		CacheTTL:     cacheTTL,
	}
}
