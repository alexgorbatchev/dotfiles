package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func cleanHost(host string) string {
	return strings.Replace(host, "[::1]", "127.0.0.1", 1)
}

func TestCacheStoreDeleteAndDefaultTTL(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-delete-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Default TTL when <= 0
	store := NewCacheStore(tempDir, 0)
	if store.defaultTTL <= 0 {
		t.Errorf("expected default TTL to be positive")
	}

	targetURL := "http://example.com/delete-me"
	_ = store.Set("GET", targetURL, 200, nil, []byte("data"), 10000)

	// Verify it exists
	_, _, err = store.Get("GET", targetURL)
	if err != nil {
		t.Fatalf("expected item to be in store: %v", err)
	}

	// Delete
	deleted := store.Delete("GET", targetURL)
	if !deleted {
		t.Fatalf("Delete returned false")
	}

	// Verify deleted
	_, _, err = store.Get("GET", targetURL)
	if err == nil {
		t.Errorf("expected item to be deleted (Get returning error)")
	}

	// Delete non-existent
	_ = store.Delete("GET", "http://example.com/nonexistent")
}

func TestProxyServerHandlersErrors(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-errors-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	log := logger.New(logger.Config{
		Name:   "test-proxy-errors",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	t.Run("Populate non-POST method", func(t *testing.T) {
		resp, err := http.Get(proxyURL + "/cache/populate")
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("expected 405 Method Not Allowed, got %d", resp.StatusCode)
		}
	})

	t.Run("Clear non-POST method", func(t *testing.T) {
		resp, err := http.Get(proxyURL + "/cache/clear")
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("expected 405 Method Not Allowed, got %d", resp.StatusCode)
		}
	})

	t.Run("Populate valid base64 body", func(t *testing.T) {
		popPayload, _ := json.Marshal(CachePopulateRequest{
			URL:          "http://example.com/b64",
			Method:       "GET",
			Body:         "SGVsbG8=", // "Hello" in base64
			BodyIsBase64: true,
		})
		resp, err := http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload))
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 OK for base64 body, got %d", resp.StatusCode)
		}
	})

	t.Run("Populate invalid base64 body", func(t *testing.T) {
		popPayload, _ := json.Marshal(CachePopulateRequest{
			URL:          "http://example.com/b64-invalid",
			Method:       "GET",
			Body:         "!!!not-base64!!!",
			BodyIsBase64: true,
		})
		resp, err := http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload))
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for invalid base64 body, got %d", resp.StatusCode)
		}
	})

	t.Run("Populate with custom method, status, headers", func(t *testing.T) {
		popPayload, _ := json.Marshal(CachePopulateRequest{
			URL:     "http://example.com/custom",
			Method:  "POST",
			Status:  201,
			Headers: map[string]string{"X-Custom": "val"},
			Body:    "custom-body",
		})
		resp, err := http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload))
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 OK for populate, got %d", resp.StatusCode)
		}

		// Verify Get returns custom status and headers
		entry, body, err := proxy.store.Get("POST", "http://example.com/custom")
		if err != nil {
			t.Fatalf("failed to get populated item: %v", err)
		}
		if entry.Status != 201 || entry.Headers["X-Custom"] != "val" || string(body) != "custom-body" {
			t.Errorf("unexpected entry values: status=%d, headers=%v, body=%q", entry.Status, entry.Headers, string(body))
		}
	})

	t.Run("Proxy normalization branches /http:/ and /https:/", func(t *testing.T) {
		targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok-normal"))
		}))
		defer targetServer.Close()

		hostAndPath := strings.TrimPrefix(targetServer.URL, "http://")
		reqURL := fmt.Sprintf("%s/http:/%s", proxyURL, hostAndPath)

		resp, err := http.Get(reqURL)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if string(body) != "ok-normal" {
			t.Errorf("expected 'ok-normal', got %q", string(body))
		}
	})

	t.Run("CONNECT to unreachable host", func(t *testing.T) {
		proxyConn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", proxy.Port()))
		if err != nil {
			t.Fatalf("failed to dial proxy: %v", err)
		}
		defer proxyConn.Close()

		reqStr := "CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n"
		_, _ = proxyConn.Write([]byte(reqStr))

		respBuf := make([]byte, 1024)
		n, _ := proxyConn.Read(respBuf)
		if !strings.Contains(string(respBuf[:n]), "502 Bad Gateway") {
			t.Errorf("expected 502 Bad Gateway on failed CONNECT dial, got %q", string(respBuf[:n]))
		}
	})
}

