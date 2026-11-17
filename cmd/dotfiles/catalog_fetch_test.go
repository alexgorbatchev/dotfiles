package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/catalog"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

func catalogFetchTestDir(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

func catalogGitCommand(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.NewOSRunner().Command("git", args...)
	cmd.SetDir(dir)
	cmd.SetEnv(append(os.Environ(), "GIT_AUTHOR_NAME=Fixture", "GIT_AUTHOR_EMAIL=fixture@example.test", "GIT_COMMITTER_NAME=Fixture", "GIT_COMMITTER_EMAIL=fixture@example.test"))
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, output)
	}
	return strings.TrimSpace(string(output))
}

func catalogFetchRepository(t *testing.T) (string, string, string) {
	t.Helper()
	repo := catalogFetchTestDir(t)
	source := "throw new Error('downloaded source must not execute');\r\n"
	path := filepath.Join(repo, "tools", "b", "a", "bat")
	if err := os.MkdirAll(filepath.Join(path, "files"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "tool.ts"), []byte(source), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "files", "asset.bin"), []byte{0, 255}, 0644); err != nil {
		t.Fatal(err)
	}
	catalogGitCommand(t, repo, "init", "--initial-branch=main")
	catalogGitCommand(t, repo, "add", ".")
	catalogGitCommand(t, repo, "commit", "-m", "fixture")
	commit := catalogGitCommand(t, repo, "rev-parse", "HEAD")
	return repo, commit, source
}

func TestCatalogFetchLocalRepository(t *testing.T) {
	repo, commit, source := catalogFetchRepository(t)
	for _, test := range []struct {
		name, agent string
		dry         bool
	}{{"human", "0", false}, {"agent", "1", false}, {"dry-run", "0", true}} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("AGENT", test.agent)
			dir := catalogFetchTestDir(t)
			config := writeTSProject(t, dir, `paths: { toolConfigsDir: ["custom", "secondary"] }`, nil)
			if err := os.MkdirAll(filepath.Join(dir, "custom"), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, "custom", "broken.tool.ts"), []byte("throw new Error('existing tool must not execute');"), 0644); err != nil {
				t.Fatal(err)
			}
			args := []string{"--config", config, "catalog", "fetch", "bat", "--repo", repo, "--json"}
			if test.dry {
				args = append(args, "--dry-run")
			}
			out, err := runCommand(args...)
			if err != nil {
				t.Fatalf("fetch: %v, %#v", err, out)
			}
			var result catalog.FetchResult
			if err := json.Unmarshal([]byte(out.Stdout), &result); err != nil {
				t.Fatalf("JSON result: %v, %#v", err, out)
			}
			if result.Commit != commit || result.DryRun != test.dry || result.Destination != filepath.Join(dir, "custom", "bat") || out.Stderr != "" {
				t.Fatalf("incorrect fetch result: %#v, %#v", result, out)
			}
			if test.agent == "1" && strings.Contains(strings.TrimSpace(out.Stdout), "\n") {
				t.Fatalf("agent JSON is not compact: %q", out.Stdout)
			}
			actual, readErr := os.ReadFile(filepath.Join(result.Destination, "bat.tool.ts"))
			if test.dry {
				if !os.IsNotExist(readErr) {
					t.Fatalf("dry-run imported source: %v", readErr)
				}
			} else {
				if readErr != nil || string(actual) != source {
					t.Fatalf("wrong fetched source: %v, %q", readErr, actual)
				}
				out, err = runCommand(args...)
				if err == nil || out.Stdout != "" || !strings.Contains(out.Stderr, "destination-exists") {
					t.Fatalf("repeat fetch: %v, %#v", err, out)
				}
			}
			if _, err := os.Stat(filepath.Join(dir, ".generated")); !os.IsNotExist(err) {
				t.Fatalf("fetch opened installation state: %v", err)
			}
		})
	}
}

