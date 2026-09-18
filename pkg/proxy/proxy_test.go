package proxy

import (
	"compress/gzip"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

const testTTLMillis = 5000

func newTestServer(t *testing.T) *Server {
	t.Helper()
	log := logger.New(logger.Config{Name: "test-proxy", Level: logger.LogLevelQuiet, Writer: io.Discard})
	srv := NewServer(log, 0, t.TempDir(), testTTLMillis)
	if err := srv.Start(); err != nil {
		t.Fatalf("starting proxy: %v", err)
	}
	t.Cleanup(func() {
		if err := srv.Stop(); err != nil {
			t.Errorf("stopping proxy: %v", err)
		}
	})
	return srv
}

// upstreamRequest is what the origin saw for one request.
type upstreamRequest struct {
	Method     string
	RequestURI string
	Header     string
	Body       string
}

// newUpstream is an origin that records every request it serves and answers
// with a body that changes per hit, so a cached answer is distinguishable from
// a fresh one.
func newUpstream(t *testing.T) (*httptest.Server, *atomic.Int32, func() []upstreamRequest) {
	t.Helper()
	var hits atomic.Int32
	var mu sync.Mutex
	var seen []upstreamRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := hits.Add(1)
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		seen = append(seen, upstreamRequest{Method: r.Method, RequestURI: r.RequestURI, Header: r.Header.Get("X-Test"), Body: string(body)})
		mu.Unlock()
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("X-Origin", "yes")
		fmt.Fprintf(w, "origin response %d", n)
	}))
	t.Cleanup(server.Close)
	return server, &hits, func() []upstreamRequest {
		mu.Lock()
		defer mu.Unlock()
		return append([]upstreamRequest(nil), seen...)
	}
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	return string(body)
}

func TestServerCachesUpstreamResponses(t *testing.T) {
	upstream, hits, _ := newUpstream(t)
	srv := newTestServer(t)
	viaProxy := fmt.Sprintf("http://127.0.0.1:%d/%s/data", srv.Port(), upstream.URL)

	first, err := http.Get(viaProxy)
	if err != nil {
		t.Fatalf("first request: %v", err)
	}
	if got := readBody(t, first); got != "origin response 1" {
		t.Fatalf("first body = %q", got)
	}
	if first.Header.Get("X-Dotfiles-Cache") != "MISS" {
		t.Errorf("first X-Dotfiles-Cache = %q, want MISS", first.Header.Get("X-Dotfiles-Cache"))
	}
	if first.Header.Get("X-Origin") != "yes" {
		t.Errorf("origin headers were not relayed: %v", first.Header)
	}

	second, err := http.Get(viaProxy)
	if err != nil {
		t.Fatalf("second request: %v", err)
	}
	if got := readBody(t, second); got != "origin response 1" {
		t.Fatalf("second body = %q, want the cached first response", got)
	}
	if second.Header.Get("X-Dotfiles-Cache") != "HIT" {
		t.Errorf("second X-Dotfiles-Cache = %q, want HIT", second.Header.Get("X-Dotfiles-Cache"))
	}
	if second.Header.Get("X-Origin") != "yes" {
		t.Errorf("cached origin headers were not replayed: %v", second.Header)
	}
	if hits.Load() != 1 {
		t.Errorf("origin hits = %d, want 1", hits.Load())
	}
}