func TestCacheStoreCorruptedAndErrors(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-corrupt-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	store := NewCacheStore(tempDir, 5000)
	targetURL := "http://example.com/corrupt"

	_ = store.Set("GET", targetURL, 200, map[string]string{"X-Test": "1"}, []byte("corrupt-test"), 10000)

	// Corrupt metadata JSON file
	keyInvalidJSON := store.GenerateKey("GET", "http://example.com/invalid-json")
	jsonPath, _ := store.getPaths(keyInvalidJSON)
	_ = os.WriteFile(jsonPath, []byte("{invalid-json"), 0644)
	_, _, err = store.Get("GET", "http://example.com/invalid-json")
	if err == nil {
		t.Errorf("expected Get to fail on invalid metadata JSON")
	}

	key := store.GenerateKey("GET", targetURL)
	_, bodyPath := store.getPaths(key)
	_ = os.Remove(bodyPath)

	_, _, err = store.Get("GET", targetURL)
	if err == nil {
		t.Errorf("expected Get to fail when body file is missing")
	}

	roStore := NewCacheStore("/dev/null/invalid-cache-dir", 5000)
	if err := roStore.Set("GET", targetURL, 200, nil, []byte("data"), 1000); err == nil {
		t.Errorf("expected Set to fail on invalid directory")
	}
}

func TestProxyServerProxyEdgeCases(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-edge-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	log := logger.New(logger.Config{Writer: io.Discard})
	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	// 1. Relative request without Host header
	reqRec := httptest.NewRecorder()
	reqReq := httptest.NewRequest("GET", "/relative-path", nil)
	reqReq.Host = ""
	proxy.handleProxy(reqRec, reqReq)
	if reqRec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for relative request without Host, got %d", reqRec.Code)
	}

	// 2. /http:// URL prefix
	targetHTTPServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("https-prefix-ok"))
	}))
	defer targetHTTPServer.Close()

	u1, _ := url.Parse(targetHTTPServer.URL)
	reqURL := fmt.Sprintf("%s/http://%s", proxyURL, u1.Host)
	resp, err := http.Get(reqURL)
	if err == nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if string(body) != "https-prefix-ok" {
			t.Errorf("expected 'https-prefix-ok', got %q", string(body))
		}
	}

	// 3. /http:/ single slash prefix
	targetSingleSlash := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("single-slash-ok"))
	}))
	defer targetSingleSlash.Close()

	uSingle, _ := url.Parse(targetSingleSlash.URL)
	reqURLHttpSingle := fmt.Sprintf("%s/http:/%s", proxyURL, uSingle.Host)
	resp, err = http.Get(reqURLHttpSingle)
	if err == nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if string(body) != "single-slash-ok" {
			t.Errorf("expected 'single-slash-ok', got %q", string(body))
		}
	}

	// 4. Proxy miss and cache 200 response
	targetCacheServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Server-Header", "cached-header")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("cache-me"))
	}))
	defer targetCacheServer.Close()

	u2, _ := url.Parse(targetCacheServer.URL)
	reqURLCache := fmt.Sprintf("%s/http://%s", proxyURL, u2.Host)

	// First request (MISS & Cache)
	resp1, err := http.Get(reqURLCache)
	if err == nil {
		resp1.Body.Close()
	}

	// Second request (HIT from Cache)
	resp2, err := http.Get(reqURLCache)
	if err == nil {
		if resp2.Header.Get("X-Dotfiles-Cache") != "HIT" {
			t.Errorf("expected X-Dotfiles-Cache: HIT, got %q", resp2.Header.Get("X-Dotfiles-Cache"))
		}
		resp2.Body.Close()
	}

	// GET /cache/stats
	respStats, err := http.Get(proxyURL + "/cache/stats")
	if err == nil {
		respStats.Body.Close()
	}

	// Proxy miss error (502 Bad Gateway)
	reqRec2 := httptest.NewRecorder()
	canceledCtx, cancel := context.Background(), func() {}
	canceledCtx, cancel = context.WithCancel(canceledCtx)
	cancel()
	reqReq2 := httptest.NewRequest("GET", "http://example.com/cancelled", nil).WithContext(canceledCtx)
	proxy.handleProxy(reqRec2, reqReq2)
	if reqRec2.Code != http.StatusBadGateway {
		t.Errorf("expected 502 Bad Gateway, got %d", reqRec2.Code)
	}

	// Request with custom header
	reqHeader, _ := http.NewRequest("GET", proxyURL+"/http/"+u1.Host, nil)
	reqHeader.Header.Set("X-Test-Header", "custom-val")
	respH, err := http.DefaultClient.Do(reqHeader)
	if err == nil {
		respH.Body.Close()
	}

	// 5. POST request with body
	targetPOSTServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(append([]byte("POST:"), body...))
	}))
	defer targetPOSTServer.Close()

	uPOST, _ := url.Parse(targetPOSTServer.URL)
	reqPOST, _ := http.NewRequest("POST", fmt.Sprintf("%s/http://%s", proxyURL, uPOST.Host), strings.NewReader("post-data"))
	respPOST, err := http.DefaultClient.Do(reqPOST)
	if err == nil {
		body, _ := io.ReadAll(respPOST.Body)
		respPOST.Body.Close()
		if string(body) != "POST:post-data" {
			t.Errorf("expected 'POST:post-data', got %q", string(body))
		}
	}
}

