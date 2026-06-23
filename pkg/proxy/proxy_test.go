package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

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
