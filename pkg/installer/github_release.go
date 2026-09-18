package installer

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

const (
	githubAPIBaseURL = "https://api.github.com"
	githubUserAgent  = "dotfiles-installer/1.0"
)

// githubReleaseClient resolves releases through the GitHub REST API and falls
// back to the gh CLI when the caller asks for it or when the API answers 403,
// which is how an unauthenticated client hits the rate limit. Every installer
// that consumes GitHub releases shares this one implementation so that ghCli,
// prerelease and token handling behave identically across methods.
type githubReleaseClient struct {
	httpClient *http.Client
	runner     exec.CommandRunner
	// baseURL is the API root; empty selects api.github.com. A GitHub Enterprise
	// host is passed to the gh CLI through --hostname.
	baseURL string
	// userAgent identifies the client to the API; empty selects githubUserAgent.
	// It is the project configuration's github.userAgent.
	userAgent string
}

// githubReleaseRequest identifies the release to resolve and how to reach it.
type githubReleaseRequest struct {
	repo string
	// version is a tag name; empty or "latest" resolves the newest release.
	version string
	// prerelease lets the newest release be a prerelease.
	prerelease bool
	// ghCli resolves through the gh CLI from the start instead of the REST API.
	ghCli bool
	// token authenticates the REST API request when non-empty.
	token string
}

func (c githubReleaseClient) apiBaseURL() string {
	if c.baseURL == "" {
		return githubAPIBaseURL
	}
	return strings.TrimSuffix(c.baseURL, "/")
}

// agent returns the User-Agent to present to the API.
func (c githubReleaseClient) agent() string {
	if c.userAgent == "" {
		return githubUserAgent
	}
	return c.userAgent
}

// fetch resolves the requested release and reports whether the gh CLI produced
// it, so the caller downloads assets through the same channel that could see
// the release.
func (c githubReleaseClient) fetch(ctx context.Context, req githubReleaseRequest) (*githubRelease, bool, error) {
	if req.version == "" {
		req.version = "latest"
	}

	if !req.ghCli {
		release, status, err := c.fetchViaAPI(ctx, req)
		if err != nil {
			return nil, false, err
		}
		switch status {
		case http.StatusOK:
			return release, false, nil
		case http.StatusForbidden:
			// Fall through to the gh CLI, which carries its own credentials.
		default:
			return nil, false, fmt.Errorf("GitHub API returned status %d", status)
		}
	}

	release, err := c.fetchViaGhCli(ctx, req.repo, req.version, req.prerelease)
	if err != nil {
		return nil, true, fmt.Errorf("fetching release via gh CLI: %w", err)
	}
	return release, true, nil
}

// fetchViaAPI performs the REST request. A non-200 status is returned to the
// caller rather than turned into an error, because 403 selects the gh fallback.
func (c githubReleaseClient) fetchViaAPI(ctx context.Context, req githubReleaseRequest) (*githubRelease, int, error) {
	endpoint, isListing := releaseEndpoint(req.repo, req.version, req.prerelease)
	apiURL := fmt.Sprintf("%s/%s", c.apiBaseURL(), endpoint)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("creating GitHub API request: %w", err)
	}
	httpReq.Header.Set("User-Agent", c.agent())
	if req.token != "" {
		httpReq.Header.Set("Authorization", "token "+req.token)
	}

	client := c.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("executing GitHub API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, nil
	}
	release, err := decodeRelease(resp.Body, isListing)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return release, resp.StatusCode, nil
}

// fetchViaGhCli resolves the release with `gh api`, which authenticates with the
// user's gh login and therefore also works for private repositories and
// rate-limited hosts.
func (c githubReleaseClient) fetchViaGhCli(ctx context.Context, repo, version string, prerelease bool) (*githubRelease, error) {
	endpoint, isListing := releaseEndpoint(repo, version, prerelease)

	args := []string{"api"}
	if c.baseURL != "" && c.baseURL != githubAPIBaseURL {
		if u, err := url.Parse(c.baseURL); err == nil && u.Host != "" {
			args = append(args, "--hostname", u.Host)
		}
	}
	args = append(args, endpoint)

	cmd := c.runner.CommandContext(ctx, "gh", args...)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("executing gh api %s: %w", endpoint, err)
	}

	release, err := decodeRelease(bytes.NewReader(out), isListing)
	if err != nil {
		return nil, fmt.Errorf("parsing gh api response: %w", err)
	}
	return release, nil
}

// downloadAssetViaGhCli fetches one release asset into destDir with
// `gh release download`, keeping the download on the same authenticated
// channel that resolved the release.
func (c githubReleaseClient) downloadAssetViaGhCli(ctx context.Context, repo, tag, pattern, destDir string) error {
	args := []string{
		"release", "download", tag,
		"--repo", repo,
		"--dir", destDir,
		"--pattern", pattern,
		"--clobber",
	}
	cmd := c.runner.CommandContext(ctx, "gh", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("executing gh release download: %w (output: %s)", err, string(out))
	}
	return nil
}

// githubToken returns the token to authenticate GitHub API requests and asset
// downloads with, most specific source first: the tool's `token` parameter, then
// projectToken (the project configuration's github.token, which applies to every
// tool), then GITHUB_TOKEN, then GH_TOKEN (the variable the gh CLI itself reads).
// Configuration beats the environment because it is the deliberate choice of the
// repository being installed, while the variables are whatever the shell happened
// to carry.
func githubToken(params map[string]interface{}, projectToken string) string {
	if token := getStringParam(params, "token", ""); token != "" {
		return token
	}
	if projectToken != "" {
		return projectToken
	}
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		return token
	}
	return os.Getenv("GH_TOKEN")
}
