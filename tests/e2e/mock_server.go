package e2e

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type MockServer struct {
	Server      *httptest.Server
	FixtureDir  string
	ProjectRoot string
	versions    map[string]string
	versionsMu  sync.Mutex
}

func NewMockServer(t *testing.T, fixtureDir string) *MockServer {
	t.Helper()
	ms := &MockServer{
		versions: make(map[string]string),
	}

	// Find project root
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get current working directory: %v", err)
	}
	for dir != "/" && dir != "." {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			ms.ProjectRoot = dir
			break
		}
		dir = filepath.Dir(dir)
	}
	if ms.ProjectRoot == "" {
		t.Fatalf("failed to find project root")
	}

	ms.FixtureDir = filepath.Join(ms.ProjectRoot, "packages", "e2e-test", "src", "__tests__", "fixtures", fixtureDir)

	// Set default versions
	ms.versions["repo/github-release-tool"] = "1.0.0"
	ms.versions["repo/gitea-release-tool"] = "1.0.0"
	ms.versions["repo/hook-test-tool"] = "1.0.0"
	ms.versions["repo/install-by-binary-tool"] = "1.0.0"

	mux := http.NewServeMux()

	// 1. Reset versions endpoint
	mux.HandleFunc("/reset-versions", func(w http.ResponseWriter, r *http.Request) {
		ms.versionsMu.Lock()
		ms.versions["repo/github-release-tool"] = "1.0.0"
		ms.versions["repo/gitea-release-tool"] = "1.0.0"
		ms.versions["repo/hook-test-tool"] = "1.0.0"
		ms.versions["repo/install-by-binary-tool"] = "1.0.0"
		ms.versionsMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"success":true}`)
	})

	// 2. Set tool version endpoint
	mux.HandleFunc("/set-tool-version/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) >= 5 {
			org := parts[2]
			repo := parts[3]
			version := parts[4]
			fullRepo := org + "/" + repo
			ms.versionsMu.Lock()
			ms.versions[fullRepo] = version
			ms.versionsMu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"success":true,"repo":%q,"version":%q}`, fullRepo, version)
			return
		}
		http.Error(w, "invalid path", http.StatusBadRequest)
	})

	// 3. GitHub API: /repos/:org/:repo/releases/latest
	mux.HandleFunc("/repos/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/releases/latest") {
			parts := strings.Split(path, "/")
			if len(parts) >= 5 {
				org := parts[2]
				repo := parts[3]
				fullRepo := org + "/" + repo
				ms.versionsMu.Lock()
				version := ms.versions[fullRepo]
				ms.versionsMu.Unlock()
				if version == "" {
					version = "1.0.0"
				}
				ms.serveGitHubRelease(w, r, fullRepo, version)
				return
			}
		} else if strings.Contains(path, "/releases/tags/") {
			parts := strings.Split(path, "/")
			if len(parts) >= 7 {
				org := parts[2]
				repo := parts[3]
				tag := parts[6]
				fullRepo := org + "/" + repo
				ms.serveGitHubRelease(w, r, fullRepo, tag)
				return
			}
		}
		http.Error(w, "Not Found", http.StatusNotFound)
	})

	// 4. Catch-all for files/downloads, Gitea, Cargo, static configs
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Gitea API
		if strings.HasPrefix(path, "/api/v1/repos/") {
			if strings.HasSuffix(path, "/releases/latest") {
				parts := strings.Split(path, "/")
				if len(parts) >= 7 {
					owner := parts[4]
					repo := parts[5]
					fullRepo := owner + "/" + repo
					ms.versionsMu.Lock()
					version := ms.versions[fullRepo]
					ms.versionsMu.Unlock()
					if version == "" {
						version = "1.0.0"
					}
					ms.serveGiteaRelease(w, r, fullRepo, version)
					return
				}
			} else if strings.Contains(path, "/releases/tags/") {
				parts := strings.Split(path, "/")
				if len(parts) >= 9 {
					owner := parts[4]
					repo := parts[5]
					tag := parts[8]
					fullRepo := owner + "/" + repo
					ms.serveGiteaRelease(w, r, fullRepo, tag)
					return
				}
			}
		}

		// Gitea attachment download
		if strings.HasPrefix(path, "/attachments/") {
			uuid := strings.TrimPrefix(path, "/attachments/")
			ms.serveGiteaAttachment(w, r, uuid)
			return
		}

		// Cargo API
		if strings.HasPrefix(path, "/api/v1/crates/") {
			crateName := strings.TrimPrefix(path, "/api/v1/crates/")
			ms.serveCargoCrate(w, r, crateName)
			return
		}

		// Cargo Cargo.toml fetch
		if strings.HasSuffix(path, "/Cargo.toml") {
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprintln(w, `[package]
name = "cargo-quickinstall-tool"
version = "1.0.0"`)
			return
		}

		// Cargo quickinstall binary download
		if strings.HasPrefix(path, "/cargo-bins/cargo-quickinstall/releases/download/") {
			parts := strings.Split(path, "/")
			if len(parts) >= 7 {
				filename := parts[len(parts)-1]
				ms.serveCargoQuickinstall(w, r, filename)
				return
			}
		}

		// GitHub binary download
		if strings.Contains(path, "/releases/download/") {
			parts := strings.Split(path, "/")
			if len(parts) >= 6 {
				org := parts[1]
				repo := parts[2]
				version := parts[5]
				filename := parts[6]
				fullRepo := org + "/" + repo
				ms.serveGitHubDownload(w, r, fullRepo, version, filename)
				return
			}
		}

		// Static mock script mappings
		var matchedFile string
		if path == "/mock-install.sh" {
			matchedFile = filepath.Join(ms.FixtureDir, "tools", "version-detection--curl-script--with-args", "mock-install.sh")
		} else if path == "/mock-install-version-detection-curl-script-no-version.sh" {
			matchedFile = filepath.Join(ms.FixtureDir, "tools", "version-detection--curl-script--no-version", "mock-install-version-detection-curl-script-no-version.sh")
		} else if path == "/mock-install-version-detection-curl-tar-default-args.tar.gz" {
			matchedFile = filepath.Join(ms.FixtureDir, "tools", "version-detection--curl-tar--default-args", "mock-install-version-detection-curl-tar-default-args.tar.gz")
		} else if path == "/mock-install-for-cmd-completion-test.sh" {
			matchedFile = filepath.Join(ms.FixtureDir, "tools", "curl-script--cmd-completion-test", "mock-install-for-cmd-completion-test.sh")
		} else {
			// Walk and search fallback
			filename := filepath.Base(path)
			_ = filepath.Walk(ms.FixtureDir, func(p string, info os.FileInfo, err error) error {
				if err == nil && !info.IsDir() && info.Name() == filename {
					matchedFile = p
					return filepath.SkipAll
				}
				return nil
			})
		}

		if matchedFile != "" {
			if _, err := os.Stat(matchedFile); err == nil {
				data, err := os.ReadFile(matchedFile)
				if err == nil {
					if strings.HasSuffix(matchedFile, ".sh") {
						w.Header().Set("Content-Type", "application/x-sh")
					} else {
						w.Header().Set("Content-Type", "application/gzip")
					}
					w.Write(data)
					return
				}
			}
		}

		http.Error(w, "Not Found: "+path, http.StatusNotFound)
	})

	ms.Server = httptest.NewServer(mux)
	return ms
}

