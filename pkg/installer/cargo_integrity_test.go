package installer

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
)

func TestCargoGithubReleaseChecksum(t *testing.T) {
	archive, err := createTarGzBytes(map[string]string{"mycrate": "binary-payload"})
	if err != nil {
		t.Fatal(err)
	}
	for _, tag := range []string{"v1.2.3", "1.2.3"} {
		for _, valid := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/valid=%t", tag, valid), func(t *testing.T) {
				server := newRecordingServer(t, func(w http.ResponseWriter, r *http.Request) {
					if strings.Contains(r.URL.Path, "/releases/download/"+tag+"/") {
						_, _ = w.Write(archive)
						return
					}
					http.NotFound(w, r)
				})
				inst, fsys := newCargoGithubInstaller(server, exec.NewMockRunner())
				hash := fmt.Sprintf("%x", sha256.Sum256(archive))
				if !valid {
					hash = strings.Repeat("0", 64)
				}
				res, err := inst.tryGithubReleases(context.Background(), &config.ToolConfig{
					Name: "mycrate", InstallParams: map[string]interface{}{"sha256": hash},
				}, "mycrate", "owner/mycrate", cargoVersion{version: "1.2.3"})
				if valid {
					if err != nil || res.Version != "1.2.3" {
						t.Fatalf("expected verified prebuilt, got result=%v error=%v", res, err)
					}
					if exists, err := fsys.Exists("/test/bin/mycrate"); err != nil || !exists {
						t.Fatalf("verified binary was not installed: exists=%t error=%v", exists, err)
					}
				} else {
					if err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
						t.Fatalf("expected checksum mismatch, got %v", err)
					}
					if exists, err := fsys.Exists("/test/bin/mycrate"); err != nil || exists {
						t.Fatalf("unverified archive was extracted or installed: exists=%t error=%v", exists, err)
					}
					if tag == "v1.2.3" && server.requestedContaining("/download/1.2.3/") {
						t.Fatal("checksum failure must not try another tag spelling")
					}
				}
				if server.requestedContaining("/repos/") {
					t.Fatal("pinned download must not query release API")
				}
			})
		}
	}
}
