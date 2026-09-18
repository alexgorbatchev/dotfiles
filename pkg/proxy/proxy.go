// Package proxy is the development HTTP caching proxy behind DEV_PROXY.
//
// The server caches every 2xx/3xx upstream response on disk regardless of the
// origin's cache headers, so repeated development runs against GitHub and other
// rate-limited APIs are served locally. Client returns an *http.Client that
// routes ordinary requests through the server using the wire format v1's
// proxyFetch established: the target URL is carried in the request path, as in
// http://127.0.0.1:<port>/https://api.github.com/repos/owner/repo.
package proxy

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

const (
	defaultTTL = 24 * time.Hour
	// upstreamResponseHeaderTimeout matches the downloader the proxy fronts. There
	// is deliberately no overall client timeout: the proxy relays whole release
	// archives and the downloader behind it has none either.
	upstreamResponseHeaderTimeout = 30 * time.Second
	shutdownTimeout               = 5 * time.Second
	loopbackHost                  = "127.0.0.1"
	cacheStatusHeader             = "X-Dotfiles-Cache"
)

// CacheEntry represents the cache metadata.
type CacheEntry struct {
	URL      string            `json:"url"`
	Method   string            `json:"method"`
	Status   int               `json:"status"`
	Headers  map[string]string `json:"headers"`
	CachedAt int64             `json:"cachedAt"` // Unix millisecond timestamp
	TTL      int64             `json:"ttl"`      // Time-to-live in milliseconds
}

// CacheStore handles file-based cache persistence.
type CacheStore struct {
	cacheDir   string
	defaultTTL int64
	mu         sync.RWMutex
}

// NewCacheStore constructs a new CacheStore.
func NewCacheStore(cacheDir string, defaultTTLMillis int64) *CacheStore {
	if defaultTTLMillis <= 0 {
		defaultTTLMillis = defaultTTL.Milliseconds()
	}
	return &CacheStore{
		cacheDir:   cacheDir,
		defaultTTL: defaultTTLMillis,
	}
}

// GenerateKey produces a SHA-256 hex signature key.
func (s *CacheStore) GenerateKey(method, targetURL string) string {
	sig := fmt.Sprintf("%s:%s", strings.ToUpper(method), targetURL)
	hash := sha256.Sum256([]byte(sig))
	return hex.EncodeToString(hash[:])
}

func (s *CacheStore) getPaths(key string) (string, string) {
	subdir := key[:2]
	dir := filepath.Join(s.cacheDir, subdir)
	return filepath.Join(dir, key+".meta.json"), filepath.Join(dir, key+".body")
}

func (s *CacheStore) getLocked(key string) (*CacheEntry, []byte, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	metaPath, bodyPath := s.getPaths(key)

	metaBytes, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, nil, false, err
	}

	bodyBytes, err := os.ReadFile(bodyPath)
	if err != nil {
		return nil, nil, false, err
	}

	var entry CacheEntry
	if err := json.Unmarshal(metaBytes, &entry); err != nil {
		return nil, nil, false, fmt.Errorf("unmarshal metadata: %w", err)
	}

	expiresAt := entry.CachedAt + entry.TTL
	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	if nowMs > expiresAt {
		return &entry, nil, true, nil
	}

	return &entry, bodyBytes, false, nil
}

// Get retrieves a cache entry.
func (s *CacheStore) Get(method, targetURL string) (*CacheEntry, []byte, error) {
	key := s.GenerateKey(method, targetURL)
	entry, bodyBytes, isExpired, err := s.getLocked(key)
	if err != nil {
		return nil, nil, err
	}

	if isExpired {
		s.mu.Lock()
		defer s.mu.Unlock()

		metaPath, _ := s.getPaths(key)
		if metaBytes, err2 := os.ReadFile(metaPath); err2 == nil {
			var entry2 CacheEntry
			if err3 := json.Unmarshal(metaBytes, &entry2); err3 == nil {
				expiresAt := entry2.CachedAt + entry2.TTL
				nowMs := time.Now().UnixNano() / int64(time.Millisecond)
				if nowMs > expiresAt {
					s.deleteByKey(key)
				}
			}
		}
		return nil, nil, fmt.Errorf("cache entry expired")
	}

	return entry, bodyBytes, nil
}

