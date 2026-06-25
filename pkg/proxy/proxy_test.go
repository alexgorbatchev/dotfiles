package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestProxyServer(t *testing.T) {
	// Create temp cache dir
	tempDir, err := os.MkdirTemp("", "proxy-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create logger
	log := logger.New(logger.Config{
		Name:   "test-proxy",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	// Spin up mock backend/target server
	hitCount := 0
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitCount++
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fmt.Sprintf("backend response %d", hitCount)))
	}))
	defer targetServer.Close()

	// Spin up caching proxy server
	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	// Miss test
	reqURL := fmt.Sprintf("%s/%s", proxyURL, targetServer.URL)
	resp, err := http.Get(reqURL)
	if err != nil {
		t.Fatalf("failed to get via proxy: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected StatusOK, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "backend response 1" {
		t.Errorf("expected 'backend response 1', got '%s'", string(body))
	}

	cacheHeader := resp.Header.Get("X-Dotfiles-Cache")
	if cacheHeader != "MISS" {
		t.Errorf("expected cache status MISS, got %s", cacheHeader)
	}

	// Hit test
	resp2, err := http.Get(reqURL)
	if err != nil {
		t.Fatalf("failed to get via proxy second time: %v", err)
	}
	defer resp2.Body.Close()

	body2, _ := io.ReadAll(resp2.Body)
	if string(body2) != "backend response 1" {
		t.Errorf("expected hit of 'backend response 1', got '%s'", string(body2))
	}

	cacheHeader2 := resp2.Header.Get("X-Dotfiles-Cache")
	if cacheHeader2 != "HIT" {
		t.Errorf("expected cache status HIT, got %s", cacheHeader2)
	}

	// Backend should have only been hit once
	if hitCount != 1 {
		t.Errorf("expected backend hit count 1, got %d", hitCount)
	}

	// Stats test
	statsResp, err := http.Get(proxyURL + "/cache/stats")
	if err != nil {
		t.Fatalf("failed to get stats: %v", err)
	}
	defer statsResp.Body.Close()

	var stats Stats
	_ = json.NewDecoder(statsResp.Body).Decode(&stats)
	if stats.Entries != 1 {
		t.Errorf("expected 1 cache entry, got %d", stats.Entries)
	}

	// Clear test
	clearPayload, _ := json.Marshal(CacheClearRequest{Pattern: "*"})
	clearResp, err := http.Post(proxyURL+"/cache/clear", "application/json", bytes.NewReader(clearPayload))
	if err != nil {
		t.Fatalf("failed to clear cache: %v", err)
	}
	defer clearResp.Body.Close()

	var clearRes CacheClearResult
	_ = json.NewDecoder(clearResp.Body).Decode(&clearRes)
	if clearRes.Cleared != 1 {
		t.Errorf("expected cleared count 1, got %d", clearRes.Cleared)
	}

	// Recheck stats
	statsResp2, _ := http.Get(proxyURL + "/cache/stats")
	_ = json.NewDecoder(statsResp2.Body).Decode(&stats)
	statsResp2.Body.Close()
	if stats.Entries != 0 {
		t.Errorf("expected 0 entries after clear, got %d", stats.Entries)
	}

	// Populate test
	popPayload, _ := json.Marshal(CachePopulateRequest{
		URL:    "http://example.com/test",
		Method: "GET",
		Body:   "populated-content",
	})
	popResp, err := http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload))
	if err != nil {
		t.Fatalf("failed to populate cache: %v", err)
	}
	defer popResp.Body.Close()

	var popRes CachePopulateResult
	_ = json.NewDecoder(popResp.Body).Decode(&popRes)
	if !popRes.Success {
		t.Errorf("expected populate success")
	}

	// Try getting the populated URL
	popGetResp, err := http.Get(proxyURL + "/http://example.com/test")
	if err != nil {
		t.Fatalf("failed to get populated url: %v", err)
	}
	defer popGetResp.Body.Close()

	popGetBody, _ := io.ReadAll(popGetResp.Body)
	if string(popGetBody) != "populated-content" {
		t.Errorf("expected 'populated-content', got '%s'", string(popGetBody))
	}
	if popGetResp.Header.Get("X-Dotfiles-Cache") != "HIT" {
		t.Errorf("expected populated response to be a HIT")
	}
}

func TestMatchGlob(t *testing.T) {
	tests := []struct {
		url     string
		method  string
		pattern string
		want    bool
	}{
		{"http://example.com/foo", "GET", "*", true},
		{"http://example.com/foo", "GET", "GET:*", true},
		{"http://example.com/foo", "POST", "GET:*", false},
		{"http://example.com/foo", "GET", "foo", true},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%s-%s-%s", tt.url, tt.method, tt.pattern), func(t *testing.T) {
			got := matchGlob(tt.url, tt.method, tt.pattern)
			if got != tt.want {
				t.Errorf("matchGlob(%q, %q, %q) = %v, want %v", tt.url, tt.method, tt.pattern, got, tt.want)
			}
		})
	}
}

