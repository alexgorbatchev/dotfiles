// Package github holds what every component that talks to the GitHub API shares,
// so that the installers, the dashboard and the self-updater cannot disagree about
// it.
package github

import "os"

// Token returns the token to authenticate GitHub API requests and asset downloads
// with, most specific source first: the first non-empty value in configured, then
// the GITHUB_TOKEN environment variable, then GH_TOKEN (the variable the gh CLI
// itself reads).
//
// Configuration beats the environment because it is the deliberate choice of the
// repository being installed, while the variables are whatever the shell happened
// to carry. Each caller passes only the configuration it owns: an installer passes
// the tool's own `token` parameter and then the project's github.token, while the
// self-updater passes none, because github.token belongs to the project's
// github.host and the self-update addresses the public API instead.
func Token(configured ...string) string {
	for _, token := range configured {
		if token != "" {
			return token
		}
	}
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		return token
	}
	return os.Getenv("GH_TOKEN")
}