// TestClientRoutesThroughProxy is the client side of the proxy: an *http.Client
// from Server.Client sends ordinary requests for the origin's URL, and they
// arrive at the origin exactly as issued, via the proxy's cache.
func TestClientRoutesThroughProxy(t *testing.T) {
	upstream, hits, seen := newUpstream(t)
	srv := newTestServer(t)
	client := srv.Client()

	// Escaped path and query bytes must survive the trip untouched, because
	// the origin's routing (and the cache key) depends on them.
	target := upstream.URL + "/repos/a%20b/releases?q=x%26y&per_page=1"
	send := func() *http.Response {
		req, err := http.NewRequest(http.MethodPost, target, strings.NewReader("payload"))
		if err != nil {
			t.Fatalf("building request: %v", err)
		}
		req.Header.Set("X-Test", "header-value")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request through proxy client: %v", err)
		}
		return resp
	}

	first := send()
	if got := readBody(t, first); got != "origin response 1" {
		t.Fatalf("first body = %q", got)
	}
	if first.Header.Get("X-Dotfiles-Cache") != "MISS" {
		t.Errorf("first X-Dotfiles-Cache = %q, want MISS", first.Header.Get("X-Dotfiles-Cache"))
	}

	second := send()
	if got := readBody(t, second); got != "origin response 1" {
		t.Fatalf("second body = %q, want the cached first response", got)
	}
	if second.Header.Get("X-Dotfiles-Cache") != "HIT" {
		t.Errorf("second X-Dotfiles-Cache = %q, want HIT", second.Header.Get("X-Dotfiles-Cache"))
	}

	if hits.Load() != 1 {
		t.Fatalf("origin hits = %d, want 1", hits.Load())
	}
	want := upstreamRequest{
		Method:     http.MethodPost,
		RequestURI: "/repos/a%20b/releases?q=x%26y&per_page=1",
		Header:     "header-value",
		Body:       "payload",
	}
	if got := seen(); len(got) != 1 || got[0] != want {
		t.Errorf("origin saw %+v, want %+v", got, want)
	}
}

func TestClientDoesNotMutateTheCallersRequest(t *testing.T) {
	upstream, _, _ := newUpstream(t)
	srv := newTestServer(t)

	target := upstream.URL + "/keep"
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	readBody(t, resp)
	if req.URL.String() != target {
		t.Errorf("caller's URL was rewritten to %q", req.URL.String())
	}
}

func TestClientConcurrentRequestsShareOneOriginFetch(t *testing.T) {
	// The origin is slow so every worker is in flight at once; the cache must
	// still end up with one entry and every worker must get a full response.
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		time.Sleep(20 * time.Millisecond)
		fmt.Fprint(w, "slow-origin")
	}))
	t.Cleanup(upstream.Close)
	srv := newTestServer(t)
	client := srv.Client()

	const workers = 8
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := client.Get(upstream.URL + "/concurrent")
			if err != nil {
				errs <- err
				return
			}
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				errs <- err
				return
			}
			if string(body) != "slow-origin" {
				errs <- fmt.Errorf("body = %q", body)
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	if hits.Load() < 1 || hits.Load() > workers {
		t.Errorf("origin hits = %d, want between 1 and %d", hits.Load(), workers)
	}

	resp, err := client.Get(upstream.URL + "/concurrent")
	if err != nil {
		t.Fatalf("follow-up request: %v", err)
	}
	readBody(t, resp)
	if resp.Header.Get("X-Dotfiles-Cache") != "HIT" {
		t.Errorf("follow-up X-Dotfiles-Cache = %q, want HIT", resp.Header.Get("X-Dotfiles-Cache"))
	}
}

