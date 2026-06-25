package proxy

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
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
func NewCacheStore(cacheDir string, defaultTTL int64) *CacheStore {
	if defaultTTL <= 0 {
		defaultTTL = 24 * 60 * 60 * 1000 // 24 hours in ms
	}
	return &CacheStore{
		cacheDir:   cacheDir,
		defaultTTL: defaultTTL,
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

// Get retrieves a cache entry.
func (s *CacheStore) Get(method, targetURL string) (*CacheEntry, []byte, error) {
	s.mu.RLock()

	key := s.GenerateKey(method, targetURL)
	metaPath, bodyPath := s.getPaths(key)

	metaBytes, err := os.ReadFile(metaPath)
	if err != nil {
		s.mu.RUnlock()
		return nil, nil, err
	}

	bodyBytes, err := os.ReadFile(bodyPath)
	if err != nil {
		s.mu.RUnlock()
		return nil, nil, err
	}

	var entry CacheEntry
	if err := json.Unmarshal(metaBytes, &entry); err != nil {
		s.mu.RUnlock()
		return nil, nil, fmt.Errorf("unmarshal metadata: %w", err)
	}

	expiresAt := entry.CachedAt + entry.TTL
	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	if nowMs > expiresAt {
		s.mu.RUnlock()

		s.mu.Lock()
		defer s.mu.Unlock()

		// Re-verify expiration
		metaBytes2, err2 := os.ReadFile(metaPath)
		if err2 == nil {
			var entry2 CacheEntry
			if err3 := json.Unmarshal(metaBytes2, &entry2); err3 == nil {
				expiresAt2 := entry2.CachedAt + entry2.TTL
				nowMs2 := time.Now().UnixNano() / int64(time.Millisecond)
				if nowMs2 > expiresAt2 {
					s.deleteByKey(key)
				}
			}
		}
		return nil, nil, fmt.Errorf("cache entry expired")
	}

	s.mu.RUnlock()
	return &entry, bodyBytes, nil
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

func (s *CacheStore) deleteByKey(key string) bool {
	metaPath, bodyPath := s.getPaths(key)
	deleted := false
	if err := os.Remove(metaPath); err == nil {
		deleted = true
	}
	if err := os.Remove(bodyPath); err == nil {
		deleted = true
	}
	return deleted
}

// Delete removes an item from cache.
func (s *CacheStore) Delete(method, targetURL string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := s.GenerateKey(method, targetURL)
	return s.deleteByKey(key)
}

// Clear clears all cache entries.
func (s *CacheStore) Clear() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleared := 0
	_ = filepath.Walk(s.cacheDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.HasSuffix(info.Name(), ".meta.json") {
			key := strings.TrimSuffix(info.Name(), ".meta.json")
			if s.deleteByKey(key) {
				cleared++
			}
		}
		return nil
	})
	return cleared
}

// Stats returns stats on cache.
type Stats struct {
	Entries int   `json:"entries"`
	Size    int64 `json:"size"`
}

// GetStats returns current cache statistics.
func (s *CacheStore) GetStats() Stats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int
	var size int64

	_ = filepath.Walk(s.cacheDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			if strings.HasSuffix(info.Name(), ".meta.json") || strings.HasSuffix(info.Name(), ".body") {
				size += info.Size()
				if strings.HasSuffix(info.Name(), ".meta.json") {
					count++
				}
			}
		}
		return nil
	})

	return Stats{
		Entries: count,
		Size:    size,
	}
}

// CacheClearRequest specifies the request payload to clear cache.
type CacheClearRequest struct {
	Pattern  string   `json:"pattern,omitempty"`
	Patterns []string `json:"patterns,omitempty"`
}

// CacheClearResult represents the response metadata for clearing cache.
type CacheClearResult struct {
	Cleared int    `json:"cleared"`
	Message string `json:"message"`
}