func TestProxyServerStopNilServer(t *testing.T) {
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	s := &Server{ln: l}
	err := s.Stop()
	if err != nil {
		t.Errorf("Stop with nil server returned error: %v", err)
	}
}

func TestProxyPopulateAndStoreSet(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-pop-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	log := logger.New(logger.Config{Writer: io.Discard})
	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	// 1. Missing URL in populate
	popPayload, _ := json.Marshal(CachePopulateRequest{
		Method: "GET",
		Body:   "body",
	})
	resp, err := http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload))
	if err == nil {
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for missing URL, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// 2. Invalid JSON in populate
	resp, err = http.Post(proxyURL+"/cache/populate", "application/json", strings.NewReader("{invalid json"))
	if err == nil {
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for invalid JSON, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// 3. Set with TTL <= 0 (defaults to store.defaultTTL)
	store := NewCacheStore(tempDir, 10000)
	_ = store.Set("GET", "http://example.com/no-ttl", 200, nil, []byte("data"), 0)
	_ = store.Clear()
}

func TestProxyMiss404NotCached(t *testing.T) {
	tempDir := t.TempDir()
	log := logger.New(logger.Config{Writer: io.Discard})
	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	target404Server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("not found"))
	}))
	defer target404Server.Close()

	u404, _ := url.Parse(target404Server.URL)
	reqURL := fmt.Sprintf("%s/http://%s", proxyURL, u404.Host)

	resp, err := http.Get(reqURL)
	if err != nil || resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found from proxy, got status %v, err %v", resp.StatusCode, err)
	}
	resp.Body.Close()

	// Verify not cached
	_, _, err = proxy.store.Get("GET", target404Server.URL)
	if err == nil {
		t.Error("expected 404 response NOT to be cached")
	}
}

func TestCacheStoreSetWriteErrors(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "file_blocking_dir")
	_ = os.WriteFile(filePath, []byte("file"), 0644)

	store := NewCacheStore(filePath, 5000)
	err := store.Set("GET", "http://example.com/blocked", 200, nil, []byte("data"), 1000)
	if err == nil {
		t.Error("expected error when cache dir is blocked by a file")
	}
}

