package github

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// ErrNotFound indicates that the requested file or repository was not found.
var ErrNotFound = errors.New("file not found")

const (
	// DefaultAPIBaseURL is the base URL for public GitHub API requests.
	DefaultAPIBaseURL = "https://api.github.com"
	// DefaultUserAgent identifies dotfiles to the GitHub API.
	DefaultUserAgent = "dotfiles-installer/1.0"
)

// ContentOptions configures remote file content fetching.
type ContentOptions struct {
	Host       string
	Token      string
	UserAgent  string
	HTTPClient *http.Client
	Runner     exec.CommandRunner
}

type contentAPIResponse struct {
	Type     string `json:"type"`
	Encoding string `json:"encoding"`
	Size     int64  `json:"size"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	Content  string `json:"content"`
}

// FetchContent queries GitHub's contents API for a file in repo (owner/repo) at path.
// It resolves credentials via github.Token, requests the file via REST API,
// decodes base64 content (handling arbitrary newlines), and falls back to gh api on
// 403 or network errors.
func FetchContent(ctx context.Context, repo, path string, opts ContentOptions) ([]byte, error) {
	repo = strings.Trim(repo, "/")
	path = strings.TrimPrefix(path, "/")
	endpoint := fmt.Sprintf("repos/%s/contents/%s", repo, path)

	baseURL := DefaultAPIBaseURL
	if opts.Host != "" {
		norm := normalizeHost(opts.Host)
		if norm == "" || norm == "github.com" || norm == "api.github.com" {
			baseURL = DefaultAPIBaseURL
		} else if strings.HasPrefix(opts.Host, "http://") || strings.HasPrefix(opts.Host, "https://") {
			baseURL = strings.TrimRight(opts.Host, "/")
		} else {
			baseURL = fmt.Sprintf("https://%s/api/v3", opts.Host)
		}
	}

	token := Token(opts.Host, opts.Token)
	ua := opts.UserAgent
	if ua == "" {
		ua = DefaultUserAgent
	}

	apiURL := fmt.Sprintf("%s/%s", baseURL, endpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating GitHub API request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", ua)
	if token != "" {
		req.Header.Set("Authorization", "token "+token)
	}

	client := opts.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Do(req)
	if err != nil {
		// On network error, try gh CLI fallback if runner is available
		if opts.Runner != nil {
			if out, ghErr := fetchViaGhCli(ctx, opts.Runner, opts.Host, endpoint); ghErr == nil {
				return out, nil
			} else if errors.Is(ghErr, ErrNotFound) {
				return nil, fmt.Errorf("%w: %s in %s", ErrNotFound, path, repo)
			}
		}
		return nil, fmt.Errorf("executing GitHub API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("reading response: %w", err)
		}
		return decodeContentJSON(body)
	}

	if resp.StatusCode == http.StatusNotFound {
		// Could be a private repo accessible via gh CLI credentials
		if opts.Runner != nil {
			if out, ghErr := fetchViaGhCli(ctx, opts.Runner, opts.Host, endpoint); ghErr == nil {
				return out, nil
			}
		}
		return nil, fmt.Errorf("%w: %s in %s", ErrNotFound, path, repo)
	}

	if resp.StatusCode == http.StatusForbidden {
		// Rate limited or forbidden; fall back to gh CLI
		if opts.Runner != nil {
			if out, ghErr := fetchViaGhCli(ctx, opts.Runner, opts.Host, endpoint); ghErr == nil {
				return out, nil
			} else if errors.Is(ghErr, ErrNotFound) {
				return nil, fmt.Errorf("%w: %s in %s", ErrNotFound, path, repo)
			} else {
				return nil, fmt.Errorf("GitHub API returned status 403 (gh fallback: %w)", ghErr)
			}
		}
		return nil, fmt.Errorf("GitHub API returned status 403")
	}

	if opts.Runner != nil {
		if out, ghErr := fetchViaGhCli(ctx, opts.Runner, opts.Host, endpoint); ghErr == nil {
			return out, nil
		}
	}
	return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
}

func fetchViaGhCli(ctx context.Context, runner exec.CommandRunner, host, endpoint string) ([]byte, error) {
	if runner == nil {
		return nil, errors.New("no runner available")
	}
	args := []string{"api"}
	norm := normalizeHost(host)
	if norm != "" && norm != "github.com" && norm != "api.github.com" {
		if u, err := url.Parse(host); err == nil && u.Host != "" {
			args = append(args, "--hostname", u.Host)
		} else {
			args = append(args, "--hostname", host)
		}
	}
	args = append(args, endpoint)

	cmd := runner.CommandContext(ctx, "gh", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		outStr := string(out)
		if strings.Contains(outStr, "404") || strings.Contains(outStr, "Not Found") {
			return nil, fmt.Errorf("%w: %s", ErrNotFound, strings.TrimSpace(outStr))
		}
		return nil, fmt.Errorf("executing gh %s: %w", strings.Join(args, " "), err)
	}

	return decodeContentJSON(out)
}

func decodeContentJSON(data []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(data)
	if bytes.HasPrefix(trimmed, []byte("[")) {
		return nil, errors.New("remote path is a directory, not a file")
	}

	var resp contentAPIResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parsing GitHub contents API response: %w", err)
	}

	if resp.Type != "" && resp.Type != "file" {
		return nil, fmt.Errorf("remote path is %s, not a file", resp.Type)
	}

	if resp.Encoding == "" && resp.Content == "" {
		if resp.Size > 0 {
			return nil, fmt.Errorf("file size %d exceeds GitHub contents API limit", resp.Size)
		}
		return []byte{}, nil
	}

	if resp.Encoding != "base64" {
		return nil, fmt.Errorf("unsupported content encoding %q", resp.Encoding)
	}

	clean := strings.ReplaceAll(resp.Content, "\r", "")
	clean = strings.ReplaceAll(clean, "\n", "")
	clean = strings.TrimSpace(clean)

	decoded, err := base64.StdEncoding.DecodeString(clean)
	if err != nil {
		return nil, fmt.Errorf("decoding base64 content: %w", err)
	}

	return decoded, nil
}
