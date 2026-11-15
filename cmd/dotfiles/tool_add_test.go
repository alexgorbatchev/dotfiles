package main

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestToolAddHelp(t *testing.T) {
	for _, mode := range []string{"0", "1"} {
		t.Run("AGENT="+mode, func(t *testing.T) {
			t.Setenv("AGENT", mode)
			out, err := runCommand("tool", "add", "--help")
			if err != nil {
				t.Fatalf("tool add --help: %v", err)
			}
			help := strings.Join(strings.Fields(out.Stdout), " ")
			for _, want := range []string{
				"owner/repo", "https://github.com/owner/repo", "http://github.com/owner/repo", "github.com/owner/repo",
				"owner/repo.git", "owner/repo/", "owner/repo.tool.ts",
				"Do not combine .git with a trailing slash",
				"<repo-name>.tool.ts", "root of the default branch", "tools/ or .dotfiles/",
				"only downloads the configuration", "does not install the tool binary",
				"dotfiles generate", "shims and shell integration", "dotfiles install <tool>", "first use",
			} {
				if !strings.Contains(help, want) {
					t.Errorf("tool add --help is missing %q", want)
				}
			}
			if out.Stderr != "" {
				t.Errorf("tool add --help wrote stderr: %s", out.Stderr)
			}
		})
	}
}

