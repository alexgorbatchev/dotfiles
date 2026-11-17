package catalog

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type ClientOptions struct {
	Origin     string
	FS         fs.FS
	CacheDir   string
	HTTPClient *http.Client
	Logger     *logger.Logger
	Now        func() time.Time
	// AllowLoopbackHTTP enables only numeric loopback HTTP fixture origins.
	AllowLoopbackHTTP bool
}

type RequestOptions struct {
	Offline      bool
	Refresh      bool
	DryRun       bool
	RequireFresh bool
}

type Client struct {
	origin     *url.URL
	fsys       fs.FS
	cacheDir   string
	httpClient *http.Client
	log        *logger.Logger
	now        func() time.Time
	slots      chan struct{}
}

type ResultContext struct {
	SchemaVersion int    `json:"schemaVersion"`
	Origin        string `json:"origin"`
	Snapshot      string `json:"snapshot"`
	GeneratedAt   string `json:"generatedAt"`
	IsOffline     bool   `json:"isOffline"`
	IsStale       bool   `json:"isStale"`
}

type DiscoverySnapshot struct {
	ResultContext
	Payload    SnapshotPayload
	Index      Index
	Categories CategoryRegistry
	Tombstones TombstoneRegistry
}

type Error struct {
	SchemaVersion int     `json:"schemaVersion"`
	Code          string  `json:"code"`
	Message       string  `json:"message"`
	ID            *string `json:"id"`
	Retryable     bool    `json:"retryable"`
	cause         error
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }
func (e *Error) Unwrap() error { return e.cause }

func failure(code, id string, err error) *Error {
	var toolID *string
	if id != "" {
		toolID = &id
	}
	return &Error{SchemaVersion: schemaVersion, Code: code, Message: err.Error(), ID: toolID, Retryable: code == "network-failed", cause: err}
}

func NewClient(options ClientOptions) (*Client, error) {
	origin, err := catalogOrigin(options.Origin, options.AllowLoopbackHTTP)
	if err != nil {
		return nil, failure("invalid-input", "", err)
	}
	base := options.CacheDir
	if base == "" {
		dir, err := os.UserCacheDir()
		if err != nil {
			return nil, fmt.Errorf("locate user catalog cache: %w", err)
		}
		base = filepath.Join(dir, "dotfiles", "catalog")
	}
	filesystem := options.FS
	if filesystem == nil {
		filesystem = fs.NewOSFS()
	}
	clock := options.Now
	if clock == nil {
		clock = time.Now
	}
	client := options.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	return &Client{origin: origin, fsys: filesystem, cacheDir: filepath.Join(base, Blob([]byte(origin.String())).SHA256), httpClient: client, log: options.Logger, now: clock, slots: make(chan struct{}, 4)}, nil
}

func catalogOrigin(raw string, allowLoopback bool) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	loopback := allowLoopback && (u.Hostname() == "127.0.0.1" || u.Hostname() == "::1") && u.Scheme == "http"
	if (u.Scheme != "https" && !loopback) || u.Hostname() == "" || u.User != nil || u.Opaque != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || !strings.HasSuffix(u.Path, "/") {
		return nil, fmt.Errorf("catalog origin must be an absolute HTTPS directory URL without credentials, query or fragment")
	}
	if path.Clean(u.Path)+"/" != u.Path && u.Path != "/" {
		return nil, fmt.Errorf("catalog origin path must be canonical")
	}
	if apiURL(u) || strings.ContainsAny(u.Path, "\\\x00") {
		return nil, fmt.Errorf("catalog origin must be a non-API static asset path")
	}
	return u, nil
}

func apiURL(u *url.URL) bool {
	host := strings.ToLower(u.Hostname())
	p := strings.ToLower(u.Path)
	return host == "api.github.com" || strings.HasSuffix(host, ".api.github.com") || strings.Contains(p, "/api/") || strings.HasSuffix(p, "/graphql")
}

func (c *Client) checkURL(u *url.URL) error {
	if u.Scheme != c.origin.Scheme || !strings.EqualFold(u.Host, c.origin.Host) || u.User != nil || u.RawQuery != "" || u.Fragment != "" || apiURL(u) || path.Clean(u.Path) != u.Path || !strings.HasPrefix(u.Path, c.origin.Path) {
		return failure("invalid-input", "", fmt.Errorf("catalog request leaves its configured static origin"))
	}
	relative := strings.TrimPrefix(u.Path, c.origin.Path)
	if relative != "v1/latest.json" && !(strings.HasPrefix(relative, "v1/objects/") && hashPattern.MatchString(strings.TrimPrefix(relative, "v1/objects/"))) {
		return failure("invalid-input", "", fmt.Errorf("catalog request is outside the static v1 protocol"))
	}
	return nil
}

