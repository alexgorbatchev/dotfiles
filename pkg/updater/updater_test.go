package updater_test

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/updater"
)

func createTestTarGzWithFile(t *testing.T, filename, content string) []byte {
	t.Helper()
	tmpDir := t.TempDir()
	tarPath := filepath.Join(tmpDir, "test.tar.gz")

	f, err := os.Create(tarPath)
	if err != nil {
		t.Fatalf("creating temp tar.gz: %v", err)
	}

	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)

	hdr := &tar.Header{
		Name: filename,
		Mode: 0755,
		Size: int64(len(content)),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatalf("writing tar header: %v", err)
	}
	if _, err := tw.Write([]byte(content)); err != nil {
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

func createTestTarGz(t *testing.T, binContent string) []byte {
	t.Helper()
	binName := "dotfiles"
	if runtime.GOOS == "windows" {
		binName = "dotfiles.exe"
	}
	return createTestTarGzWithFile(t, binName, binContent)
}

func TestCheckForUpdate(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/repos/alexgorbatchev/dotfiles/releases", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `[
			{
				"tag_name": "v2.1.0-beta.1",
				"prerelease": true,
				"published_at": "2026-08-20T10:00:00Z",
				"assets": []
			},
			{
				"tag_name": "v2.0.1",
				"prerelease": false,
				"published_at": "2026-08-15T10:00:00Z",
				"assets": [
					{
						"name": "checksums.txt",
						"browser_download_url": "http://example.com/checksums.txt"
					}
				]
			},
			{
				"tag_name": "v2.0.0",
				"prerelease": false,
				"published_at": "2026-08-01T10:00:00Z",
				"assets": []
			}
		]`)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	u := updater.New(updater.Config{
		BaseURL: server.URL,
	})

	ctx := context.Background()

	t.Run("newer stable release available", func(t *testing.T) {
		res, err := u.CheckForUpdate(ctx, updater.Options{
			CurrentVersion: "2.0.0",
		})
		if err != nil {
			t.Fatalf("CheckForUpdate error: %v", err)
		}
		if !res.HasUpdate {
			t.Errorf("expected HasUpdate = true")
		}
		if res.LatestVersion != "2.0.1" {
			t.Errorf("expected LatestVersion = 2.0.1, got %q", res.LatestVersion)
		}
	})

	t.Run("up to date", func(t *testing.T) {
		res, err := u.CheckForUpdate(ctx, updater.Options{
			CurrentVersion: "2.0.1",
		})
		if err != nil {
			t.Fatalf("CheckForUpdate error: %v", err)
		}
		if res.HasUpdate {
			t.Errorf("expected HasUpdate = false")
		}
	})

	t.Run("prerelease allowed", func(t *testing.T) {
		res, err := u.CheckForUpdate(ctx, updater.Options{
			CurrentVersion:  "2.0.1",
			AllowPrerelease: true,
		})
		if err != nil {
			t.Fatalf("CheckForUpdate error: %v", err)
		}
		if !res.HasUpdate {
			t.Errorf("expected HasUpdate = true for prerelease")
		}
		if res.LatestVersion != "2.1.0-beta.1" {
			t.Errorf("expected LatestVersion = 2.1.0-beta.1, got %q", res.LatestVersion)
		}
	})

	t.Run("target version specified", func(t *testing.T) {
		res, err := u.CheckForUpdate(ctx, updater.Options{
			CurrentVersion: "1.0.0",
			TargetVersion:  "2.0.0",
		})
		if err != nil {
			t.Fatalf("CheckForUpdate error: %v", err)
		}
		if !res.HasUpdate {
			t.Errorf("expected HasUpdate = true")
		}
		if res.LatestVersion != "2.0.0" {
			t.Errorf("expected LatestVersion = 2.0.0, got %q", res.LatestVersion)
		}
	})
}

func TestCheckForUpdate_Errors(t *testing.T) {
	ctx := context.Background()

	t.Run("invalid url error", func(t *testing.T) {
		u := updater.New(updater.Config{BaseURL: "http://invalid url with spaces"})
		_, err := u.CheckForUpdate(ctx, updater.Options{CurrentVersion: "1.0.0"})
		if err == nil {
			t.Errorf("expected error on invalid request URL")
		}
	})

	t.Run("http non-200 error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, "internal server error")
		}))
		defer server.Close()

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.CheckForUpdate(ctx, updater.Options{CurrentVersion: "1.0.0"})
		if err == nil {
			t.Errorf("expected error on HTTP 500")
		}
	})

	t.Run("invalid json response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `invalid json`)
		}))
		defer server.Close()

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.CheckForUpdate(ctx, updater.Options{CurrentVersion: "1.0.0"})
		if err == nil {
			t.Errorf("expected error on invalid JSON")
		}
	})

	t.Run("no releases found", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `[]`)
		}))
		defer server.Close()

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.CheckForUpdate(ctx, updater.Options{CurrentVersion: "1.0.0"})
		if err == nil {
			t.Errorf("expected error when no releases exist")
		}
	})

	t.Run("target version not found", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `[{"tag_name": "v1.0.0"}]`)
		}))
		defer server.Close()

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.CheckForUpdate(ctx, updater.Options{
			CurrentVersion: "1.0.0",
			TargetVersion:  "9.9.9",
		})
		if err == nil {
			t.Errorf("expected error when target version does not exist")
		}
	})

	t.Run("only prereleases when not allowed", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `[{"tag_name": "v2.0.0-beta.1", "prerelease": true}]`)
		}))
		defer server.Close()

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.CheckForUpdate(ctx, updater.Options{
			CurrentVersion:  "1.0.0",
			AllowPrerelease: false,
		})
		if err == nil {
			t.Errorf("expected error when only prereleases exist and not allowed")
		}
	})
}

func TestUpgrade(t *testing.T) {
	binContent := "#!/bin/sh\necho v2.0.1"
	tarData := createTestTarGz(t, binContent)

	sum := sha256.Sum256(tarData)
	sumHex := hex.EncodeToString(sum[:])

	goos := runtime.GOOS
	goarch := runtime.GOARCH
	tarName := fmt.Sprintf("dotfiles_2.0.1_%s_%s.tar.gz", goos, goarch)
	checksumsContent := fmt.Sprintf("%s  %s\n", sumHex, tarName)

	mux := http.NewServeMux()

	var serverURL string

	mux.HandleFunc("/download/"+tarName, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(tarData)
	})

	mux.HandleFunc("/download/checksums.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, checksumsContent)
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/alexgorbatchev/dotfiles/releases" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `[
				{
					"tag_name": "v2.0.1",
					"prerelease": false,
					"published_at": "2026-08-15T10:00:00Z",
					"assets": [
						{
							"name": "%s",
							"browser_download_url": "%s/download/%s"
						},
						{
							"name": "checksums.txt",
							"browser_download_url": "%s/download/checksums.txt"
						}
					]
				}
			]`, tarName, serverURL, tarName, serverURL)
			return
		}
		mux.ServeHTTP(w, r)
	}))
	serverURL = server.URL
	defer server.Close()

	tmpDir := t.TempDir()
	targetBin := filepath.Join(tmpDir, "dotfiles")
	if runtime.GOOS == "windows" {
		targetBin = filepath.Join(tmpDir, "dotfiles.exe")
	}

	// Write initial dummy binary
	if err := os.WriteFile(targetBin, []byte("#!/bin/sh\necho v2.0.0"), 0755); err != nil {
		t.Fatalf("writing initial target binary: %v", err)
	}

	u := updater.New(updater.Config{
		BaseURL: server.URL,
	})

	ctx := context.Background()

	t.Run("dry run upgrade", func(t *testing.T) {
		res, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       targetBin,
			DryRun:         true,
		})
		if err != nil {
			t.Fatalf("Upgrade dry-run error: %v", err)
		}
		if !res.HasUpdate {
			t.Errorf("expected HasUpdate = true")
		}
		if res.Updated {
			t.Errorf("expected Updated = false for dry run")
		}

		// Verify binary on disk was NOT changed
		content, _ := os.ReadFile(targetBin)
		if string(content) != "#!/bin/sh\necho v2.0.0" {
			t.Errorf("binary was changed during dry run")
		}
	})

	t.Run("successful upgrade", func(t *testing.T) {
		res, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       targetBin,
		})
		if err != nil {
			t.Fatalf("Upgrade error: %v", err)
		}
		if !res.HasUpdate {
			t.Errorf("expected HasUpdate = true")
		}
		if !res.Updated {
			t.Errorf("expected Updated = true")
		}

		// Verify binary content on disk was updated
		content, err := os.ReadFile(targetBin)
		if err != nil {
			t.Fatalf("reading updated target binary: %v", err)
		}
		if string(content) != binContent {
			t.Errorf("expected binary content %q, got %q", binContent, string(content))
		}
	})

	t.Run("successful upgrade with default ExecPath", func(t *testing.T) {
		// When ExecPath is empty, u.Upgrade resolves os.Executable()
		res, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			DryRun:         true,
		})
		if err != nil {
			t.Fatalf("Upgrade with empty ExecPath error: %v", err)
		}
		if res.ExecutablePath == "" {
			t.Errorf("expected non-empty ExecutablePath")
		}
	})

	t.Run("already up to date without force", func(t *testing.T) {
		res, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.1",
			ExecPath:       targetBin,
		})
		if err != nil {
			t.Fatalf("Upgrade error: %v", err)
		}
		if res.HasUpdate {
			t.Errorf("expected HasUpdate = false")
		}
		if res.Updated {
			t.Errorf("expected Updated = false")
		}
	})

	t.Run("already up to date with force", func(t *testing.T) {
		res, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.1",
			ExecPath:       targetBin,
			Force:          true,
		})
		if err != nil {
			t.Fatalf("Upgrade with force error: %v", err)
		}
		if !res.Updated {
			t.Errorf("expected Updated = true with force")
		}
	})
}

func TestUpgrade_Errors(t *testing.T) {
	ctx := context.Background()

	t.Run("matching platform asset not found in release", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `[
				{
					"tag_name": "v2.0.1",
					"assets": [
						{"name": "checksums.txt", "browser_download_url": "http://example.com/checksums.txt"}
					]
				}
			]`)
		}))
		defer server.Close()

		tmpDir := t.TempDir()
		execPath := filepath.Join(tmpDir, "dotfiles")
		_ = os.WriteFile(execPath, []byte("old"), 0755)

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       execPath,
		})
		if err == nil {
			t.Errorf("expected error when matching asset is missing")
		}
	})

	t.Run("checksums.txt download error", func(t *testing.T) {
		goos := runtime.GOOS
		goarch := runtime.GOARCH
		tarName := fmt.Sprintf("dotfiles_2.0.1_%s_%s.tar.gz", goos, goarch)

		var serverURL string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/repos/alexgorbatchev/dotfiles/releases" {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `[
					{
						"tag_name": "v2.0.1",
						"assets": [
							{"name": "%s", "browser_download_url": "%s/download/%s"},
							{"name": "checksums.txt", "browser_download_url": "%s/checksums-fail"}
						]
					}
				]`, tarName, serverURL, tarName, serverURL)
				return
			}
			if r.URL.Path == "/checksums-fail" {
				w.WriteHeader(http.StatusNotFound)
				return
			}
		}))
		serverURL = server.URL
		defer server.Close()

		tmpDir := t.TempDir()
		execPath := filepath.Join(tmpDir, "dotfiles")
		_ = os.WriteFile(execPath, []byte("old"), 0755)

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       execPath,
		})
		if err == nil {
			t.Errorf("expected error when checksums.txt download fails")
		}
	})

	t.Run("archive checksum mismatch during download", func(t *testing.T) {
		goos := runtime.GOOS
		goarch := runtime.GOARCH
		tarName := fmt.Sprintf("dotfiles_2.0.1_%s_%s.tar.gz", goos, goarch)

		var serverURL string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/repos/alexgorbatchev/dotfiles/releases" {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `[
					{
						"tag_name": "v2.0.1",
						"assets": [
							{"name": "%s", "browser_download_url": "%s/download/%s"},
							{"name": "checksums.txt", "browser_download_url": "%s/checksums.txt"}
						]
					}
				]`, tarName, serverURL, tarName, serverURL)
				return
			}
			if r.URL.Path == "/download/"+tarName {
				w.Header().Set("Content-Type", "application/gzip")
				_, _ = w.Write([]byte("not valid tar content"))
				return
			}
			if r.URL.Path == "/checksums.txt" {
				w.Header().Set("Content-Type", "text/plain")
				fmt.Fprintf(w, "0000000000000000000000000000000000000000000000000000000000000000  %s\n", tarName)
				return
			}
		}))
		serverURL = server.URL
		defer server.Close()

		tmpDir := t.TempDir()
		execPath := filepath.Join(tmpDir, "dotfiles")
		_ = os.WriteFile(execPath, []byte("old"), 0755)

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       execPath,
		})
		if err == nil {
			t.Errorf("expected error when archive checksum mismatch occurs")
		}
	})

	t.Run("asset not listed in checksums.txt", func(t *testing.T) {
		goos := runtime.GOOS
		goarch := runtime.GOARCH
		tarName := fmt.Sprintf("dotfiles_2.0.1_%s_%s.tar.gz", goos, goarch)

		var serverURL string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/repos/alexgorbatchev/dotfiles/releases" {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `[
					{
						"tag_name": "v2.0.1",
						"assets": [
							{"name": "%s", "browser_download_url": "%s/download/%s"},
							{"name": "checksums.txt", "browser_download_url": "%s/checksums.txt"}
						]
					}
				]`, tarName, serverURL, tarName, serverURL)
				return
			}
			if r.URL.Path == "/checksums.txt" {
				w.Header().Set("Content-Type", "text/plain")
				fmt.Fprint(w, "1234567890  other_file.tar.gz\n")
				return
			}
		}))
		serverURL = server.URL
		defer server.Close()

		tmpDir := t.TempDir()
		execPath := filepath.Join(tmpDir, "dotfiles")
		_ = os.WriteFile(execPath, []byte("old"), 0755)

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       execPath,
		})
		if err == nil {
			t.Errorf("expected error when asset is not found in checksums.txt")
		}
	})

	t.Run("binary missing in archive", func(t *testing.T) {
		otherTarData := createTestTarGzWithFile(t, "readme.txt", "hello")
		sum := sha256.Sum256(otherTarData)
		sumHex := hex.EncodeToString(sum[:])

		goos := runtime.GOOS
		goarch := runtime.GOARCH
		tarName := fmt.Sprintf("dotfiles_2.0.1_%s_%s.tar.gz", goos, goarch)

		var serverURL string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/repos/alexgorbatchev/dotfiles/releases" {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `[
					{
						"tag_name": "v2.0.1",
						"assets": [
							{"name": "%s", "browser_download_url": "%s/download/%s"},
							{"name": "checksums.txt", "browser_download_url": "%s/checksums.txt"}
						]
					}
				]`, tarName, serverURL, tarName, serverURL)
				return
			}
			if r.URL.Path == "/download/"+tarName {
				w.Header().Set("Content-Type", "application/gzip")
				_, _ = w.Write(otherTarData)
				return
			}
			if r.URL.Path == "/checksums.txt" {
				w.Header().Set("Content-Type", "text/plain")
				fmt.Fprintf(w, "%s  %s\n", sumHex, tarName)
				return
			}
		}))
		serverURL = server.URL
		defer server.Close()

		tmpDir := t.TempDir()
		execPath := filepath.Join(tmpDir, "dotfiles")
		_ = os.WriteFile(execPath, []byte("old"), 0755)

		u := updater.New(updater.Config{BaseURL: server.URL})
		_, err := u.Upgrade(ctx, updater.Options{
			CurrentVersion: "2.0.0",
			ExecPath:       execPath,
		})
		if err == nil {
			t.Errorf("expected error when binary is missing in tarball")
		}
	})
}

func TestExtractBinaryFromTarGz_Errors(t *testing.T) {
	tmpDir := t.TempDir()

	t.Run("non-existent tar file", func(t *testing.T) {
		_, err := updater.ExtractBinaryFromTarGz(filepath.Join(tmpDir, "missing.tar.gz"), tmpDir)
		if err == nil {
			t.Errorf("expected error for missing file")
		}
	})

	t.Run("corrupt gzip file", func(t *testing.T) {
		corruptPath := filepath.Join(tmpDir, "corrupt.tar.gz")
		_ = os.WriteFile(corruptPath, []byte("not a gzip"), 0644)
		_, err := updater.ExtractBinaryFromTarGz(corruptPath, tmpDir)
		if err == nil {
			t.Errorf("expected error for corrupt gzip")
		}
	})
}

func TestReplaceBinary_Errors(t *testing.T) {
	tmpDir := t.TempDir()

	t.Run("non-existent new binary source", func(t *testing.T) {
		err := updater.ReplaceBinary(filepath.Join(tmpDir, "nonexistent"), filepath.Join(tmpDir, "target"))
		if err == nil {
			t.Errorf("expected error for non-existent new binary")
		}
	})

	t.Run("non-existent target directory", func(t *testing.T) {
		srcPath := filepath.Join(tmpDir, "src")
		_ = os.WriteFile(srcPath, []byte("new"), 0755)
		err := updater.ReplaceBinary(srcPath, filepath.Join(tmpDir, "missingdir", "target"))
		if err == nil {
			t.Errorf("expected error when target directory does not exist")
		}
	})
}
