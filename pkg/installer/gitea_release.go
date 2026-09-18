package installer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// giteaUserAgent identifies the installer to Gitea instances; it is the same
// identity every release installer in this package presents.
const giteaUserAgent = githubUserAgent

// giteaReleaseClient resolves releases through the REST API of one Gitea or
// Forgejo instance. Install and CheckUpdate share it so that version, prerelease
// and token handling cannot drift between the two paths again (issue #32).
type giteaReleaseClient struct {
	httpClient *http.Client
	// instanceURL is the instance root as returned by giteaInstanceURL, with no
	// trailing slash; the API lives under instanceURL/api/v1.
	instanceURL string
}

// giteaReleaseRequest identifies the release to resolve.
type giteaReleaseRequest struct {
	repo string
	// version is a tag name; empty or "latest" resolves the newest release.
	version string
	// prerelease lets the newest release be a prerelease.
	prerelease bool
	// token authenticates the request when non-empty.
	token string
}

// giteaInstanceURL reads the tool's instanceUrl parameter. Unlike GitHub there is
// no canonical host to fall back to: every tool names its own instance, and v1
// declared the parameter as a required URL. Defaulting silently sent lookups for
// a self-hosted repository to a public host instead.
func giteaInstanceURL(params map[string]interface{}) (string, error) {
	raw := strings.TrimSpace(getStringParam(params, "instanceUrl", ""))
	if raw == "" {
		return "", errors.New("'instanceUrl' is required in installParams for gitea-release (for example https://codeberg.org)")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("instanceUrl %q must be a valid URL such as https://codeberg.org", raw)
	}
	return strings.TrimRight(raw, "/"), nil
}

// giteaReleaseEndpoint returns the API path under /api/v1 that resolves a tool's
// release, and whether that path responds with a listing rather than a single
// release.
//
// Gitea's releases/latest endpoint excludes prereleases, so opting into them has
// to consult the releases listing, which is ordered newest first, rather than
// filter what releases/latest returns.
func giteaReleaseEndpoint(repo, version string, prerelease bool) (string, bool) {
	if version != "" && version != "latest" {
		return fmt.Sprintf("repos/%s/releases/tags/%s", repo, version), false
	}
	if prerelease {
		return fmt.Sprintf("repos/%s/releases?limit=%d", repo, releaseListPageSize), true
	}
	return fmt.Sprintf("repos/%s/releases/latest", repo), false
}

// fetch resolves the requested release.
func (c giteaReleaseClient) fetch(ctx context.Context, req giteaReleaseRequest) (*giteaRelease, error) {
	if req.version == "" {
		req.version = "latest"
	}
	endpoint, isListing := giteaReleaseEndpoint(req.repo, req.version, req.prerelease)
	apiURL := c.instanceURL + "/api/v1/" + endpoint

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating Gitea API request: %w", err)
	}
	httpReq.Header.Set("User-Agent", giteaUserAgent)
	httpReq.Header.Set("Accept", "application/json")
	if req.token != "" {
		httpReq.Header.Set("Authorization", "token "+req.token)
	}

	client := c.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("executing Gitea API request: %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotFound && req.version != "latest":
		return nil, fmt.Errorf("release %q not found for %s on %s", req.version, req.repo, c.instanceURL)
	case resp.StatusCode == http.StatusNotFound:
		return nil, fmt.Errorf("no release found for %s on %s", req.repo, c.instanceURL)
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("Gitea API returned status %d", resp.StatusCode)
	}
	return decodeGiteaRelease(resp.Body, isListing, req.repo)
}

// decodeGiteaRelease reads a release response, which is a listing when the
// prerelease endpoint was used. Drafts are skipped: Gitea returns them to callers
// with write access and they are not published releases.
func decodeGiteaRelease(r io.Reader, isListing bool, repo string) (*giteaRelease, error) {
	if !isListing {
		var rel giteaRelease
		if err := json.NewDecoder(r).Decode(&rel); err != nil {
			return nil, fmt.Errorf("decoding Gitea release response: %w", err)
		}
		return &rel, nil
	}

	var releases []giteaRelease
	if err := json.NewDecoder(r).Decode(&releases); err != nil {
		return nil, fmt.Errorf("decoding Gitea releases response: %w", err)
	}
	for i := range releases {
		if !releases[i].Draft {
			return &releases[i], nil
		}
	}
	return nil, fmt.Errorf("no published release found for %s", repo)
}