// CachePopulateRequest represents payload for manual populating.
type CachePopulateRequest struct {
	URL          string            `json:"url"`
	Method       string            `json:"method,omitempty"`
	Status       int               `json:"status,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
	Body         string            `json:"body"`
	BodyIsBase64 bool              `json:"bodyIsBase64,omitempty"`
	TTL          int64             `json:"ttl,omitempty"`
}

// CachePopulateResult represents the populate response.
type CachePopulateResult struct {
	Success bool   `json:"success"`
	Key     string `json:"key"`
	URL     string `json:"url"`
	Message string `json:"message"`
}

// Server acts as local HTTP proxy caching server.
type Server struct {
	logger *logger.Logger
	port   int
	store  *CacheStore
	server *http.Server
	ln     net.Listener
	wg     sync.WaitGroup
	client *http.Client
}

// NewServer creates a new caching proxy Server.
func NewServer(log *logger.Logger, port int, cacheDir string, ttl int64) *Server {
	return &Server{
		logger: log.GetSubLogger("ProxyServer"),
		port:   port,
		store:  NewCacheStore(cacheDir, ttl),
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Port returns the actual port the server is listening on.
func (s *Server) Port() int {
	return s.port
}

// Start launches the proxy server.
func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/cache/clear", s.handleClear)
	mux.HandleFunc("/cache/stats", s.handleStats)
	mux.HandleFunc("/cache/populate", s.handlePopulate)
	mux.HandleFunc("/", s.handleProxy)

	s.server = &http.Server{
		Handler: mux,
	}

	// Synchronously bind the listener.
	ln, err := net.Listen("tcp", "127.0.0.1:"+fmt.Sprintf("%d", s.port))
	if err != nil {
		return fmt.Errorf("failed to bind proxy listener on port %d: %w", s.port, err)
	}
	s.ln = ln
	s.port = ln.Addr().(*net.TCPAddr).Port

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.logger.Info(logger.Message(fmt.Sprintf("Starting local HTTP cache proxy on http://127.0.0.1:%d", s.port)))
		if err := s.server.Serve(s.ln); err != nil && err != http.ErrServerClosed {
			s.logger.Error(logger.Message(fmt.Sprintf("Proxy server failed: %v", err)))
		}
	}()

	return nil
}

// Stop shuts down the server.
func (s *Server) Stop() error {
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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

func (s *Server) handleClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CacheClearRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	patterns := []string{}
	if req.Pattern != "" {
		patterns = append(patterns, req.Pattern)
	}
	patterns = append(patterns, req.Patterns...)

	cleared := 0
	if len(patterns) == 0 || (len(patterns) == 1 && patterns[0] == "*") {
		cleared = s.store.Clear()
	} else {
		s.store.mu.Lock()
		defer s.store.mu.Unlock()

		entries := []string{}
		_ = filepath.Walk(s.store.cacheDir, func(path string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() && strings.HasSuffix(info.Name(), ".meta.json") {
				entries = append(entries, path)
			}
			return nil
		})

		for _, metaPath := range entries {
			metaBytes, err := os.ReadFile(metaPath)
			if err != nil {
				continue
			}
			var entry CacheEntry
			if err := json.Unmarshal(metaBytes, &entry); err != nil {
				continue
			}

			matched := false
			for _, pat := range patterns {
				if matchGlob(entry.URL, entry.Method, pat) {
					matched = true
					break
				}
			}

			if matched {
				key := strings.TrimSuffix(filepath.Base(metaPath), ".meta.json")
				if s.store.deleteByKey(key) {
					cleared++
				}
			}
		}
	}

	resp := CacheClearResult{
		Cleared: cleared,
		Message: fmt.Sprintf("Cleared %d cache entries", cleared),
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats := s.store.GetStats()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

func (s *Server) handlePopulate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CachePopulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.URL == "" {
		http.Error(w, "Missing required field: url", http.StatusBadRequest)
		return
	}

	method := req.Method
	if method == "" {
		method = "GET"
	}

	status := req.Status
	if status == 0 {
		status = 200
	}

	headers := req.Headers
	if headers == nil {
		headers = make(map[string]string)
	}

	var bodyBytes []byte
	var err error
	if req.BodyIsBase64 {
		bodyBytes, err = base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			http.Error(w, "Invalid base64 body: "+err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		bodyBytes = []byte(req.Body)
	}

	if err := s.store.Set(method, req.URL, status, headers, bodyBytes, req.TTL); err != nil {
		http.Error(w, "Failed to cache population: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp := CachePopulateResult{
		Success: true,
		Key:     s.store.GenerateKey(method, req.URL),
		URL:     req.URL,
		Message: fmt.Sprintf("Cached %s %s", method, req.URL),
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	targetURLStr := r.RequestURI

	if r.Method == http.MethodConnect {
		http.Error(w, "HTTPS tunneling not supported", http.StatusNotImplemented)
		return
	}

	// Normalize and reconstruct target URL
	if strings.HasPrefix(targetURLStr, "/https://") {
		targetURLStr = targetURLStr[1:]
	} else if strings.HasPrefix(targetURLStr, "/http://") {
		targetURLStr = targetURLStr[1:]
	} else if strings.HasPrefix(targetURLStr, "/http:/") {
		targetURLStr = "http://" + targetURLStr[7:]
	} else if strings.HasPrefix(targetURLStr, "/https:/") {
		targetURLStr = "https://" + targetURLStr[8:]
	} else if strings.HasPrefix(targetURLStr, "/") && !strings.HasPrefix(targetURLStr, "//") {
		// Relative proxying
		host := r.Header.Get("Host")
		if host == "" {
			http.Error(w, "Missing Host header", http.StatusBadRequest)
			return
		}
		proto := "http"
		if r.TLS != nil {
			proto = "https"
		}
		targetURLStr = fmt.Sprintf("%s://%s%s", proto, host, targetURLStr)
	}

	method := r.Method

	// Check Cache Store (only GET/HEAD are typically cacheable)
	if method == http.MethodGet || method == http.MethodHead {
		if entry, body, err := s.store.Get(method, targetURLStr); err == nil {
			s.logger.Info(logger.Message(fmt.Sprintf("🟢 [HIT] [%s] %s", method, targetURLStr)))
			for k, v := range entry.Headers {
				if !isSkippedHeader(k) {
					w.Header().Set(k, v)
				}
			}
			w.Header().Set("X-Dotfiles-Cache", "HIT")
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
			w.WriteHeader(entry.Status)
			_, _ = w.Write(body)
			return
		}
	}

	s.logger.Info(logger.Message(fmt.Sprintf("🔴 [MISS] [%s] %s", method, targetURLStr)))

	// Miss - forward request
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
		if strings.ToLower(k) != "host" && strings.ToLower(k) != "connection" {
			for _, v := range vv {
				req.Header.Add(k, v)
			}
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

	// Cache response if status is 2xx or 3xx
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
	w.Header().Set("X-Dotfiles-Cache", "MISS")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(respBodyBytes)))
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBodyBytes)
}

func isSkippedHeader(key string) bool {
	lk := strings.ToLower(key)
	return lk == "transfer-encoding" || lk == "content-encoding" || lk == "content-length"
}

func matchGlob(urlStr, method, pattern string) bool {
	if pattern == "*" {
		return true
	}
	if strings.Contains(pattern, ":") && !strings.HasPrefix(pattern, "http") {
		parts := strings.SplitN(pattern, ":", 2)
		methodPattern := parts[0]
		urlPattern := parts[1]
		if strings.ToUpper(method) != strings.ToUpper(methodPattern) {
			return false
		}
		pattern = urlPattern
	}
	if pattern == "*" {
		return true
	}

	cleanPat := pattern
	for len(cleanPat) > 0 && (cleanPat[0] == '*' || cleanPat[0] == '/') {
		cleanPat = cleanPat[1:]
	}
	for len(cleanPat) > 0 && (cleanPat[len(cleanPat)-1] == '*' || cleanPat[len(cleanPat)-1] == '/') {
		cleanPat = cleanPat[:len(cleanPat)-1]
	}

	if len(cleanPat) == 0 {
		return true
	}

	escapedPart := regexp.QuoteMeta(cleanPat)
	escapedPart = strings.ReplaceAll(escapedPart, "\\*\\*", ".*")
	escapedPart = strings.ReplaceAll(escapedPart, "\\*", ".*")

	var regPat string
	if strings.Contains(cleanPat, ".") {
		// Compile glob into regex that ensures word boundaries:
		// (^|://|\.|/)[escapedPart]($|\.|/|:||\?)
		regPat = fmt.Sprintf(`(^|://|\.|/)%s($|\.|/|:|\?)`, escapedPart)
	} else {
		regPat = escapedPart
	}

	re, err := regexp.Compile(regPat)
	if err != nil {
		return strings.Contains(urlStr, pattern)
	}
	return re.MatchString(urlStr)
}
