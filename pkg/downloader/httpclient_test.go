package downloader

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

// recordingTransport counts the requests it carries before handing them to the
// real transport, so a test can tell which client a download went through.
type recordingTransport struct {
	calls atomic.Int32
}

func (r *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	r.calls.Add(1)
	return http.DefaultTransport.RoundTrip(req)
}

func TestSetHTTPClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "content")
	}))
	t.Cleanup(server.Close)

	t.Run("downloads go through the injected client", func(t *testing.T) {
		memFS := fs.NewMemFS()
		d := NewDownloader(memFS, nil)
		rec := &recordingTransport{}
		d.SetHTTPClient(&http.Client{Transport: rec})

		if err := d.Download(context.Background(), server.URL+"/file", "/file", "", DownloadOptions{SkipCache: true}); err != nil {
			t.Fatalf("Download: %v", err)
		}
		if rec.calls.Load() != 1 {
			t.Errorf("injected client carried %d requests, want 1", rec.calls.Load())
		}
		data, err := memFS.ReadFile("/file")
		if err != nil || string(data) != "content" {
			t.Errorf("downloaded content = %q (err=%v), want %q", data, err, "content")
		}
	})

	t.Run("nil client and nil downloader are ignored", func(t *testing.T) {
		d := NewDownloader(fs.NewMemFS(), nil)
		before := d.client
		d.SetHTTPClient(nil)
		if d.client != before {
			t.Error("nil client replaced the existing client")
		}
		var none *Downloader
		none.SetHTTPClient(&http.Client{})
	})
}
