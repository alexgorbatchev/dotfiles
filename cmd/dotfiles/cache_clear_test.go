package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestCacheClearExistingDownloads(t *testing.T) {
	p := newE2EProject(t, tsTools{"tool": `install("github-release", {repo: "acme/tool"})`})
	p.seedInstallation(t, "tool", "v2", filepath.Join(p.Root, "installed"))
	cache := filepath.Join(p.GeneratedDir, "cache", "downloads")
	var removed, retained []string
	for _, legacy := range []bool{false, true} {
		for _, version := range []string{"v1", "v2"} {
			u := "https://github.com/acme/tool/releases/download/" + version + "/tool.tar.gz"
			content := []byte(fmt.Sprintf("archive %s legacy %t", version, legacy))
			hash := fmt.Sprintf("%x", sha256.Sum256(content))
			archive := filepath.Join(cache, hash)
			record := archive + ".json"
			metadata := map[string]any{"sha256": hash, "size": len(content), "url": u}
			if legacy {
				archive = filepath.Join(cache, "binaries", hash+".bin")
				key := fmt.Sprintf("%x", sha256.Sum256([]byte(u)))
				record = filepath.Join(cache, "metadata", key[:32]+".json")
				metadata = map[string]any{"type": "binary", "binaryFileName": hash + ".bin", "contentHash": hash, "size": len(content), "url": u}
			}
			for _, file := range []string{archive, record} {
				if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
					t.Fatal(err)
				}
			}
			data, err := json.Marshal(metadata)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(archive, content, 0644); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(record, data, 0644); err != nil {
				t.Fatal(err)
			}
			if version == "v1" {
				removed = append(removed, archive, record)
			} else {
				retained = append(retained, archive, record)
			}
		}
	}
	out, err := p.run("cache", "clear", "--prune-cache=false")
	if err != nil {
		t.Fatalf("clear: %v\n%s", err, out.Combined)
	}
	if !strings.Contains(out.Stderr, "Removed 2 old cached downloads") {
		t.Fatalf("cleanup summary: %s", out.Stderr)
	}
	for _, file := range removed {
		if _, err := os.Stat(file); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("stale download still exists: %s (%v)", file, err)
		}
	}
	for _, file := range retained {
		if _, err := os.Stat(file); err != nil {
			t.Fatalf("installed download removed: %s (%v)", file, err)
		}
	}
}

func TestCacheClearCommand(t *testing.T) {
	for _, dry := range []bool{false, true} {
		t.Run(fmt.Sprintf("dry run %t", dry), func(t *testing.T) {
			p := newE2EProject(t, nil)
			p.writeConfig(t, nil, "", `downloader: {pruneCache: false, cache: {enabled: false}}`)
			p.seedInstallation(t, "tool", "v2", filepath.Join(p.Root, "installed"))
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				fmt.Fprint(w, r.URL.Path)
			}))
			defer server.Close()
			d := downloader.NewDownloader(fs.NewOSFS(), nil)
			d.CacheDir = filepath.Join(p.GeneratedDir, "cache", "downloads")
			for _, version := range []string{"v1", "v2", "legacy"} {
				ctx, session := downloader.TrackCache(context.Background())
				if err := d.Download(ctx, server.URL+"/"+version, filepath.Join(p.Root, "download"), ""); err != nil {
					t.Fatal(err)
				}
				if version != "legacy" {
					if err := session.Commit(fs.NewOSFS(), "tool", version); err != nil {
						t.Fatal(err)
					}
				}
				session.Close()
			}
			out, err := p.run("cache", "clear", "--prune-cache=false", fmt.Sprintf("--dry-run=%t", dry))
			if err != nil {
				t.Fatalf("clear: %v\n%s", err, out.Combined)
			}
			if out.Stdout != "" {
				t.Fatalf("cache diagnostics on stdout: %q", out.Stdout)
			}
			if !dry && !strings.Contains(out.Stderr, "Removed 2 old cached downloads") {
				t.Fatalf("missing cleanup summary: %s", out.Stderr)
			}
			entries, err := os.ReadDir(d.CacheDir)
			if err != nil {
				t.Fatal(err)
			}
			urls := make(map[string]bool)
			for _, entry := range entries {
				if !strings.HasSuffix(entry.Name(), ".json") {
					continue
				}
				data, err := os.ReadFile(filepath.Join(d.CacheDir, entry.Name()))
				if err != nil {
					t.Fatal(err)
				}
				var record struct {
					URL string `json:"url"`
				}
				if err := json.Unmarshal(data, &record); err != nil {
					t.Fatal(err)
				}
				urls[record.URL] = true
			}
			if urls[server.URL+"/v1"] != dry || !urls[server.URL+"/v2"] || urls[server.URL+"/legacy"] != dry {
				t.Fatalf("retained URLs = %v", urls)
			}
		})
	}
	if _, err := runCommand("cache", "clear", "unexpected"); err == nil {
		t.Fatal("cache clear accepted a positional argument")
	}
}