func (c *Client) Discover(ctx context.Context, options RequestOptions) (DiscoverySnapshot, error) {
	if err := ctx.Err(); err != nil {
		return DiscoverySnapshot{}, err
	}
	if options.Offline && options.Refresh {
		return DiscoverySnapshot{}, failure("invalid-input", "", fmt.Errorf("offline and refresh cannot be combined"))
	}
	state, stateErr := c.readState()
	var cached DiscoverySnapshot
	cacheErr := stateErr
	if stateErr == nil {
		cached, cacheErr = c.readSnapshot(ctx, state.Pointer, RequestOptions{Offline: true, DryRun: true})
		cached.IsOffline = options.Offline
	}
	if options.Offline {
		if cacheErr != nil {
			return DiscoverySnapshot{}, failure("cache-missing", "", cacheErr)
		}
		return cached, nil
	}
	if cacheErr == nil && !options.Refresh && !options.RequireFresh && c.now().Sub(state.RetrievedAt) < time.Hour {
		return cached, nil
	}
	pointer, response, err := c.refreshPointer(ctx, state, stateErr == nil)
	if err != nil {
		var catalogErr *Error
		if cacheErr == nil && !options.RequireFresh && errors.As(err, &catalogErr) && catalogErr.Code == "network-failed" {
			cached.IsStale = true
			if c.log != nil {
				c.log.Warn(logger.Message(fmt.Sprintf("Catalog network request failed; using validated snapshot retrieved at %s: %v", state.RetrievedAt.UTC().Format(time.RFC3339), err)))
			}
			return cached, nil
		}
		return DiscoverySnapshot{}, err
	}
	fresh, err := c.readSnapshot(ctx, pointer, options)
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	if !options.DryRun {
		state = cacheState{Origin: c.origin.String(), Pointer: pointer, ETag: response.ETag, LastModified: response.LastModified, RetrievedAt: c.now().UTC()}
		if err := c.writeState(state); err != nil {
			return DiscoverySnapshot{}, err
		}
	}
	return fresh, nil
}

func (c *Client) refreshPointer(ctx context.Context, state cacheState, hasState bool) (Pointer, fetchResponse, error) {
	headers := make(map[string]string)
	if hasState {
		if state.ETag != "" {
			headers["If-None-Match"] = state.ETag
		}
		if state.LastModified != "" {
			headers["If-Modified-Since"] = state.LastModified
		}
	}
	response, err := c.fetch(ctx, "v1/latest.json", maxPointerBytes, headers)
	if err != nil {
		return Pointer{}, response, err
	}
	if response.Status == http.StatusNotModified {
		if hasState && state.Pointer.Validate() == nil {
			return state.Pointer, response, nil
		}
		response, err = c.fetch(ctx, "v1/latest.json", maxPointerBytes, nil)
		if err != nil {
			return Pointer{}, response, err
		}
		if response.Status == http.StatusNotModified {
			return Pointer{}, response, failure("integrity-failed", "", fmt.Errorf("unconditional pointer request returned 304 without usable cache"))
		}
	}
	pointer, err := Decode[Pointer](response.Data)
	if err != nil {
		return Pointer{}, response, failure("integrity-failed", "", err)
	}
	if err := pointer.Validate(); err != nil {
		return Pointer{}, response, failure("unsupported-schema", "", err)
	}
	return pointer, response, nil
}

func (c *Client) readSnapshot(ctx context.Context, pointer Pointer, options RequestOptions) (DiscoverySnapshot, error) {
	result := DiscoverySnapshot{ResultContext: ResultContext{SchemaVersion: schemaVersion, Origin: c.origin.String(), Snapshot: pointer.Snapshot.SHA256, IsOffline: options.Offline}}
	payload, err := readCatalogJSON[SnapshotPayload](ctx, c, pointer.Snapshot, "snapshot", maxSnapshotBytes, options)
	if err != nil {
		return result, err
	}
	if err := payload.Validate(); err != nil {
		return result, failure("unsupported-schema", "", err)
	}
	result.Payload = payload
	result.GeneratedAt = payload.GeneratedAt
	result.Categories, err = readCatalogJSON[CategoryRegistry](ctx, c, payload.Categories, "categories", maxIndexBytes, options)
	if err != nil {
		return result, err
	}
	result.Tombstones, err = readCatalogJSON[TombstoneRegistry](ctx, c, payload.Tombstones, "tombstones", maxIndexBytes, options)
	if err != nil {
		return result, err
	}
	result.Index, err = readCatalogJSON[Index](ctx, c, payload.Index, "index", maxIndexBytes, options)
	if err != nil {
		return result, err
	}
	if err := result.Index.Validate(result.Categories, result.Tombstones); err != nil {
		return result, failure("integrity-failed", "", err)
	}
	for i := range result.Index.Entries {
		entry := &result.Index.Entries[i]
		entry.VerificationStatus = VerificationStatus(entry.Definitions, c.now())
	}
	return result, nil
}

func readCatalogJSON[T any](ctx context.Context, c *Client, ref BlobRef, label string, limit int64, options RequestOptions) (T, error) {
	var zero T
	data, err := c.object(ctx, ref, label, limit, options)
	if err != nil {
		return zero, err
	}
	value, err := Decode[T](data)
	if err != nil {
		return zero, failure("integrity-failed", "", fmt.Errorf("%s: %w", label, err))
	}
	return value, nil
}
