package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"slices"
	"strings"
	"testing"
)

// createTestTarGz builds a gzip-compressed tar archive holding the given files
// (name -> content, all executable) and returns its bytes.
func createTestTarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	for _, name := range slices.Sorted(maps.Keys(files)) {
		content := files[name]
		hdr := &tar.Header{
			Name: name,
			Mode: 0755,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("writing tar header for %s: %v", name, err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("writing tar body for %s: %v", name, err)
		}
	}

	if err := tw.Close(); err != nil {
		t.Fatalf("closing tar writer: %v", err)
	}
	if err := gw.Close(); err != nil {
		t.Fatalf("closing gzip writer: %v", err)
	}
	return buf.Bytes()
}

// newReleaseListServer serves a GitHub-style release list with the given status
// and body and returns the server and its port, which is how MOCK_SERVER_PORT
// addresses it.
func newReleaseListServer(t *testing.T, status int, body string) (*httptest.Server, string) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		fmt.Fprintln(w, body)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parsing test server URL: %v", err)
	}
	return server, u.Port()
}

// TestUpgradeCommand_Check drives `upgrade --check` and `upgrade --dry-run`
// against a release list that is either newer than or equal to this build.
func TestUpgradeCommand_Check(t *testing.T) {
	newer := `[{"tag_name": "v9.9.9", "prerelease": false}]`
	same := fmt.Sprintf(`[{"tag_name": "v%s", "prerelease": false}]`, Version)

	tests := []struct {
		name     string
		releases string
		args     []string
		want     string
	}{
		{"check reports a newer release", newer, []string{"self", "upgrade", "--check"}, "New version available"},
		{"check reports an up to date build", same, []string{"self", "upgrade", "--check"}, "up to date"},
		{"dry-run only announces a newer release", newer, []string{"self", "upgrade", "--dry-run"}, "[dry-run]"},
		{"dry-run on an up to date build", same, []string{"self", "upgrade", "--dry-run"}, "[dry-run]"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, _ := newReleaseListServer(t, http.StatusOK, tt.releases)
			t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

			out, err := runCommand(tt.args...)
			if err != nil {
				t.Fatalf("%v: %v\n%s", tt.args, err, out.Combined)
			}
			if !strings.Contains(out.Combined, tt.want) {
				t.Errorf("%v: expected %q in output, got:\n%s", tt.args, tt.want, out.Combined)
			}
		})
	}
}

func TestUpgradeCommand_UpgradeSuccess(t *testing.T) {
	binName := "dotfiles"
	if runtime.GOOS == "windows" {
		binName = "dotfiles.exe"
	}
	binData := createTestTarGz(t, map[string]string{binName: "#!/bin/sh\necho updated"})
	sum := sha256.Sum256(binData)
	sumHex := hex.EncodeToString(sum[:])

	goos := runtime.GOOS
	goarch := runtime.GOARCH
	tarName := fmt.Sprintf("dotfiles_9.9.9_%s_%s.tar.gz", goos, goarch)

	mux := http.NewServeMux()
	var serverURL string

	mux.HandleFunc("/download/"+tarName, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(binData)
	})

	mux.HandleFunc("/download/checksums.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintf(w, "%s  %s\n", sumHex, tarName)
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "releases") {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `[
				{
					"tag_name": "v9.9.9",
					"prerelease": false,
					"assets": [
						{"name": "%s", "browser_download_url": "%s/download/%s"},
						{"name": "checksums.txt", "browser_download_url": "%s/download/checksums.txt"}
					]
				}
			]`, tarName, serverURL, tarName, serverURL)
			return
		}
		mux.ServeHTTP(w, r)
	}))
	serverURL = server.URL
	defer server.Close()

	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	out, err := runCommand("self", "upgrade", "9.9.9", "--force", "--dry-run")
	if err != nil {
		t.Fatalf("upgrade execution error: %v\n%s", err, out.Combined)
	}
	if !strings.Contains(out.Combined, "Would upgrade dotfiles") {
		t.Errorf("expected 'Would upgrade dotfiles' in output, got: %s", out.Combined)
	}
}

func TestUpgradeCommand_MockServerPortFallback(t *testing.T) {
	_, port := newReleaseListServer(t, http.StatusOK, fmt.Sprintf(`[{"tag_name": "v%s", "prerelease": false}]`, Version))
	t.Setenv("DOTFILES_GITHUB_HOST", "")
	t.Setenv("MOCK_SERVER_PORT", port)

	out, err := runCommand("self", "upgrade", "--check")
	if err != nil {
		t.Fatalf("upgrade --check: %v\n%s", err, out.Combined)
	}
	if out.Stdout != fmt.Sprintf("dotfiles is up to date (%s)\n", Version) {
		t.Fatalf("stdout = %q, want the up-to-date line", out.Stdout)
	}
}

func TestUpgradeCommand_CheckFailure(t *testing.T) {
	server, _ := newReleaseListServer(t, http.StatusInternalServerError, `{"message": "boom"}`)
	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	_, err := runCommand("self", "upgrade", "--check")
	if err == nil || !strings.Contains(err.Error(), "checking for update:") {
		t.Fatalf("error = %v, want the update check failure", err)
	}
}