func TestProxyClearWithGlobAndErrors(t *testing.T) {
	tempDir := t.TempDir()
	log := logger.New(logger.Config{Writer: io.Discard})
	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	// Populate entries
	_ = proxy.store.Set("GET", "http://example.com/api/v1", 200, nil, []byte("v1"), 10000)
	_ = proxy.store.Set("GET", "http://example.com/api/v2", 200, nil, []byte("v2"), 10000)

	// 1. Invalid JSON in clear -> 400 Bad Request
	resp, err := http.Post(proxyURL+"/cache/clear", "application/json", strings.NewReader("{invalid"))
	if err == nil {
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 400 for invalid JSON in clear, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// 2. Clear with glob pattern
	clearPayload, _ := json.Marshal(CacheClearRequest{Pattern: "*v1*"})
	resp, err = http.Post(proxyURL+"/cache/clear", "application/json", bytes.NewReader(clearPayload))
	if err == nil {
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for glob clear, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// Verify v1 cleared, v2 remains
	_, _, err1 := proxy.store.Get("GET", "http://example.com/api/v1")
	_, _, err2 := proxy.store.Get("GET", "http://example.com/api/v2")
	if err1 == nil {
		t.Error("expected v1 to be cleared")
	}
	if err2 != nil {
		t.Error("expected v2 to remain")
	}

	// 3. Clear all (empty glob)
	resp, err = http.Post(proxyURL+"/cache/clear", "application/json", strings.NewReader("{}"))
	if err == nil {
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for clear all, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}

	// 4. Clear with Patterns array and METHOD:pattern format
	clearPayload2, _ := json.Marshal(CacheClearRequest{Patterns: []string{"GET:*v1*", "*v2*"}})
	resp, err = http.Post(proxyURL+"/cache/clear", "application/json", bytes.NewReader(clearPayload2))
	if err == nil {
		if resp.StatusCode != http.StatusOK {
			t.Errorf("expected 200 for Patterns array clear, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}
}

func TestCacheStoreSetMetaWriteError(t *testing.T) {
	tempDir := t.TempDir()
	store := NewCacheStore(tempDir, 5000)

	// Create directory at metaPath so os.WriteFile fails
	key := store.GenerateKey("GET", "http://example.com/blocked-meta")
	metaPath, _ := store.getPaths(key)
	_ = os.MkdirAll(metaPath, 0755)

	err := store.Set("GET", "http://example.com/blocked-meta", 200, nil, []byte("data"), 1000)
	if err == nil {
		t.Error("expected error writing metadata file when path is a directory")
	}

	// Create directory at bodyPath so os.WriteFile fails
	key2 := store.GenerateKey("GET", "http://example.com/blocked-body")
	_, bodyPath2 := store.getPaths(key2)
	_ = os.MkdirAll(bodyPath2, 0755)

	err = store.Set("GET", "http://example.com/blocked-body", 200, nil, []byte("data"), 1000)
	if err == nil {
		t.Error("expected error writing body file when path is a directory")
	}
}

func TestProxyServerStartError(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer l.Close()

	port := l.Addr().(*net.TCPAddr).Port
	proxy := NewServer(log, port, t.TempDir(), 5000)

	err = proxy.Start()
	if err == nil {
		proxy.Stop()
		t.Error("expected error starting proxy server on already bound port")
	}
}

func TestProxyServerStopTwice(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	proxy := NewServer(log, 0, t.TempDir(), 5000)

	// Stop non-started server
	err := proxy.Stop()
	if err != nil {
		t.Errorf("Stop on non-started server returned error: %v", err)
	}

	// Start and stop twice
	_ = proxy.Start()
	_ = proxy.Stop()
	err = proxy.Stop()
	if err != nil {
		t.Errorf("Stop second time returned error: %v", err)
	}
}

func TestProxyRelativeAndParseError(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	proxy := NewServer(log, 0, t.TempDir(), 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	// Target server for relative proxying
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("relative-ok"))
	}))
	defer targetServer.Close()

	// 1. Relative request with Host header
	uRel, _ := url.Parse(targetServer.URL)
	req, _ := http.NewRequest("GET", proxyURL+"/test-relative", nil)
	req.Host = uRel.Host

	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if string(body) != "relative-ok" {
			t.Errorf("expected 'relative-ok', got %q", string(body))
		}
	}

	// 2. /http:// prefix
	targetHTTPSServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("http-dbl-slash-ok"))
	}))
	defer targetHTTPSServer.Close()

	uDbl, _ := url.Parse(targetHTTPSServer.URL)
	reqURLDbl := fmt.Sprintf("%s/http://%s", proxyURL, uDbl.Host)
	resp, err = http.Get(reqURLDbl)
	if err == nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if string(body) != "http-dbl-slash-ok" {
			t.Errorf("expected 'http-dbl-slash-ok', got %q", string(body))
		}
	}

	// 3. Invalid target URL
	reqURLInvalid := fmt.Sprintf("%s/http://[::1]:namedport", proxyURL)
	resp, err = http.Get(reqURLInvalid)
	if err == nil {
		resp.Body.Close()
	}
}

func TestMatchGlobMore(t *testing.T) {
	if !matchGlob("http://example.com/a", "GET", "") {
		t.Error("expected matchGlob empty pattern true")
	}
	if !matchGlob("http://example.com/a", "GET", "*") {
		t.Error("expected matchGlob wildcard pattern true")
	}
	if !matchGlob("http://example.com/a", "GET", "GET:*") {
		t.Error("expected matchGlob GET:* pattern true")
	}
}
