package updater_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/updater"
)

// TestReleaseRequestsAuthenticateFromTheEnvironment pins the credentials the
// self-updater presents. It resolves them through the same helper the installers
// and the dashboard use, so the two environment variables rank the same way
// everywhere; the project configuration's github.token is not among the sources,
// because it authenticates the project's github.host and a self-update addresses
// the public API instead.
func TestReleaseRequestsAuthenticateFromTheEnvironment(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{
			name: "GITHUB_TOKEN before GH_TOKEN",
			env:  map[string]string{"GITHUB_TOKEN": "gh", "GH_TOKEN": "cli"},
			want: "token gh",
		},
		{
			name: "GH_TOKEN as the last resort",
			env:  map[string]string{"GH_TOKEN": "cli"},
			want: "token cli",
		},
		{
			name: "nothing configured anywhere",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GITHUB_TOKEN", tt.env["GITHUB_TOKEN"])
			t.Setenv("GH_TOKEN", tt.env["GH_TOKEN"])

			var gotAuth string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth = r.Header.Get("Authorization")
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintln(w, `[{"tag_name": "v2.0.0", "prerelease": false, "assets": []}]`)
			}))
			t.Cleanup(server.Close)

			u := updater.New(updater.Config{BaseURL: server.URL})
			if _, err := u.CheckForUpdate(context.Background(), updater.Options{CurrentVersion: "1.0.0"}); err != nil {
				t.Fatalf("CheckForUpdate: %v", err)
			}
			if gotAuth != tt.want {
				t.Errorf("Authorization = %q, want %q", gotAuth, tt.want)
			}
		})
	}
}