func TestUpgradeCommand_AlreadyUpToDate(t *testing.T) {
	server, _ := newReleaseListServer(t, http.StatusOK, fmt.Sprintf(`[{"tag_name": "v%s", "prerelease": false}]`, Version))
	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	out, err := runCommand("self", "upgrade")
	if err != nil {
		t.Fatalf("upgrade: %v\n%s", err, out.Combined)
	}
	if out.Stdout != fmt.Sprintf("dotfiles is already up to date (%s)\n", Version) {
		t.Fatalf("stdout = %q, want the already-up-to-date line", out.Stdout)
	}
}

func TestUpgradeCommand_AheadOfLatest(t *testing.T) {
	origVersion := Version
	Version = "2.7.0"
	t.Cleanup(func() { Version = origVersion })

	older := `[{"tag_name": "v2.6.0", "prerelease": false}]`
	server, _ := newReleaseListServer(t, http.StatusOK, older)
	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	t.Run("check reports ahead of latest", func(t *testing.T) {
		out, err := runCommand("self", "upgrade", "--check")
		if err != nil {
			t.Fatalf("unexpected error: %v\n%s", err, out.Combined)
		}
		want := "dotfiles (2.7.0) is ahead of the latest known version (2.6.0)\n"
		if out.Stdout != want {
			t.Errorf("stdout = %q, want %q", out.Stdout, want)
		}
		if !strings.Contains(out.Combined, "2.7.0 is ahead of the latest known version (2.6.0)") {
			t.Errorf("expected ahead message in combined output, got: %s", out.Combined)
		}
	})

	t.Run("upgrade without force reports ahead of latest", func(t *testing.T) {
		out, err := runCommand("self", "upgrade")
		if err != nil {
			t.Fatalf("unexpected error: %v\n%s", err, out.Combined)
		}
		want := "dotfiles (2.7.0) is ahead of the latest known version (2.6.0)\n"
		if out.Stdout != want {
			t.Errorf("stdout = %q, want %q", out.Stdout, want)
		}
	})

	t.Run("dry-run reports ahead of latest", func(t *testing.T) {
		out, err := runCommand("self", "upgrade", "--dry-run")
		if err != nil {
			t.Fatalf("unexpected error: %v\n%s", err, out.Combined)
		}
		want := "[dry-run] dotfiles (2.7.0) is ahead of the latest known version (2.6.0)\n"
		if out.Stdout != want {
			t.Errorf("stdout = %q, want %q", out.Stdout, want)
		}
	})

	t.Run("upgrade with force refuses downgrade when current release not found", func(t *testing.T) {
		out, err := runCommand("self", "upgrade", "--force")
		if err == nil {
			t.Fatalf("expected error on --force downgrade, got success: %s", out.Combined)
		}
		wantErr := "dotfiles (2.7.0) is ahead of the latest known version (2.6.0); moving to an older release requires dotfiles self upgrade <version>"
		if !strings.Contains(err.Error(), wantErr) {
			t.Errorf("error = %v, want to contain %q", err, wantErr)
		}
	})

	t.Run("explicit target version allows downgrade", func(t *testing.T) {
		binName := "dotfiles"
		if runtime.GOOS == "windows" {
			binName = "dotfiles.exe"
		}
		binData := createTestTarGz(t, map[string]string{binName: "#!/bin/sh\necho 2.6.0"})
		sum := sha256.Sum256(binData)
		sumHex := hex.EncodeToString(sum[:])

		goos := runtime.GOOS
		goarch := runtime.GOARCH
		tarName := fmt.Sprintf("dotfiles_2.6.0_%s_%s.tar.gz", goos, goarch)

		mux := http.NewServeMux()
		var serverURL string

		mux.HandleFunc("/download/"+tarName, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/gzip")
			_, _ = w.Write(binData)
		})
		mux.HandleFunc("/download/checksums.txt", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprintf(w, "%s  %s\n", sumHex, tarName)
		})

		customServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.Path, "releases") {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `[
					{
						"tag_name": "v2.6.0",
						"prerelease": false,
						"assets": [
							{"name": "%s", "browser_download_url": "%s/download/%s"},
							{"name": "checksums.txt", "browser_download_url": "%s/download/checksums.txt"}
						]
					}
				]`, tarName, serverURL, tarName, serverURL)
				return
			}
			mux.ServeHTTP(w, r)
		}))
		serverURL = customServer.URL
		defer customServer.Close()

		t.Setenv("DOTFILES_GITHUB_HOST", customServer.URL)

		out, err := runCommand("self", "upgrade", "2.6.0", "--dry-run")
		if err != nil {
			t.Fatalf("unexpected error: %v\n%s", err, out.Combined)
		}
		if !strings.Contains(out.Combined, "Would upgrade dotfiles: 2.7.0 -> 2.6.0") {
			t.Errorf("expected 'Would upgrade dotfiles: 2.7.0 -> 2.6.0' in output, got: %s", out.Combined)
		}
	})
}