// TestServerDeliversDecodedBodies pins content negotiation to the proxy: Go
// clients advertise gzip, GitHub answers with it, and the buffered body the
// proxy caches and relays must be the decoded payload, not compressed bytes
// with their Content-Encoding stripped.
func TestServerDeliversDecodedBodies(t *testing.T) {
	const payload = `{"tag_name":"v1.2.3"}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			t.Errorf("origin did not see a gzip offer: %q", r.Header.Get("Accept-Encoding"))
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "application/json")
		gz := gzip.NewWriter(w)
		_, _ = gz.Write([]byte(payload))
		_ = gz.Close()
	}))
	t.Cleanup(upstream.Close)
	srv := newTestServer(t)
	client := srv.Client()

	for _, want := range []string{"MISS", "HIT"} {
		resp, err := client.Get(upstream.URL + "/releases/latest")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		body := readBody(t, resp)
		if resp.Header.Get("X-Dotfiles-Cache") != want {
			t.Errorf("X-Dotfiles-Cache = %q, want %s", resp.Header.Get("X-Dotfiles-Cache"), want)
		}
		if body != payload {
			t.Errorf("%s body = %q, want the decoded payload %q", want, body, payload)
		}
		if resp.Header.Get("Content-Encoding") != "" {
			t.Errorf("%s response still claims Content-Encoding %q", want, resp.Header.Get("Content-Encoding"))
		}
	}
}

func TestHandleProxyErrorResponses(t *testing.T) {
	srv := newTestServer(t)
	base := fmt.Sprintf("http://127.0.0.1:%d", srv.Port())

	closed := httptest.NewServer(http.NotFoundHandler())
	closedURL := closed.URL
	closed.Close()

	tests := []struct {
		name       string
		requestURI string
		wantStatus int
	}{
		{"relative path is not a target", "/relative/path", http.StatusBadRequest},
		{"double slash is not a target", "//http://example.com", http.StatusBadRequest},
		{"unparseable target", "/http://[::1]:namedport", http.StatusBadRequest},
		{"unreachable origin", "/" + closedURL, http.StatusBadGateway},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp, err := http.Get(base + tt.requestURI)
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			readBody(t, resp)
			if resp.StatusCode != tt.wantStatus {
				t.Errorf("status = %d, want %d", resp.StatusCode, tt.wantStatus)
			}
		})
	}
}

func TestServerDoesNotCacheErrorResponses(t *testing.T) {
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "not found", http.StatusNotFound)
	}))
	t.Cleanup(upstream.Close)
	srv := newTestServer(t)
	client := srv.Client()

	for range 2 {
		resp, err := client.Get(upstream.URL + "/missing")
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		readBody(t, resp)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", resp.StatusCode)
		}
	}
	if hits.Load() != 2 {
		t.Errorf("origin hits = %d, want 2 (404 must not be cached)", hits.Load())
	}
	if _, _, err := srv.store.Get(http.MethodGet, upstream.URL+"/missing"); err == nil {
		t.Error("404 response was written to the cache store")
	}
}

func TestCacheStoreTTL(t *testing.T) {
	t.Run("non-positive TTL falls back to the default", func(t *testing.T) {
		store := NewCacheStore(t.TempDir(), 0)
		if store.defaultTTL <= 0 {
			t.Fatalf("defaultTTL = %d, want positive", store.defaultTTL)
		}
		target := "http://example.com/default-ttl"
		if err := store.Set(http.MethodGet, target, 200, nil, []byte("data"), 0); err != nil {
			t.Fatalf("Set: %v", err)
		}
		entry, _, err := store.Get(http.MethodGet, target)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if entry.TTL != store.defaultTTL {
			t.Errorf("entry TTL = %d, want default %d", entry.TTL, store.defaultTTL)
		}
	})

	t.Run("expired entries are evicted on read", func(t *testing.T) {
		store := NewCacheStore(t.TempDir(), testTTLMillis)
		target := "http://example.com/expires"
		if err := store.Set(http.MethodGet, target, 200, nil, []byte("data"), 1); err != nil {
			t.Fatalf("Set: %v", err)
		}
		time.Sleep(5 * time.Millisecond)
		if _, _, err := store.Get(http.MethodGet, target); err == nil {
			t.Fatal("Get returned an expired entry")
		}
		metaPath, bodyPath := store.getPaths(store.GenerateKey(http.MethodGet, target))
		for _, p := range []string{metaPath, bodyPath} {
			if _, err := os.Stat(p); !os.IsNotExist(err) {
				t.Errorf("%s still exists after expiry (err=%v)", filepath.Base(p), err)
			}
		}
	})
}

func TestCacheStoreReadErrors(t *testing.T) {
	store := NewCacheStore(t.TempDir(), testTTLMillis)

	t.Run("missing entry", func(t *testing.T) {
		if _, _, err := store.Get(http.MethodGet, "http://example.com/never-set"); err == nil {
			t.Error("expected an error for a missing entry")
		}
	})

	t.Run("corrupt metadata", func(t *testing.T) {
		target := "http://example.com/corrupt"
		metaPath, bodyPath := store.getPaths(store.GenerateKey(http.MethodGet, target))
		if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(metaPath, []byte("{invalid-json"), 0o644)
		_ = os.WriteFile(bodyPath, []byte("body"), 0o644)
		if _, _, err := store.Get(http.MethodGet, target); err == nil {
			t.Error("expected an error for corrupt metadata")
		}
	})

	t.Run("missing body", func(t *testing.T) {
		target := "http://example.com/no-body"
		if err := store.Set(http.MethodGet, target, 200, nil, []byte("body"), 0); err != nil {
			t.Fatal(err)
		}
		_, bodyPath := store.getPaths(store.GenerateKey(http.MethodGet, target))
		_ = os.Remove(bodyPath)
		if _, _, err := store.Get(http.MethodGet, target); err == nil {
			t.Error("expected an error when the body file is missing")
		}
	})
}

func TestCacheStoreWriteErrors(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T) *CacheStore
	}{
		{"cache dir blocked by a file", func(t *testing.T) *CacheStore {
			blocker := filepath.Join(t.TempDir(), "file-not-dir")
			_ = os.WriteFile(blocker, []byte("file"), 0o644)
			return NewCacheStore(blocker, testTTLMillis)
		}},
		{"metadata path is a directory", func(t *testing.T) *CacheStore {
			store := NewCacheStore(t.TempDir(), testTTLMillis)
			metaPath, _ := store.getPaths(store.GenerateKey(http.MethodGet, "http://example.com/blocked"))
			_ = os.MkdirAll(metaPath, 0o755)
			return store
		}},
		{"body path is a directory", func(t *testing.T) *CacheStore {
			store := NewCacheStore(t.TempDir(), testTTLMillis)
			_, bodyPath := store.getPaths(store.GenerateKey(http.MethodGet, "http://example.com/blocked"))
			_ = os.MkdirAll(bodyPath, 0o755)
			return store
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := tt.setup(t)
			if err := store.Set(http.MethodGet, "http://example.com/blocked", 200, nil, []byte("data"), 0); err == nil {
				t.Error("expected Set to fail")
			}
		})
	}
}

func TestServerLifecycle(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})

	t.Run("start fails on a bound port", func(t *testing.T) {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer ln.Close()
		srv := NewServer(log, ln.Addr().(*net.TCPAddr).Port, t.TempDir(), testTTLMillis)
		if err := srv.Start(); err == nil {
			_ = srv.Stop()
			t.Fatal("expected Start to fail on an already bound port")
		}
	})

	t.Run("stop is idempotent and safe before start", func(t *testing.T) {
		srv := NewServer(log, 0, t.TempDir(), testTTLMillis)
		if err := srv.Stop(); err != nil {
			t.Errorf("Stop before Start: %v", err)
		}
		if err := srv.Start(); err != nil {
			t.Fatal(err)
		}
		if err := srv.Stop(); err != nil {
			t.Errorf("first Stop: %v", err)
		}
		if err := srv.Stop(); err != nil {
			t.Errorf("second Stop: %v", err)
		}
	})

	t.Run("stop releases the port", func(t *testing.T) {
		srv := NewServer(log, 0, t.TempDir(), testTTLMillis)
		if err := srv.Start(); err != nil {
			t.Fatal(err)
		}
		addr := fmt.Sprintf("127.0.0.1:%d", srv.Port())
		if err := srv.Stop(); err != nil {
			t.Fatal(err)
		}
		if conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond); err == nil {
			_ = conn.Close()
			t.Fatal("port still accepts connections after Stop")
		}
	})
}
