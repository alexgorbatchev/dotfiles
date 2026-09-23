package downloader

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// TestHostScopedHeaders pins that a download marked HostScopedHeaders keeps its
// Authorization header on a redirect within its host and drops it on one to any other
// host, including a subdomain-style sibling net/http alone would still trust, while a
// download without the option keeps net/http's own policy.
func TestHostScopedHeaders(t *testing.T) {
	var mu sync.Mutex
	seen := map[string]string{}
	record := func(r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		seen[r.Host+r.URL.Path] = r.Header.Get("Authorization")
	}
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		record(r)
		_, _ = w.Write([]byte("payload"))
	}))
	t.Cleanup(storage.Close)
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		record(r)
		switch r.URL.Path {
		case "/same-host":
			http.Redirect(w, r, "/final", http.StatusFound)
		case "/other-host":
			http.Redirect(w, r, storage.URL+"/asset", http.StatusFound)
		default:
			_, _ = w.Write([]byte("payload"))
		}
	}))
	t.Cleanup(origin.Close)
	originHost := strings.TrimPrefix(origin.URL, "http://")
	storageHost := strings.TrimPrefix(storage.URL, "http://")

	tests := []struct {
		name       string
		path       string
		scoped     bool
		finalKey   string
		wantHeader string
	}{
		{"same host keeps the token", "/same-host", true, originHost + "/final", "token secret"},
		{"another host gets none", "/other-host", true, storageHost + "/asset", ""},
		// Both servers are 127.0.0.1 on different ports, which net/http treats as the
		// same domain; that is exactly the case the option exists for.
		{"without the option net/http forwards it", "/other-host", false, storageHost + "/asset", "token secret"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mu.Lock()
			clear(seen)
			mu.Unlock()
			fsys := fs.NewMemFS()
			d := NewDownloader(fsys, &http.Client{})
			d.CacheEnabled = false
			err := d.Download(context.Background(), origin.URL+tt.path, "/out", "", DownloadOptions{
				Headers:           map[string]string{"Authorization": "token secret"},
				HostScopedHeaders: tt.scoped,
				Quiet:             true,
			})
			if err != nil {
				t.Fatalf("Download() error = %v", err)
			}
			mu.Lock()
			defer mu.Unlock()
			if got := seen[originHost+tt.path]; got != "token secret" {
				t.Errorf("origin received Authorization %q, want the token", got)
			}
			if got, ok := seen[tt.finalKey]; !ok || got != tt.wantHeader {
				t.Errorf("redirect target %s received Authorization %q (reached: %t), want %q", tt.finalKey, got, ok, tt.wantHeader)
			}
		})
	}
}

// TestHostScopedClientKeepsRedirectPolicy pins that the scoped client still stops
// redirect loops and still runs a policy the original client had.
func TestHostScopedClientKeepsRedirectPolicy(t *testing.T) {
	loop := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/again", http.StatusFound)
	}))
	t.Cleanup(loop.Close)

	if _, err := HostScopedClient(nil).Get(loop.URL); err == nil || !strings.Contains(err.Error(), "stopped after 10 redirects") {
		t.Fatalf("Get() error = %v, want the redirect limit", err)
	}

	called := false
	policy := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
		called = true
		return http.ErrUseLastResponse
	}}
	resp, err := HostScopedClient(policy).Get(loop.URL)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	resp.Body.Close()
	if !called || resp.StatusCode != http.StatusFound {
		t.Fatalf("original policy called = %t, status = %d; want it to decide", called, resp.StatusCode)
	}
}