func TestProxyGet_Concurrency(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-concurrency-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	store := NewCacheStore(tempDir, 1000)

	// Set an expired entry (TTL = 1ms, then sleep)
	targetURL := "http://example.com/expired"
	err = store.Set("GET", targetURL, 200, map[string]string{"Content-Type": "text/plain"}, []byte("expired-content"), 1)
	if err != nil {
		t.Fatalf("failed to set cache entry: %v", err)
	}

	time.Sleep(10 * time.Millisecond)

	const numGoroutines = 100
	var wg sync.WaitGroup
	startCh := make(chan struct{})

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-startCh
			_, _, _ = store.Get("GET", targetURL)
		}()
	}

	// Release all goroutines at once to hit Get() simultaneously
	close(startCh)
	wg.Wait()

	// Assert that we don't crash, deadlock, and that the item is deleted safely
	stats := store.GetStats()
	if stats.Entries != 0 {
		t.Errorf("expected 0 cache entries after expiration sweep, got %d", stats.Entries)
	}
}

func TestMatchGlob_WordBoundaries(t *testing.T) {
	tests := []struct {
		url     string
		method  string
		pattern string
		want    bool
	}{
		{"http://github.com/foo", "GET", "github.com", true},
		{"https://github.com/bar", "GET", "github.com", true},
		{"http://notgithub.com/foo", "GET", "github.com", false},
		{"http://mygithub.com/foo", "GET", "github.com", false},
		{"http://sub.github.com/foo", "GET", "github.com", true},
		{"http://github.com/foo", "GET", "**github.com**", true},
		{"http://notgithub.com/foo", "GET", "**github.com**", false},
		{"http://github.com/foo", "GET", "github.com/foo", true},
		{"http://notgithub.com/foo", "GET", "github.com/foo", false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%s-%s-%s", tt.url, tt.method, tt.pattern), func(t *testing.T) {
			got := matchGlob(tt.url, tt.method, tt.pattern)
			if got != tt.want {
				t.Errorf("matchGlob(%q, %q, %q) = %v, want %v", tt.url, tt.method, tt.pattern, got, tt.want)
			}
		})
	}
}

func TestProxyServer_ClearGlob_WordBoundaries(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "proxy-clear-test-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	log := logger.New(logger.Config{
		Name:   "test-proxy-clear",
		Level:  logger.LogLevelQuiet,
		Writer: io.Discard,
	})

	proxy := NewServer(log, 0, tempDir, 5000)
	if err := proxy.Start(); err != nil {
		t.Fatalf("failed to start proxy: %v", err)
	}
	defer proxy.Stop()

	proxyURL := fmt.Sprintf("http://127.0.0.1:%d", proxy.Port())

	// Populate github.com
	popPayload1, _ := json.Marshal(CachePopulateRequest{
		URL:    "http://github.com/foo",
		Method: "GET",
		Body:   "github-content",
	})
	_, err = http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload1))
	if err != nil {
		t.Fatalf("failed to populate github: %v", err)
	}

	// Populate notgithub.com
	popPayload2, _ := json.Marshal(CachePopulateRequest{
		URL:    "http://notgithub.com/bar",
		Method: "GET",
		Body:   "notgithub-content",
	})
	_, err = http.Post(proxyURL+"/cache/populate", "application/json", bytes.NewReader(popPayload2))
	if err != nil {
		t.Fatalf("failed to populate notgithub: %v", err)
	}

	// Clear pattern "github.com"
	clearPayload, _ := json.Marshal(CacheClearRequest{Pattern: "github.com"})
	clearResp, err := http.Post(proxyURL+"/cache/clear", "application/json", bytes.NewReader(clearPayload))
	if err != nil {
		t.Fatalf("failed to clear cache: %v", err)
	}
	defer clearResp.Body.Close()

	var clearRes CacheClearResult
	_ = json.NewDecoder(clearResp.Body).Decode(&clearRes)
	if clearRes.Cleared != 1 {
		t.Errorf("expected 1 cleared entry, got %d", clearRes.Cleared)
	}

	// Verify stats
	statsResp, _ := http.Get(proxyURL + "/cache/stats")
	var stats Stats
	_ = json.NewDecoder(statsResp.Body).Decode(&stats)
	statsResp.Body.Close()
	if stats.Entries != 1 {
		t.Errorf("expected 1 entry left, got %d", stats.Entries)
	}

	// Verify notgithub.com is still a HIT
	resp, err := http.Get(proxyURL + "/http://notgithub.com/bar")
	if err != nil {
		t.Fatalf("failed to check notgithub.com: %v", err)
	}
	defer resp.Body.Close()
	if resp.Header.Get("X-Dotfiles-Cache") != "HIT" {
		t.Errorf("expected notgithub.com to be a HIT, got %s", resp.Header.Get("X-Dotfiles-Cache"))
	}
}
