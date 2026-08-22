package e2e

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func createE2ETarGz(t *testing.T, binContent string) []byte {
	t.Helper()
	tmpDir := t.TempDir()
	tarPath := filepath.Join(tmpDir, "test.tar.gz")

	f, err := os.Create(tarPath)
	if err != nil {
		t.Fatalf("creating temp tar.gz: %v", err)
	}

	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)

	binName := "dotfiles"
	if runtime.GOOS == "windows" {
		binName = "dotfiles.exe"
	}

	hdr := &tar.Header{
		Name: binName,
		Mode: 0755,
		Size: int64(len(binContent)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("writing tar header: %v", err)
	}
	if _, err := tw.Write([]byte(binContent)); err != nil {
		t.Fatalf("writing tar body: %v", err)
	}

	_ = tw.Close()
	_ = gw.Close()
	_ = f.Close()

	data, err := os.ReadFile(tarPath)
	if err != nil {
		t.Fatalf("reading tar.gz data: %v", err)
	}
	return data
}

func TestE2EUpgrade(t *testing.T) {
	t.Parallel()

	binData := createE2ETarGz(t, "#!/bin/sh\necho updated")
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

	h := NewTestHarness(t, HarnessOptions{
		ConfigContent: `export default { paths: { generatedDir: "./.generated" } };`,
		Env: map[string]string{
			"DOTFILES_GITHUB_HOST": server.URL,
		},
	})

	t.Run("should report new version available on --check", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.RunCommand("upgrade", "--check")
		if err != nil || exitCode != 0 {
			t.Fatalf("upgrade --check failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		if !strings.Contains(stdout, "New version available") && !strings.Contains(stderr, "New version available") {
			t.Errorf("expected 'New version available' in output, got:\nstdout: %s\nstderr: %s", stdout, stderr)
		}
	})

	t.Run("should perform dry-run upgrade without error", func(t *testing.T) {
		stdout, stderr, exitCode, err := h.RunCommand("upgrade", "--dry-run")
		if err != nil || exitCode != 0 {
			t.Fatalf("upgrade --dry-run failed: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
		}

		if !strings.Contains(stdout, "[dry-run]") && !strings.Contains(stderr, "[dry-run]") {
			t.Errorf("expected '[dry-run]' in output, got:\nstdout: %s\nstderr: %s", stdout, stderr)
		}
	})
}
