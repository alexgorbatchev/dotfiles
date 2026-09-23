package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// freePort reserves and releases a loopback port so the dev proxy can bind it.
func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserving a port: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	if err := ln.Close(); err != nil {
		t.Fatalf("releasing the port: %v", err)
	}
	return port
}

// cachedURLs lists every URL the dev proxy cache under cwd holds.
func cachedURLs(t *testing.T) []string {
	t.Helper()
	var urls []string
	err := filepath.WalkDir(devProxyCacheDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".meta.json") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var entry struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(data, &entry); err != nil {
			return err
		}
		urls = append(urls, entry.URL)
		return nil
	})
	if err != nil {
		t.Fatalf("reading dev proxy cache: %v", err)
	}
	return urls
}

// resetInstallerClients puts the real installers back on the default client
// once a test has pointed them at a dev proxy that is stopped afterwards.
func resetInstallerClients(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		reg := installer.DefaultRegistry()
		for _, name := range reg.List() {
			inst, err := reg.Get(name)
			if err != nil {
				t.Fatalf("resolving installer %q: %v", name, err)
			}
			installer.SetHTTPClient(inst, http.DefaultClient)
		}
	})
}

func TestParseDevProxyPort(t *testing.T) {
	tests := []struct {
		raw     string
		want    int
		wantErr string
	}{
		{raw: "3128", want: 3128},
		{raw: " 3128 ", want: 3128},
		{raw: "1", want: 1},
		{raw: "65535", want: 65535},
		{raw: "", wantErr: `Invalid DEV_PROXY: "" (expected an integer between 1 and 65535)`},
		{raw: "abc", wantErr: `Invalid DEV_PROXY: "abc" (expected an integer between 1 and 65535)`},
		{raw: "0", wantErr: `Invalid DEV_PROXY: "0" (expected an integer between 1 and 65535)`},
		{raw: "65536", wantErr: `Invalid DEV_PROXY: "65536" (expected an integer between 1 and 65535)`},
		{raw: "-1", wantErr: `Invalid DEV_PROXY: "-1" (expected an integer between 1 and 65535)`},
		{raw: "31.28", wantErr: `Invalid DEV_PROXY: "31.28" (expected an integer between 1 and 65535)`},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("%q", tt.raw), func(t *testing.T) {
			got, err := parseDevProxyPort(tt.raw)
			if tt.wantErr != "" {
				if err == nil || err.Error() != tt.wantErr {
					t.Fatalf("error = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("port = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestStartDevProxy(t *testing.T) {
	t.Run("unset leaves the proxy off", func(t *testing.T) {
		t.Setenv(devProxyEnv, "")
		os.Unsetenv(devProxyEnv)
		srv, err := startDevProxy(logger.New(logger.Config{Writer: io.Discard}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if srv != nil {
			_ = srv.Stop()
			t.Fatal("proxy started without DEV_PROXY")
		}
	})

	t.Run("invalid value fails fast", func(t *testing.T) {
		t.Setenv(devProxyEnv, "abc")
		srv, err := startDevProxy(logger.New(logger.Config{Writer: io.Discard}))
		if srv != nil {
			_ = srv.Stop()
		}
		if err == nil || !strings.Contains(err.Error(), `Invalid DEV_PROXY: "abc"`) {
			t.Fatalf("error = %v, want the invalid port message", err)
		}
	})

	t.Run("bound port fails fast", func(t *testing.T) {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer ln.Close()
		t.Setenv(devProxyEnv, strconv.Itoa(ln.Addr().(*net.TCPAddr).Port))
		srv, err := startDevProxy(logger.New(logger.Config{Writer: io.Discard}))
		if srv != nil {
			_ = srv.Stop()
		}
		if err == nil {
			t.Fatal("expected an error when the port is already bound")
		}
	})

	t.Run("valid port starts the proxy and announces it", func(t *testing.T) {
		enterTempDir(t)
		port := freePort(t)
		t.Setenv(devProxyEnv, strconv.Itoa(port))
		var logBuf bytes.Buffer
		srv, err := startDevProxy(logger.New(logger.Config{Writer: &logBuf}))
		if err != nil {
			t.Fatalf("startDevProxy: %v", err)
		}
		defer srv.Stop()
		if srv.Port() != port {
			t.Errorf("proxy bound port %d, want %d", srv.Port(), port)
		}
		want := fmt.Sprintf("Routing requests through HTTP proxy on port %d", port)
		if !strings.Contains(logBuf.String(), want) {
			t.Errorf("log output %q lacks %q", logBuf.String(), want)
		}

		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, "ok")
		}))
		defer upstream.Close()
		resp, err := srv.Client().Get(upstream.URL + "/probe")
		if err != nil {
			t.Fatalf("request through proxy: %v", err)
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()

		// The cache lands where v1 kept it: .tmp/http-proxy-cache under cwd.
		if got := cachedURLs(t); len(got) != 1 || got[0] != upstream.URL+"/probe" {
			t.Errorf("cached URLs = %v, want [%s]", got, upstream.URL+"/probe")
		}
	})
}

func TestBootstrapServicesDevProxy(t *testing.T) {
	writeConfig := func(t *testing.T) string {
		t.Helper()
		cfgPath := filepath.Join(t.TempDir(), "dotfiles.config.ts")
		if err := os.WriteFile(cfgPath, []byte(`export default { paths: { generatedDir: "./.generated" } };`), 0o644); err != nil {
			t.Fatal(err)
		}
		return cfgPath
	}

	t.Run("invalid DEV_PROXY aborts the bootstrap", func(t *testing.T) {
		t.Setenv(devProxyEnv, "not-a-port")
		services, err := BootstrapServices(context.Background(), writeConfig(t))
		if services != nil {
			_ = services.Close()
		}
		if err == nil || !strings.Contains(err.Error(), `Invalid DEV_PROXY: "not-a-port"`) {
			t.Fatalf("error = %v, want the invalid port message", err)
		}
	})

	t.Run("services own the proxy and its client", func(t *testing.T) {
		enterTempDir(t)
		port := freePort(t)
		t.Setenv(devProxyEnv, strconv.Itoa(port))

		services, err := BootstrapServices(context.Background(), writeConfig(t))
		if err != nil {
			t.Fatalf("BootstrapServices: %v", err)
		}
		if services.HTTPClient == nil {
			t.Fatal("Services.HTTPClient is nil with DEV_PROXY set")
		}

		var hits int
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hits++
			fmt.Fprint(w, "ok")
		}))
		defer upstream.Close()

		for i, want := range []string{"MISS", "HIT"} {
			resp, err := services.HTTPClient.Get(upstream.URL + "/release")
			if err != nil {
				t.Fatalf("request %d through Services.HTTPClient: %v", i, err)
			}
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if got := resp.Header.Get("X-Dotfiles-Cache"); got != want {
				t.Errorf("request %d X-Dotfiles-Cache = %q, want %q", i, got, want)
			}
		}
		if hits != 1 {
			t.Errorf("origin hits = %d, want 1", hits)
		}

		if err := services.Close(); err != nil {
			t.Fatalf("Close: %v", err)
		}
		addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
		if conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond); err == nil {
			_ = conn.Close()
			t.Fatal("proxy port still accepts connections after Services.Close")
		}
	})

	t.Run("without DEV_PROXY there is no client", func(t *testing.T) {
		t.Setenv(devProxyEnv, "")
		os.Unsetenv(devProxyEnv)
		services, err := BootstrapServices(context.Background(), writeConfig(t))
		if err != nil {
			t.Fatalf("BootstrapServices: %v", err)
		}
		defer services.Close()
		if services.HTTPClient != nil {
			t.Error("Services.HTTPClient set without DEV_PROXY")
		}
	})
}

// TestCheckUpdatesThroughDevProxy proves the installers are wired: a real
// github-release update check under DEV_PROXY leaves the GitHub API response
// in the proxy cache.
func TestCheckUpdatesThroughDevProxy(t *testing.T) {
	t.Setenv("DOTFILES_E2E_USE_REAL_INSTALLERS", "true")
	resetInstallerClients(t)
	enterTempDir(t)

	const repo = "acme/proxied"
	releases := newReleaseServer(t, map[string]mockRelease{repo: {Tag: "v1.2.3"}})
	p := newE2EProject(t, fmt.Sprintf(`"proxied": {"name": "proxied", "installationMethod": "github-release", "installParams": {"repo": %q}}`, repo))

	port := freePort(t)
	t.Setenv(devProxyEnv, strconv.Itoa(port))

	out, err := p.run("tool", "check")
	if err != nil {
		t.Fatalf("tool check: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stdout", out.Stdout, "proxied: not installed (latest: v1.2.3)\n")

	// BootstrapServices points github.host at http://127.0.0.1:MOCK_SERVER_PORT.
	wantURL := fmt.Sprintf("http://127.0.0.1:%d/repos/%s/releases/latest", releases.Listener.Addr().(*net.TCPAddr).Port, repo)
	if got := cachedURLs(t); len(got) != 1 || got[0] != wantURL {
		t.Errorf("dev proxy cache holds %v, want [%s]", got, wantURL)
	}
}

// TestUpgradeCheckThroughDevProxy proves the self-updater is wired too.
func TestUpgradeCheckThroughDevProxy(t *testing.T) {
	enterTempDir(t)
	server, _ := newReleaseListServer(t, http.StatusOK, fmt.Sprintf(`[{"tag_name": "v%s", "prerelease": false}]`, Version))
	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)
	t.Setenv(devProxyEnv, strconv.Itoa(freePort(t)))

	out, err := runCommand("self", "upgrade", "--check")
	if err != nil {
		t.Fatalf("self upgrade --check: %v\n%s", err, out.Combined)
	}
	mustContain(t, "stdout", out.Stdout, "up to date")

	got := cachedURLs(t)
	if len(got) != 1 || !strings.HasPrefix(got[0], server.URL+"/") {
		t.Errorf("dev proxy cache holds %v, want one URL under %s", got, server.URL)
	}
}