// Set stores an item in the cache store.
func (s *CacheStore) Set(method, targetURL string, status int, headers map[string]string, body []byte, ttl int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := s.GenerateKey(method, targetURL)
	metaPath, bodyPath := s.getPaths(key)

	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		return fmt.Errorf("create cache subdirs: %w", err)
	}

	if ttl <= 0 {
		ttl = s.defaultTTL
	}

	entry := CacheEntry{
		URL:      targetURL,
		Method:   strings.ToUpper(method),
		Status:   status,
		Headers:  headers,
		CachedAt: time.Now().UnixNano() / int64(time.Millisecond),
		TTL:      ttl,
	}

	metaBytes, err := json.MarshalIndent(entry, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal metadata: %w", err)
	}

	if err := os.WriteFile(metaPath, metaBytes, 0o644); err != nil {
		return fmt.Errorf("write metadata file: %w", err)
	}

	if err := os.WriteFile(bodyPath, body, 0o644); err != nil {
		return fmt.Errorf("write body file: %w", err)
	}

	return nil
}

func (s *CacheStore) deleteByKey(key string) {
	metaPath, bodyPath := s.getPaths(key)
	_ = os.Remove(metaPath)
	_ = os.Remove(bodyPath)
}

// Server is the local HTTP caching proxy.
type Server struct {
	logger *logger.Logger
	port   int
	store  *CacheStore
	server *http.Server
	ln     net.Listener
	wg     sync.WaitGroup
	client *http.Client
}

// NewServer creates a caching proxy that binds 127.0.0.1:port on Start (port 0
// picks a free one) and keeps responses under cacheDir for ttlMillis.
func NewServer(log *logger.Logger, port int, cacheDir string, ttlMillis int64) *Server {
	upstream := http.DefaultTransport.(*http.Transport).Clone()
	upstream.ResponseHeaderTimeout = upstreamResponseHeaderTimeout
	return &Server{
		logger: log.GetSubLogger("ProxyServer"),
		port:   port,
		store:  NewCacheStore(cacheDir, ttlMillis),
		client: &http.Client{Transport: upstream},
	}
}

// Port returns the actual port the server is listening on.
func (s *Server) Port() int {
	return s.port
}

// Start binds the listener synchronously and serves in a goroutine that Stop joins.
func (s *Server) Start() error {
	s.server = &http.Server{Handler: http.HandlerFunc(s.handleProxy)}
	s.server.SetKeepAlivesEnabled(false)

	ln, err := net.Listen("tcp", net.JoinHostPort(loopbackHost, strconv.Itoa(s.port)))
	if err != nil {
		return fmt.Errorf("failed to bind proxy listener on port %d: %w", s.port, err)
	}
	s.ln = ln
	s.port = ln.Addr().(*net.TCPAddr).Port

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.logger.Info(logger.Message(fmt.Sprintf("Starting local HTTP cache proxy on http://%s", s.addr())))
		if err := s.server.Serve(s.ln); err != nil && err != http.ErrServerClosed {
			s.logger.Error(logger.Message(fmt.Sprintf("Proxy server failed: %v", err)))
		}
	}()

	return nil
}

// Stop shuts down the server and waits for the serving goroutine to exit.
func (s *Server) Stop() error {
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := s.server.Shutdown(ctx); err != nil {
			return fmt.Errorf("proxy server shutdown failed: %w", err)
		}
	}
	if s.ln != nil {
		_ = s.ln.Close()
	}
	s.wg.Wait()
	return nil
}

// Client returns an HTTP client that sends every request through this proxy.
// Call it after Start, which is what binds the port.
func (s *Server) Client() *http.Client {
	return &http.Client{Transport: &transport{proxyHost: s.addr(), base: http.DefaultTransport}}
}

func (s *Server) addr() string {
	return net.JoinHostPort(loopbackHost, strconv.Itoa(s.port))
}