func (ms *MockServer) serveGitHubRelease(w http.ResponseWriter, r *http.Request, repo, version string) {
	toolName := filepath.Base(repo)
	assetNameMac := fmt.Sprintf("%s-%s-macos_arm64.tar.gz", toolName, version)
	assetNameLinux := fmt.Sprintf("%s-%s-linux_amd64.tar.gz", toolName, version)

	assets := []map[string]any{
		{
			"name":                 assetNameMac,
			"browser_download_url": fmt.Sprintf("%s/%s/releases/download/%s/%s", ms.Server.URL, repo, version, assetNameMac),
		},
		{
			"name":                 assetNameLinux,
			"browser_download_url": fmt.Sprintf("%s/%s/releases/download/%s/%s", ms.Server.URL, repo, version, assetNameLinux),
		},
	}

	res := map[string]any{
		"tag_name": version,
		"assets":   assets,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (ms *MockServer) serveGitHubDownload(w http.ResponseWriter, r *http.Request, repo, version, filename string) {
	toolName := filepath.Base(repo)
	filePath := filepath.Join(ms.FixtureDir, "tools", toolName, filename)

	if _, err := os.Stat(filePath); err != nil {
		_ = filepath.Walk(ms.FixtureDir, func(p string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() && info.Name() == filename {
				filePath = p
				return filepath.SkipAll
			}
			return nil
		})
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "File Not Found: "+filename, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Write(data)
}

func (ms *MockServer) serveGiteaRelease(w http.ResponseWriter, r *http.Request, repo, version string) {
	toolName := filepath.Base(repo)
	uuidMac := fmt.Sprintf("%s-%s-1", strings.ReplaceAll(repo, "/", "-"), version)
	uuidLinux := fmt.Sprintf("%s-%s-2", strings.ReplaceAll(repo, "/", "-"), version)

	assets := []map[string]any{
		{
			"id":                   1,
			"name":                 fmt.Sprintf("%s-%s-macos_arm64.tar.gz", toolName, version),
			"size":                 1024,
			"uuid":                 uuidMac,
			"browser_download_url": fmt.Sprintf("%s/attachments/%s", ms.Server.URL, uuidMac),
			"type":                 "application/gzip",
		},
		{
			"id":                   2,
			"name":                 fmt.Sprintf("%s-%s-linux_amd64.tar.gz", toolName, version),
			"size":                 1024,
			"uuid":                 uuidLinux,
			"browser_download_url": fmt.Sprintf("%s/attachments/%s", ms.Server.URL, uuidLinux),
			"type":                 "application/gzip",
		},
	}

	res := map[string]any{
		"id":          1,
		"tag_name":    version,
		"name":        "Release " + version,
		"assets":      assets,
		"tarball_url": fmt.Sprintf("%s/%s/archive/%s.tar.gz", ms.Server.URL, repo, version),
		"zipball_url": fmt.Sprintf("%s/%s/archive/%s.zip", ms.Server.URL, repo, version),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (ms *MockServer) serveGiteaAttachment(w http.ResponseWriter, r *http.Request, uuid string) {
	version := "1.0.0"
	if strings.Contains(uuid, "-2.0.0-") {
		version = "2.0.0"
	}
	var filename string
	if strings.HasSuffix(uuid, "-1") {
		filename = fmt.Sprintf("gitea-release-tool-%s-macos_arm64.tar.gz", version)
	} else {
		filename = fmt.Sprintf("gitea-release-tool-%s-linux_amd64.tar.gz", version)
	}

	filePath := filepath.Join(ms.FixtureDir, "tools", "gitea-release-tool", filename)
	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Attachment File Not Found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Write(data)
}

func (ms *MockServer) serveCargoCrate(w http.ResponseWriter, r *http.Request, crateName string) {
	if crateName != "cargo-quickinstall-tool" {
		http.Error(w, `{"errors":[{"detail":"Not Found"}]}`, http.StatusNotFound)
		return
	}

	res := map[string]any{
		"crate": map[string]any{"name": crateName},
		"versions": []map[string]any{
			{
				"num":     "1.0.0",
				"dl_path": "/api/v1/crates/cargo-quickinstall-tool/1.0.0/download",
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (ms *MockServer) serveCargoQuickinstall(w http.ResponseWriter, r *http.Request, filename string) {
	var fixtureName string
	if strings.Contains(filename, "apple-darwin") {
		fixtureName = "cargo-quickinstall-tool-1.0.0-aarch64-apple-darwin.tar.gz"
	} else {
		fixtureName = "cargo-quickinstall-tool-1.0.0-x86_64-unknown-linux-musl.tar.gz"
	}

	filePath := filepath.Join(ms.FixtureDir, "tools", "cargo-quickinstall-tool", fixtureName)
	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Cargo download not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Write(data)
}

func (ms *MockServer) Close() {
	if ms.Server != nil {
		ms.Server.Close()
	}
}
