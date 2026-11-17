package installer

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/archive/archivetest"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func macAssetInstaller(t *testing.T, method, apiURL string) (Installer, *exec.MockRunner, fs.FS, *config.ToolConfig) {
	t.Helper()
	runner, fsys := exec.NewMockRunner(), fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	dl.CacheEnabled = false
	sys := &SystemContext{OS: "darwin", Arch: "arm64"}
	tool := &config.ToolConfig{Name: "app", InstallationMethod: method, Binaries: testutil.DeclaredBinaries("app"), InstallParams: map[string]interface{}{
		"source": map[string]interface{}{"type": "github-release", "repo": "owner/app"},
	}}
	if method == "dmg" {
		registerBundlePlutil(runner)
		inst := NewDmgInstaller(runner, fsys, dl, sys)
		inst.BaseURL, inst.BinDir = apiURL, "/staging"
		tool.InstallParams["appName"] = "App.app"
		archivetest.Hdiutil{FS: fsys, Volume: dmgVolumeFile(fsys, "App.app/Contents/MacOS/app", "app-bin")}.Register(runner)
		return inst, runner, fsys, tool
	}
	inst := NewPkgInstaller(runner, fsys, dl, sys)
	inst.BaseURL, inst.BinDir = apiURL, "/staging"
	tool.InstallParams["binaryPath"] = "/opt/app/bin/app"
	if err := fsys.MkdirAll("/opt/app/bin", 0755); err != nil {
		t.Fatal(err)
	}
	if err := fsys.WriteFile("/opt/app/bin/app", []byte("app-bin"), 0755); err != nil {
		t.Fatal(err)
	}
	return inst, runner, fsys, tool
}

func TestMacReleaseAssetIntegrity(t *testing.T) {
	for _, method := range []string{"dmg", "pkg"} {
		for _, gh := range []bool{false, true} {
			for _, check := range []string{"digest match", "digest mismatch", "size match", "size mismatch", "no metadata"} {
				t.Run(fmt.Sprintf("%s/gh=%t/%s", method, gh, check), func(t *testing.T) {
					payload := "gh-payload"
					asset := githubAsset{Name: "app-darwin-arm64." + method, Size: int64(len(payload))}
					switch check {
					case "digest match", "digest mismatch":
						digestPayload := payload
						if check == "digest mismatch" {
							digestPayload = "other payload"
						}
						digest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(digestPayload)))
						asset.Digest = &digest
					case "size mismatch":
						asset.Size++
					case "no metadata":
						asset.Size = 0
					}
					server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						if r.URL.Path == "/download" {
							_, _ = w.Write([]byte(payload))
							return
						}
						_ = json.NewEncoder(w).Encode(githubRelease{TagName: "v1.2.3", Assets: []githubAsset{asset}})
					}))
					defer server.Close()
					asset.BrowserDownloadURL = server.URL + "/download"
					inst, runner, fsys, tool := macAssetInstaller(t, method, server.URL)
					if gh {
						tool.InstallParams["source"].(map[string]interface{})["ghCli"] = true
						body, err := json.Marshal(githubRelease{TagName: "v1.2.3", Assets: []githubAsset{asset}})
						if err != nil {
							t.Fatal(err)
						}
						registerGhMock(runner, fsys, string(body))
					}
					res, err := inst.Install(context.Background(), tool)
					mismatch := strings.HasSuffix(check, "mismatch")
					if mismatch {
						if err == nil || !strings.Contains(err.Error(), "mismatch") {
							t.Fatalf("expected integrity failure, got result=%v error=%v", res, err)
						}
						if commandRan(runner, "hdiutil", "attach") || commandRan(runner, "installer", "") {
							t.Fatalf("unverified package reached installation: %v", runner.History)
						}
					} else if err != nil || res.Version != "v1.2.3" {
						t.Fatalf("expected verified release installation, got result=%v error=%v", res, err)
					}
					if exists, err := fsys.Exists("/staging/" + asset.Name); err != nil || exists {
						t.Fatalf("downloaded package was not cleaned up: exists=%t error=%v", exists, err)
					}
				})
			}
		}
	}
}