// transport is the client side of the proxy's wire format: it rewrites each
// request to the proxy with the original absolute URL in the request path.
type transport struct {
	proxyHost string
	base      http.RoundTripper
}

// RoundTrip clones the request, as the RoundTripper contract requires, and
// carries the target URL in Opaque so its escaped path and query bytes reach the
// proxy exactly as the caller encoded them.
func (t *transport) RoundTrip(req *http.Request) (*http.Response, error) {
	out := req.Clone(req.Context())
	out.URL = &url.URL{Scheme: "http", Host: t.proxyHost, Opaque: "/" + req.URL.String()}
	out.Host = ""
	return t.base.RoundTrip(out)
}

// targetFromRequestURI recovers the absolute target URL from a proxied request
// path. Only the leading-slash form is accepted; anything else is not a request
// this proxy knows how to forward.
func targetFromRequestURI(requestURI string) (string, bool) {
	target := strings.TrimPrefix(requestURI, "/")
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return target, true
	}
	return "", false
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	targetURLStr, ok := targetFromRequestURI(r.RequestURI)
	if !ok {
		http.Error(w, "Bad Request: expected the target URL in the path, as in /https://example.com/path", http.StatusBadRequest)
		return
	}

	method := r.Method

	if entry, body, err := s.store.Get(method, targetURLStr); err == nil {
		s.logger.Info(logger.Message(fmt.Sprintf("[HIT] [%s] %s", method, targetURLStr)))
		for k, v := range entry.Headers {
			if !isSkippedHeader(k) {
				w.Header().Set(k, v)
			}
		}
		w.Header().Set(cacheStatusHeader, "HIT")
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		w.WriteHeader(entry.Status)
		_, _ = w.Write(body)
		return
	}

	s.logger.Info(logger.Message(fmt.Sprintf("[MISS] [%s] %s", method, targetURLStr)))

	targetURL, err := url.Parse(targetURLStr)
	if err != nil {
		http.Error(w, "Invalid target URL: "+err.Error(), http.StatusBadRequest)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), method, targetURL.String(), bytes.NewReader(bodyBytes))
	if err != nil {
		http.Error(w, "Failed to create proxy request: "+err.Error(), http.StatusInternalServerError)
		return
	}

	for k, vv := range r.Header {
		if isHopHeader(k) {
			continue
		}
		for _, v := range vv {
			req.Header.Add(k, v)
		}
	}

	resp, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "Proxy error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to read proxy response: "+err.Error(), http.StatusBadGateway)
		return
	}

	// Cache 2xx and 3xx responses regardless of the origin's cache headers; that
	// is the whole point of a development cache in front of rate-limited APIs.
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		headers := make(map[string]string)
		for k, vv := range resp.Header {
			headers[k] = strings.Join(vv, ", ")
		}
		_ = s.store.Set(method, targetURLStr, resp.StatusCode, headers, respBodyBytes, 0)
	}

	for k, vv := range resp.Header {
		if !isSkippedHeader(k) {
			for _, v := range vv {
				w.Header().Add(k, v)
			}
		}
	}
	w.Header().Set(cacheStatusHeader, "MISS")
	w.Header().Set("Content-Length", strconv.Itoa(len(respBodyBytes)))
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBodyBytes)
}

// isHopHeader names the request headers that belong to the connection between
// the client and the proxy, not to the origin. Accept-Encoding is among them:
// the proxy's own transport negotiates compression and transparently decodes
// the answer, so the buffered body it caches and relays is the decoded payload.
// Forwarding the client's offer would make Go leave the body compressed while
// isSkippedHeader drops the Content-Encoding that described it.
func isHopHeader(key string) bool {
	switch strings.ToLower(key) {
	case "host", "connection", "accept-encoding":
		return true
	}
	return false
}

// isSkippedHeader drops the framing headers that describe the origin's wire
// encoding; the proxy re-frames the buffered body itself.
func isSkippedHeader(key string) bool {
	lk := strings.ToLower(key)
	return lk == "transfer-encoding" || lk == "content-encoding" || lk == "content-length"
}
