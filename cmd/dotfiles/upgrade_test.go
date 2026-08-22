package main

import (
	"archive/tar"
	"bytes"
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

func resetCmdFlags() {
	_ = upgradeCmd.Flags().Set("check", "false")
	_ = upgradeCmd.Flags().Set("force", "false")
	_ = upgradeCmd.Flags().Set("prerelease", "false")
}

func createCmdTestTarGz(t *testing.T, binContent string) []byte {
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

func TestUpgradeCommand_Check(t *testing.T) {
	resetCmdFlags()
	defer resetCmdFlags()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `[{"tag_name": "v9.9.9", "prerelease": false}]`)
	}))
	defer server.Close()

	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetErr(&buf)
	rootCmd.SetArgs([]string{"upgrade", "--check"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("upgrade --check execution error: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "New version available") {
		t.Errorf("expected 'New version available' in output, got: %s", out)
	}
}

func TestUpgradeCommand_Check_UpToDate(t *testing.T) {
	resetCmdFlags()
	defer resetCmdFlags()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `[{"tag_name": "v%s", "prerelease": false}]`, Version)
	}))
	defer server.Close()

	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetErr(&buf)
	rootCmd.SetArgs([]string{"upgrade", "--check"})

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("upgrade --check execution error: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "up to date") {
		t.Errorf("expected 'up to date' in output, got: %s", out)
	}
}

func TestUpgradeCommand_DryRun(t *testing.T) {
	resetCmdFlags()
	defer resetCmdFlags()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `[{"tag_name": "v9.9.9", "prerelease": false}]`)
	}))
	defer server.Close()

	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetErr(&buf)
	rootCmd.SetArgs([]string{"upgrade", "--dry-run"})

	oldDryRun := dryRun
	dryRun = true
	defer func() { dryRun = oldDryRun }()

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("upgrade --dry-run execution error: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "[dry-run]") {
		t.Errorf("expected '[dry-run]' in output, got: %s", out)
	}
}

func TestUpgradeCommand_DryRun_UpToDate(t *testing.T) {
	resetCmdFlags()
	defer resetCmdFlags()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `[{"tag_name": "v%s", "prerelease": false}]`, Version)
	}))
	defer server.Close()

	t.Setenv("DOTFILES_GITHUB_HOST", server.URL)

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetErr(&buf)
	rootCmd.SetArgs([]string{"upgrade", "--dry-run"})

	oldDryRun := dryRun
	dryRun = true
	defer func() { dryRun = oldDryRun }()

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("upgrade --dry-run execution error: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "[dry-run]") {
		t.Errorf("expected '[dry-run]' in output, got: %s", out)
	}
}

func TestUpgradeCommand_UpgradeSuccess(t *testing.T) {
	resetCmdFlags()
	defer resetCmdFlags()

	binData := createCmdTestTarGz(t, "#!/bin/sh\necho updated")
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

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetErr(&buf)
	rootCmd.SetArgs([]string{"upgrade", "9.9.9", "--force", "--dry-run"})

	oldDryRun := dryRun
	dryRun = true
	defer func() { dryRun = oldDryRun }()

	err := rootCmd.Execute()
	if err != nil {
		t.Fatalf("upgrade execution error: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "Would upgrade dotfiles") {
		t.Errorf("expected 'Would upgrade dotfiles' in output, got: %s", out)
	}
}
