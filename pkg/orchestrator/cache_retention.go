package orchestrator

import (
	"net/url"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

type cacheRetention struct {
	urls     map[string]bool
	releases map[string][]string
}

func installedCacheURLs(project *config.ProjectConfig, tools []*config.ToolConfig, records []*registry.ToolInstallationRecord) cacheRetention {
	r := cacheRetention{urls: make(map[string]bool), releases: make(map[string][]string)}
	installed := make(map[string]*registry.ToolInstallationRecord)
	for _, record := range records {
		installed[record.ToolName] = record
		if record.DownloadURL != nil {
			r.urls[*record.DownloadURL] = true
		}
	}
	for _, tool := range tools {
		record, ok := installed[tool.Name]
		if !ok {
			continue
		}
		version := record.Version
		if record.OriginalTag != nil && *record.OriginalTag != "" {
			version = *record.OriginalTag
		}
		params := tool.InstallParams
		if source, ok := params["source"].(map[string]any); ok {
			params = source
		}
		if u, ok := params["url"].(string); ok {
			r.urls[u] = true
		}
		repo, _ := params["repo"].(string)
		host := project.Github.Host
		switch tool.InstallationMethod {
		case "gitea-release":
			host, _ = params["instanceUrl"].(string)
		case "cargo":
			sources, err := tool.CargoSources()
			if err != nil {
				continue
			} // Invalid configurations cannot establish ownership.
			host = project.Cargo.GithubRelease.Host
			if sources.Binary == config.CargoBinarySourceGitHubReleases {
				repo = sources.GitHubRepo
			} else {
				repo = "cargo-bins/cargo-quickinstall"
				crate, _ := params["crateName"].(string)
				if crate == "" {
					crate = tool.Name
				}
				if version != "latest" {
					version = crate + "-" + version
				}
			}
		}
		if repo != "" {
			r.addRelease(host, repo, version)
		}
	}
	return r
}

func (r cacheRetention) addRelease(host, repo, version string) {
	if host == "" {
		host = "https://github.com"
	}
	if !strings.Contains(host, "://") {
		host = "https://" + host
	}
	u, err := url.Parse(host)
	if err != nil || u.Host == "" {
		return
	}
	if u.Host == "api.github.com" {
		u.Host = "github.com"
	}
	base := strings.TrimSuffix(strings.TrimRight(u.Path, "/"), "/api/v3")
	key := strings.ToLower(u.Host + base + "/" + repo)
	r.releases[key] = append(r.releases[key], version)
}

func (r cacheRetention) keep(rawURL string) bool {
	if r.urls[rawURL] {
		return true
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	repo, asset, ok := strings.Cut(u.EscapedPath(), "/releases/download/")
	if !ok {
		return false
	}
	tag, _, ok := strings.Cut(asset, "/")
	if !ok {
		return false
	}
	tag, err = url.PathUnescape(tag)
	if err != nil {
		return false
	}
	for _, version := range r.releases[strings.ToLower(u.Host+repo)] {
		// Old records sometimes say only "latest". Every asset from that source
		// must stay until a successful install records a concrete version or URL.
		if version == "" || version == "latest" || tag == version || strings.TrimPrefix(tag, "v") == strings.TrimPrefix(version, "v") {
			return true
		}
	}
	return false
}
