package installer

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
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

// TestSetHTTPClient covers every installer that talks HTTP: after SetHTTPClient
// both its API client and its downloader use the injected client, which is what
// lets the development proxy capture all of an installer's traffic.
// (Note: uv talks HTTP directly for PyPI metadata queries and is verified in uv_test.go.)
func TestSetHTTPClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "content")
	}))
	t.Cleanup(server.Close)

	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()

	tests := []struct {
		name       string
		inst       Installer
		dl         func() *downloader.Downloader
		httpClient func() *http.Client // nil when the installer only downloads
	}{
		{
			name: "github-release",
			inst: NewGitHubInstaller(runner, memFS, nil, nil),
			dl:   nil,
		},
		{
			name: "gitea-release",
			inst: NewGiteaInstaller(runner, memFS, nil, nil),
		},
		{
			name: "cargo",
			inst: NewCargoInstaller(runner, memFS, nil, nil),
		},
		{
			name: "dmg",
			inst: NewDmgInstaller(runner, memFS, nil, nil),
		},
		{
			name: "pkg",
			inst: NewPkgInstaller(runner, memFS, nil, nil),
		},
		{
			name: "curl-tar",
			inst: NewCurlTarInstaller(runner, memFS, nil, nil),
		},
		{
			name: "curl-binary",
			inst: NewCurlBinaryInstaller(runner, memFS, nil, nil),
		},
		{
			name: "curl-script",
			inst: NewCurlScriptInstaller(runner, memFS, nil, nil),
		},
	}
	for i := range tests {
		switch inst := tests[i].inst.(type) {
		case *GitHubInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
			tests[i].httpClient = func() *http.Client { return inst.httpClient }
		case *GiteaInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
			tests[i].httpClient = func() *http.Client { return inst.httpClient }
		case *CargoInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
			tests[i].httpClient = func() *http.Client { return inst.httpClient }
		case *DmgInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
			tests[i].httpClient = func() *http.Client { return inst.httpClient }
		case *PkgInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
			tests[i].httpClient = func() *http.Client { return inst.httpClient }
		case *CurlTarInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
			tests[i].httpClient = func() *http.Client { return inst.httpClient }
		case *CurlBinaryInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
		case *CurlScriptInstaller:
			tests[i].dl = func() *downloader.Downloader { return inst.dl }
		default:
			t.Fatalf("test table has no accessor for %T", inst)
		}
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := &recordingTransport{}
			client := &http.Client{Transport: rec}
			SetHTTPClient(tt.inst, client)

			if tt.httpClient != nil && tt.httpClient() != client {
				t.Error("API client was not replaced")
			}

			dest := "/" + tt.name + "-download"
			if err := tt.dl().Download(context.Background(), server.URL+"/asset", dest, "", downloader.DownloadOptions{SkipCache: true}); err != nil {
				t.Fatalf("Download through installer's downloader: %v", err)
			}
			if rec.calls.Load() != 1 {
				t.Errorf("downloader carried %d requests through the injected client, want 1", rec.calls.Load())
			}
		})
	}

	t.Run("installers without HTTP traffic are left alone", func(t *testing.T) {
		SetHTTPClient(NewBrewInstaller(runner, memFS, nil), &http.Client{})
	})
}
