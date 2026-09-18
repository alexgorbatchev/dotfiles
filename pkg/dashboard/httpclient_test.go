package dashboard

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// recordingTransport counts the requests it carries before handing them to the
// real transport, so a test can tell which client a request went through.
type recordingTransport struct {
	calls atomic.Int32
}

func (r *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	r.calls.Add(1)
	return http.DefaultTransport.RoundTrip(req)
}

func TestSetHTTPClientRoutesReadmeFetch(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "# Readme")
	}))
	t.Cleanup(api.Close)

	log := logger.New(logger.Config{Writer: io.Discard})
	s := NewServer(log, "", 0, nil, nil, "", nil, nil, nil)
	s.githubBaseURL = api.URL
	s.githubRawBaseURL = api.URL

	rec := &recordingTransport{}
	s.SetHTTPClient(&http.Client{Transport: rec})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	content, err := s.fetchRemoteReadme(ctx, "owner/repo")
	if err != nil {
		t.Fatalf("fetchRemoteReadme: %v", err)
	}
	if content != "# Readme" {
		t.Errorf("content = %q", content)
	}
	if rec.calls.Load() != 1 {
		t.Errorf("injected client carried %d requests, want 1", rec.calls.Load())
	}
}
