package main

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/pem"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
)

// Linux's native certificate loader accepts SSL_CERT_FILE, allowing this real
// process proof to use normal HTTPS verification with an isolated fixture CA.
// Other native hosts need their own verified trust setup and process evidence.
func TestCatalogNativeProcess(t *testing.T) {
	s := newCatalogCLIFixture(t)
	dir, err := filepath.Abs(filepath.Join("../../.tmp", t.Name(), "native"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "bin"), 0700); err != nil {
		t.Fatal(err)
	}
	certificate := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: s.server.TLS.Certificates[0].Certificate[0]})
	certPath := filepath.Join(dir, "fixture.pem")
	if err := os.WriteFile(certPath, certificate, 0600); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(dir, "bin", "dotfiles")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	build := exec.CommandContext(ctx, "go", "build", "-buildvcs=false", "-o", binary, ".")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("compile actual CLI: %v\n%s", err, output)
	}
	baseEnv := append(os.Environ(), "SSL_CERT_FILE="+certPath, "AGENT=0", "DOTFILES_E2E_TEST=", "DEV_PROXY=", "MOCK_SERVER_PORT=")
	run := func(env []string, args ...string) (commandOutput, int) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, binary, args...)
		cmd.Env = append(baseEnv[:len(baseEnv):len(baseEnv)], env...)
		cmd.Dir = dir
		var stdout, stderr bytes.Buffer
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		err := cmd.Run()
		code := 0
		if err != nil {
			var exit *exec.ExitError
			if !errors.As(err, &exit) {
				t.Fatalf("run native catalog CLI: %v", err)
			}
			code = exit.ExitCode()
		}
		return commandOutput{Stdout: stdout.String(), Stderr: stderr.String()}, code
	}
	origin := s.server.URL + "/catalog/"
	base := []string{"--config", filepath.Join(dir, "missing.ts"), "catalog", "--catalog-url", origin}
	out, code := run(nil, append(base, "list", "--json")...)
	var discovery catalogDiscoveryResponse
	if code != 0 || json.Unmarshal([]byte(out.Stdout), &discovery) != nil || discovery.Total != 1 || out.Stderr != "" || s.count() != 5 {
		t.Fatalf("native discovery bootstrap/stream/request contract: exit %d %#v", code, out)
	}
	out, code = run([]string{"AGENT=1"}, append(base, "show", "bat", "--json")...)
	var shown catalogShowResponse
	if code != 0 || json.Unmarshal([]byte(out.Stdout), &shown) != nil || !strings.Contains(shown.DefinitionSource, "discovery must not evaluate") || strings.Contains(strings.TrimSuffix(out.Stdout, "\n"), "\n") || out.Stderr != "" || s.count() != 8 {
		t.Fatalf("native selected source/agent JSON contract: exit %d %#v", code, out)
	}
	before := s.count()
	for _, test := range []struct {
		args []string
		code int
		want string
	}{{[]string{"list", "--offline", "--json"}, 0, `"isOffline": true`}, {[]string{"show", "missing", "--json"}, 1, "not-found"}, {[]string{"search", "missing", "--json"}, 0, `"total": 0`}, {[]string{"show", "--json"}, 1, "invalid-input"}} {
		out, code = run(nil, append(base, test.args...)...)
		if code != test.code || s.count() != before {
			t.Fatalf("native cache/exit contract %v: exit %d %#v", test.args, code, out)
		}
		if code == 0 {
			if !strings.Contains(out.Stdout, test.want) {
				t.Fatalf("native result missing %s: %#v", test.want, out)
			}
		} else {
			var failure catalog.Error
			if out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != test.want {
				t.Fatalf("native error envelope duplicated or sent to stdout: %#v", out)
			}
		}
	}
	out, code = run(nil, "__complete", "catalog", "--catalog-url", origin, "show", "b")
	if code != 0 || s.count() != before || !strings.Contains(out.Stdout, "bat\t") || !strings.Contains(out.Stdout, ":4") {
		t.Fatalf("native cache-only completion: exit %d %#v", code, out)
	}
	for _, path := range []string{filepath.Join(dir, ".generated"), filepath.Join(dir, ".catalog", "process.lock")} {
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("native readonly command created project artifact %s: %v", path, err)
		}
	}
	cache := filepath.Join(dir, "uncached-dry-run")
	out, code = run([]string{"XDG_CACHE_HOME=" + cache}, append(base, "list", "--dry-run", "--json")...)
	if code != 0 || s.count() != before+5 || !strings.Contains(out.Stdout, `"total": 1`) {
		t.Fatalf("native dry-run discovery: exit %d %#v", code, out)
	}
	if _, err := os.Stat(cache); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("native dry-run wrote its cache: %v", err)
	}
	before = s.count()
	out, code = run(nil, "catalog", "list", "--catalog-url", "https://api.github.com/", "--json")
	var failure catalog.Error
	if code != 1 || s.count() != before || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != "invalid-input" {
		t.Fatalf("native API origin dispatch/exit/stream contract: exit %d %#v", code, out)
	}
	out, code = run(nil, "catalog", "--json", "list", "--limit", "invalid")
	if code != 1 || s.count() != before || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != "invalid-input" {
		t.Fatalf("native parser failure bypassed typed JSON: exit %d %#v", code, out)
	}
	repo, commit, source := catalogFetchRepository(t)
	projectDir := filepath.Join(dir, "fetch-project")
	if err := os.MkdirAll(projectDir, 0700); err != nil {
		t.Fatal(err)
	}
	config := writeTSProject(t, projectDir, `paths: { toolConfigsDir: ["custom", "secondary"] }`, nil)
	fetchArgs := []string{"--config", config, "catalog", "fetch", "bat", "--repo", repo, "--ref", commit, "--json"}
	out, code = run([]string{"DOTFILES_CATALOG_REPO=ext::invalid"}, append(fetchArgs[:len(fetchArgs):len(fetchArgs)], "--dry-run")...)
	var fetched catalog.FetchResult
	if code != 0 || json.Unmarshal([]byte(out.Stdout), &fetched) != nil || !fetched.DryRun || fetched.Commit != commit || out.Stderr != "" || s.count() != before {
		t.Fatalf("native Git dry-run: exit %d %#v", code, out)
	}
	if _, err := os.Stat(filepath.Join(projectDir, "custom")); !os.IsNotExist(err) {
		t.Fatalf("native dry-run wrote files: %v", err)
	}
	environmentFetchArgs := []string{"--config", config, "catalog", "fetch", "bat", "--ref", commit, "--json"}
	out, code = run([]string{"AGENT=1", "DOTFILES_CATALOG_REPO=" + repo}, environmentFetchArgs...)
	if code != 0 || json.Unmarshal([]byte(out.Stdout), &fetched) != nil || fetched.Repository != repo || fetched.DryRun || fetched.Commit != commit || out.Stderr != "" || strings.Contains(strings.TrimSpace(out.Stdout), "\n") {
		t.Fatalf("native Git fetch: exit %d %#v", code, out)
	}
	actual, err := os.ReadFile(filepath.Join(fetched.Destination, "bat.tool.ts"))
	if err != nil || string(actual) != source {
		t.Fatalf("native imported source bytes: %v, %q", err, actual)
	}
	out, code = run(nil, fetchArgs...)
	if code != 1 || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != "destination-exists" {
		t.Fatalf("native repeat fetch: exit %d %#v", code, out)
	}
	if _, err := os.Stat(filepath.Join(projectDir, ".generated")); !os.IsNotExist(err) {
		t.Fatalf("native fetch created installation state: %v", err)
	}
}