func TestCatalogFetchRejectsDiscoveryFlags(t *testing.T) {
	for _, flag := range []string{"--offline", "--refresh", "--catalog-url=https://example.test/"} {
		out, err := runCommand("catalog", "fetch", "bat", "--repo", "https://example.test/catalog.git", "--json", flag)
		if err == nil || out.Stdout != "" || !strings.Contains(out.Stderr, "invalid-input") || !strings.Contains(err.Error(), "discovery option") {
			t.Fatalf("discovery flag %s: %v, %#v", flag, err, out)
		}
	}
}

func TestCatalogFetchRepositorySelection(t *testing.T) {
	repo, commit, source := catalogFetchRepository(t)
	for _, test := range []struct {
		name, environment, code string
		flags                   []string
	}{
		{name: "environment", environment: repo},
		{name: "flag overrides environment", environment: "ext::invalid", flags: []string{"--repo", repo}},
		{name: "empty environment uses default", code: "invalid-project"},
		{name: "invalid environment", environment: "ext::invalid", code: "invalid-input"},
		{name: "explicit empty flag", environment: repo, flags: []string{"--repo="}, code: "invalid-input"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("DOTFILES_CATALOG_REPO", test.environment)
			dir := catalogFetchTestDir(t)
			config := filepath.Join(dir, "missing.config.ts")
			if test.code == "" {
				config = writeTSProject(t, dir, `paths: { toolConfigsDir: "custom" }`, nil)
			}
			args := append([]string{"--config", config, "catalog", "fetch", "bat", "--json"}, test.flags...)
			out, err := runCommand(args...)
			if test.code != "" {
				var failure catalog.Error
				if err == nil || out.Stdout != "" || json.Unmarshal([]byte(out.Stderr), &failure) != nil || failure.Code != test.code {
					t.Fatalf("repository selection error: %v, %#v", err, out)
				}
				return
			}
			var result catalog.FetchResult
			if err != nil || json.Unmarshal([]byte(out.Stdout), &result) != nil || result.Repository != repo || result.Commit != commit {
				t.Fatalf("repository selection: %v, %#v", err, out)
			}
			data, err := os.ReadFile(filepath.Join(result.Destination, "bat.tool.ts"))
			if err != nil || string(data) != source {
				t.Fatalf("selected repository source: %v, %q", err, data)
			}
		})
	}
}

func TestCatalogFetchLoadsThroughNormalWorkflow(t *testing.T) {
	repo, _, _ := catalogFetchRepository(t)
	sourceDir := filepath.Join(repo, "tools", "b", "a", "bat")
	source := `import { defineTool } from "@alexgorbatchev/dotfiles";
import { binary } from "./files/helper";
export default defineTool((install) => install("manual", {
  binaryPath: __dirname + "/files/asset.bin",
}).bin(binary));`
	if err := os.WriteFile(filepath.Join(sourceDir, "tool.ts"), []byte(source), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "files", "helper.ts"), []byte(`export const binary = "bat";`), 0644); err != nil {
		t.Fatal(err)
	}
	catalogGitCommand(t, repo, "add", ".")
	catalogGitCommand(t, repo, "commit", "-m", "usable tool")
	dir := catalogFetchTestDir(t)
	config := writeTSProject(t, dir, `paths: { toolConfigsDir: "custom" }`, nil)
	if out, err := runCommand("--config", config, "catalog", "fetch", "bat", "--repo", repo); err != nil {
		t.Fatalf("fetch: %v, %#v", err, out)
	}
	log := logger.New(logger.Config{Writer: io.Discard})
	_, tools, _, err := vm.LoadTypeScriptConfig(log, fs.NewMemFS(), config)
	if err != nil {
		t.Fatal(err)
	}
	tool := tools["bat"]
	if tool == nil {
		t.Fatal("fetched definition was not discovered")
	}
	names := tool.BinaryNames()
	if len(names) != 1 || names[0] != "bat" {
		t.Fatalf("helper import did not configure binary: %#v", names)
	}
	want := filepath.Join(dir, "custom", "bat", "files", "asset.bin")
	actual, _ := tool.InstallParams["binaryPath"].(string)
	if filepath.FromSlash(actual) != want {
		t.Fatalf("fetched definition resolved asset to %q, want %q", actual, want)
	}
}
