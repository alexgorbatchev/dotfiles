package catalog

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestGETRetryPolicy(t *testing.T) {
	for _, tt := range []struct {
		name      string
		statuses  []int
		want      int
		wantError bool
	}{{"transient succeeds", []int{429, 502, 200}, 3, false}, {"exhausted", []int{503, 503, 503}, 3, true}, {"not found", []int{404}, 1, true}, {"forbidden", []int{403}, 1, true}} {
		t.Run(tt.name, func(t *testing.T) {
			count := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Retry-After", "0")
				status := tt.statuses[min(count, len(tt.statuses)-1)]
				count++
				w.WriteHeader(status)
				fmt.Fprint(w, "{}")
			}))
			defer server.Close()
			client, err := NewClient(ClientOptions{Origin: server.URL + "/", FS: fs.NewMemFS(), CacheDir: "/cache", AllowLoopbackHTTP: true})
			if err != nil {
				t.Fatal(err)
			}
			_, err = client.fetch(context.Background(), "v1/latest.json", maxPointerBytes, nil)
			if (err != nil) != tt.wantError || count != tt.want {
				t.Fatalf("GET requests = %d, error %v; want %d, error %v", count, err, tt.want, tt.wantError)
			}
		})
	}
}

func Test304WithoutUsableBodyRetriesOnce(t *testing.T) {
	count := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { count++; w.WriteHeader(http.StatusNotModified) }))
	defer server.Close()
	client, err := NewClient(ClientOptions{Origin: server.URL + "/", FS: fs.NewMemFS(), CacheDir: "/cache", AllowLoopbackHTTP: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Discover(context.Background(), RequestOptions{}); err == nil || count != 2 {
		t.Fatalf("unusable 304 requests=%d error=%v", count, err)
	}
}

func TestActiveRequestCancellation(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(started); <-r.Context().Done() }))
	defer server.Close()
	client, err := NewClient(ClientOptions{Origin: server.URL + "/", FS: fs.NewMemFS(), CacheDir: "/cache", AllowLoopbackHTTP: true})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := client.Discover(ctx, RequestOptions{}); done <- err }()
	<-started
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("request cancellation = %v", err)
	}
}

func TestUnsupportedContentEncodingAndInvalidGzip(t *testing.T) {
	for _, encoding := range []string{"br", "gzip"} {
		t.Run(encoding, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Encoding", encoding)
				fmt.Fprint(w, "invalid gzip")
			}))
			defer server.Close()
			client, err := NewClient(ClientOptions{Origin: server.URL + "/", FS: fs.NewMemFS(), CacheDir: "/cache", AllowLoopbackHTTP: true})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := client.fetch(context.Background(), "v1/latest.json", maxPointerBytes, nil); err == nil {
				t.Fatal("invalid encoding accepted")
			}
		})
	}
}
