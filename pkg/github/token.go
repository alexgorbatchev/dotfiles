// Package github holds what every component that talks to the GitHub API shares,
// so that the installers, the dashboard and the self-updater cannot disagree about
// it.
package github

import (
	"net/url"
	"os"
	"strings"
)

// Token returns the token to authenticate GitHub API requests and asset downloads
// with, most specific source first: the first non-empty value in configured, then
// environment variables scoped by the target host following the gh CLI convention:
//
//   - For github.com (including api.github.com), *.ghe.com, or empty host (default):
//     GH_TOKEN, then GITHUB_TOKEN.
//   - For any other host (such as GitHub Enterprise Server):
//     GH_ENTERPRISE_TOKEN, then GITHUB_ENTERPRISE_TOKEN.
//
// Configuration beats the environment because it is the deliberate choice of the
// repository being installed, while the variables are whatever the shell happened
// to carry. Each caller passes only the configuration it owns: an installer passes
// the tool's own `token` parameter and then the project's github.token, while the
// self-updater passes none, because github.token belongs to the project's
// github.host and the self-update addresses the public API instead.
func Token(host string, configured ...string) string {
	for _, token := range configured {
		if token != "" {
			return token
		}
	}
	if isDotComOrGhe(host) {
		if token := os.Getenv("GH_TOKEN"); token != "" {
			return token
		}
		return os.Getenv("GITHUB_TOKEN")
	}
	if token := os.Getenv("GH_ENTERPRISE_TOKEN"); token != "" {
		return token
	}
	return os.Getenv("GITHUB_ENTERPRISE_TOKEN")
}

// normalizeHost extracts the hostname from a URL or bare hostname string,
// returning lowercase host without port.
func normalizeHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	target := raw
	if !strings.Contains(target, "://") {
		target = "https://" + target
	}
	if u, err := url.Parse(target); err == nil && u.Hostname() != "" {
		return strings.ToLower(u.Hostname())
	}
	return strings.ToLower(raw)
}

// isDotComOrGhe reports whether the target host is github.com, api.github.com,
// a subdomain of ghe.com, or empty (which defaults to github.com).
func isDotComOrGhe(host string) bool {
	h := normalizeHost(host)
	return h == "" || h == "github.com" || h == "api.github.com" || h == "ghe.com" || strings.HasSuffix(h, ".ghe.com")
}