func TestToolAdd(t *testing.T) {
	t.Setenv("DOTFILES_E2E_TEST", "true")

	// 1. Argument validation (fails before services bootstrap or network calls)
	t.Run("invalid argument validation", func(t *testing.T) {
		invalidArgs := []string{
			"bat",
			"/bat",
			"owner/",
			"owner/.tool.ts",
			"a/b/c",
		}
		for _, arg := range invalidArgs {
			_, err := executeCommand("tool", "add", arg)
			if err == nil {
				t.Errorf("expected error for invalid repository argument %q, got nil", arg)
			}
		}
	})

	// Setup mock GitHub server
	remoteFiles := map[string]string{
		"sharkdp/bat/bat.tool.ts": "import { defineTool } from \"@alexgorbatchev/dotfiles\";\nexport default defineTool((install) => install(\"github-release\", { repo: \"sharkdp/bat\" }).bin(\"bat\"));\n",
		"sharkdp/fd/fd.tool.ts":   "import { defineTool } from \"@alexgorbatchev/dotfiles\";\nexport default defineTool((install) => install(\"github-release\", { repo: \"sharkdp/fd\" }).bin(\"fd\"));\n",
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const prefix = "/repos/"
		const infix = "/contents/"
		if strings.HasPrefix(r.URL.Path, prefix) && strings.Contains(r.URL.Path, infix) {
			rest := strings.TrimPrefix(r.URL.Path, prefix)
			repo, fileName, _ := strings.Cut(rest, infix)
			key := repo + "/" + fileName
			content, ok := remoteFiles[key]
			if !ok {
				http.NotFound(w, r)
				return
			}
			encoded := base64.StdEncoding.EncodeToString([]byte(content))
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{
				"type": "file",
				"encoding": "base64",
				"size": %d,
				"name": %q,
				"path": %q,
				"content": %q
			}`, len(content), fileName, fileName, encoded)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	// Temporary test project with github.host pointing to server.URL
	tmpDir := enterTempDir(t)
	toolsDir := filepath.Join(tmpDir, "tools")
	configPath := writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}, "github": { "host": "`+server.URL+`" }`, tsTools{})

	// 2. Failure when repository does not contain <name>.tool.ts (404)
	t.Run("remote 404 tool definition not found", func(t *testing.T) {
		_, err := executeCommand("-c", configPath, "tool", "add", "sharkdp/missing")
		if err == nil {
			t.Fatal("expected error for non-existent tool, got nil")
		}
		if !strings.Contains(err.Error(), "tool definition") || !strings.Contains(err.Error(), "not found") {
			t.Errorf("expected tool definition not found error, got: %v", err)
		}
	})

	// 3. Successful remote file download to <toolConfigsDir>/<name>.tool.ts
	t.Run("successful remote download", func(t *testing.T) {
		out, err := executeCommand("-c", configPath, "tool", "add", "sharkdp/bat")
		if err != nil {
			t.Fatalf("tool add failed: %v\n%s", err, out)
		}
		batPath := filepath.Join(toolsDir, "bat.tool.ts")
		content, err := os.ReadFile(batPath)
		if err != nil {
			t.Fatalf("reading downloaded bat.tool.ts: %v", err)
		}
		if string(content) != remoteFiles["sharkdp/bat/bat.tool.ts"] {
			t.Errorf("content = %q, want %q", string(content), remoteFiles["sharkdp/bat/bat.tool.ts"])
		}
		if !strings.Contains(out, "Created") {
			t.Errorf("expected 'Created' in output, got: %s", out)
		}
	})

	// 4. Conflict handling when file already exists without --force
	t.Run("conflict handling without force", func(t *testing.T) {
		_, err := executeCommand("-c", configPath, "tool", "add", "sharkdp/bat")
		if err == nil {
			t.Fatal("expected error when file already exists without --force, got nil")
		}
		if !strings.Contains(err.Error(), "already exists") || !strings.Contains(err.Error(), "--force") {
			t.Errorf("expected already exists / use --force error, got: %v", err)
		}
	})

	// 5. Overwrite when --force is supplied
	t.Run("overwrite with force", func(t *testing.T) {
		batPath := filepath.Join(toolsDir, "bat.tool.ts")
		newContent := "// updated bat configuration\n"
		remoteFiles["sharkdp/bat/bat.tool.ts"] = newContent

		out, err := executeCommand("-c", configPath, "tool", "add", "--force", "sharkdp/bat")
		if err != nil {
			t.Fatalf("tool add --force failed: %v\n%s", err, out)
		}
		updated, err := os.ReadFile(batPath)
		if err != nil {
			t.Fatalf("reading updated bat.tool.ts: %v", err)
		}
		if string(updated) != newContent {
			t.Errorf("content = %q, want %q", string(updated), newContent)
		}
		if !strings.Contains(out, "Overwrote") {
			t.Errorf("expected 'Overwrote' in output, got: %s", out)
		}
	})

	// 6. Dry run flag (--dry-run) leaving filesystem untouched
	t.Run("dry run leaves filesystem untouched", func(t *testing.T) {
		fdPath := filepath.Join(toolsDir, "fd.tool.ts")
		out, err := executeCommand("-c", configPath, "--dry-run", "tool", "add", "sharkdp/fd")
		if err != nil {
			t.Fatalf("tool add --dry-run failed: %v\n%s", err, out)
		}
		if !strings.Contains(out, "Would create") {
			t.Errorf("expected 'Would create' in output, got: %s", out)
		}
		if _, err := os.Stat(fdPath); !os.IsNotExist(err) {
			t.Errorf("expected %s not to exist after dry run, stat err: %v", fdPath, err)
		}

		// Also verify Would overwrite when file exists and --force is passed
		outForce, err := executeCommand("-c", configPath, "--dry-run", "tool", "add", "--force", "sharkdp/bat")
		if err != nil {
			t.Fatalf("tool add --dry-run --force failed: %v\n%s", err, outForce)
		}
		if !strings.Contains(outForce, "Would overwrite") {
			t.Errorf("expected 'Would overwrite' in output, got: %s", outForce)
		}
	})

	// 7. General fetch error reporting
	t.Run("fetch error reporting on server failure", func(t *testing.T) {
		failServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer failServer.Close()

		failTmpDir := enterTempDir(t)
		failConfigPath := writeTSProject(t, failTmpDir, `"paths": {`+projectPathsTS(failTmpDir)+`}, "github": { "host": "`+failServer.URL+`" }`, tsTools{})

		_, err := executeCommand("-c", failConfigPath, "tool", "add", "sharkdp/errtool")
		if err == nil {
			t.Fatal("expected error on 500 server failure, got nil")
		}
		if !strings.Contains(err.Error(), "fetching tool definition") {
			t.Errorf("expected 'fetching tool definition' in error, got: %v", err)
		}
	})

	// 8. Positional argument completion suppresses file completion
	t.Run("completion suppresses file completion", func(t *testing.T) {
		cmd, _, err := rootCmd.Find([]string{"tool", "add"})
		if err != nil {
			t.Fatalf("finding tool add command: %v", err)
		}
		if cmd.ValidArgsFunction == nil {
			t.Fatal("expected ValidArgsFunction to be set on tool add command")
		}
		candidates, directive := cmd.ValidArgsFunction(cmd, nil, "")
		if directive&cobra.ShellCompDirectiveNoFileComp == 0 {
			t.Errorf("directive = %d, want ShellCompDirectiveNoFileComp set", directive)
		}
		if len(candidates) != 0 {
			t.Errorf("expected 0 candidates, got %d", len(candidates))
		}
	})

	// 9. Trailing slash handling (e.g. sharkdp/bat/)
	t.Run("trailing slash in repo argument", func(t *testing.T) {
		out, err := executeCommand("-c", configPath, "tool", "add", "--force", "sharkdp/bat/")
		if err != nil {
			t.Fatalf("tool add with trailing slash failed: %v\n%s", err, out)
		}
		if !strings.Contains(out, "Overwrote") {
			t.Errorf("expected 'Overwrote' in output, got: %s", out)
		}
	})

	// 10. .tool.ts suffix handling (e.g. sharkdp/bat.tool.ts)
	t.Run("tool.ts suffix in repo argument", func(t *testing.T) {
		out, err := executeCommand("-c", configPath, "tool", "add", "--force", "sharkdp/bat.tool.ts")
		if err != nil {
			t.Fatalf("tool add with .tool.ts suffix failed: %v\n%s", err, out)
		}
		if !strings.Contains(out, "Overwrote") {
			t.Errorf("expected 'Overwrote' in output, got: %s", out)
		}
	})
}
