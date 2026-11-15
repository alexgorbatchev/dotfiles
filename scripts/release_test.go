package scripts

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReleaseValidationGate(t *testing.T) {
	bun, err := exec.LookPath("bun")
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.ReadFile("release.ts")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, fail string
		dryRun     bool
		wantError  bool
		wantCalls  []string
	}{
		{"status failure stops before version change", "git status --porcelain", false, true, []string{"git status --porcelain"}},
		{"validation failure", "bun run check", false, true, []string{"git status --porcelain", "bun pm version patch --no-git-tag-version", "just setup", "bun run check"}},
		{"dry run validation failure", "bun run check", true, true, []string{"bun pm version patch --no-git-tag-version", "just setup", "bun run check"}},
		{"setup failure", "just setup", false, true, []string{"git status --porcelain", "bun pm version patch --no-git-tag-version", "just setup"}},
		{"dry run build failure", "bun run compile", true, true, []string{"bun pm version patch --no-git-tag-version", "just setup", "bun run check", "bun run compile"}},
		{"dry run success", "", true, false, []string{"bun pm version patch --no-git-tag-version", "just setup", "bun run check", "bun run compile"}},
		{"publication success", "", false, false, []string{"git status --porcelain", "bun pm version patch --no-git-tag-version", "just setup", "bun run check", "bun run compile", "git add package.json", "git commit -m Version 1.0.1", "git tag v1.0.1", "git push", "git push origin v1.0.1"}},
		{"failed integration retains release state", "git tag v1.0.1", false, true, []string{"git status --porcelain", "bun pm version patch --no-git-tag-version", "just setup", "bun run check", "bun run compile", "git add package.json", "git commit -m Version 1.0.1", "git tag v1.0.1"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			write := func(name, contents string, mode os.FileMode) {
				t.Helper()
				file := filepath.Join(root, name)
				if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(file, []byte(contents), mode); err != nil {
					t.Fatal(err)
				}
			}
			const original = "{\n  \"name\": \"fixture\",\n  \"version\": \"1.0.0\",\n  \"workspaces\": [],\n  \"description\": \"pre-existing local edit\"\n}\n"
			write("package.json", original, 0644)
			write("scripts/release.ts", string(source), 0644)
			for _, command := range []string{"bun", "git", "just"} {
				stub := fmt.Sprintf(`#!/bin/sh
call='%s '"$*"
printf '%%s\n' "$call" >> "$RELEASE_TEST_CALLS"
if [ "$call" = "$RELEASE_TEST_FAIL" ]; then
  printf 'fixture failure: %%s\n' "$call" >&2
  exit 23
fi
case "$call" in
  'bun pm version patch --no-git-tag-version')
    printf '{"name":"fixture","version":"1.0.1","workspaces":[]}\n' > package.json ;;
  'bun run compile')
    mkdir -p .dist
    printf 'built readme\n' > .dist/README.md ;;
esac
`, command)
				write("bin/"+command, stub, 0755)
			}
			args := []string{filepath.Join(root, "scripts/release.ts"), "patch"}
			if tc.dryRun {
				args = append(args, "--dry-run")
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, bun, args...)
			cmd.Dir = root
			cmd.Env = append(os.Environ(), "PATH="+filepath.Join(root, "bin")+string(os.PathListSeparator)+os.Getenv("PATH"), "BASH_ENV=", "RELEASE_TEST_CALLS="+filepath.Join(root, "calls"), "RELEASE_TEST_FAIL="+tc.fail)
			output, err := cmd.CombinedOutput()
			if (err != nil) != tc.wantError {
				t.Fatalf("release error=%v, want failure %t\n%s", err, tc.wantError, output)
			}
			calls, err := os.ReadFile(filepath.Join(root, "calls"))
			if err != nil {
				t.Fatal(err)
			}
			if want := strings.Join(tc.wantCalls, "\n") + "\n"; string(calls) != want {
				t.Fatalf("commands:\n%s\nwant:\n%s\noutput:\n%s", calls, want, output)
			}
			contents, err := os.ReadFile(filepath.Join(root, "package.json"))
			if err != nil {
				t.Fatal(err)
			}
			integrated := strings.Contains(string(calls), "git add package.json")
			if !integrated && string(contents) != original {
				t.Fatalf("version rollback lost original package contents:\n%s", contents)
			}
			if integrated && !strings.Contains(string(contents), `"version":"1.0.1"`) {
				t.Fatalf("integration state was rewritten:\n%s", contents)
			}
		})
	}
}
