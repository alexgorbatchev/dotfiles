package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	execRunner "github.com/alexgorbatchev/dotfiles/pkg/exec"
)

// pullFixture is an e2e project whose configuration is a git checkout tracking a
// bare upstream, with a second clone (author) that publishes changes to it, the way
// a configuration edited on another machine reaches this one.
type pullFixture struct {
	e2eProject
	Upstream string
	Author   string
	// Shown is Root as the command prints it: symlinks resolved, the way git reports
	// the work tree (a macOS temp dir is reached through /var -> /private/var), and
	// the home directory folded to ~.
	Shown string
}

// pullFixtureTools is the configuration every fixture starts from.
var pullFixtureTools = tsTools{"first": `install().bin("first")`}

func newPullFixture(t *testing.T) pullFixture {
	t.Helper()
	// Commits need an identity, and a CI runner has no global one.
	for key, value := range map[string]string{
		"GIT_AUTHOR_NAME":     "dotfiles test",
		"GIT_AUTHOR_EMAIL":    "test@example.com",
		"GIT_COMMITTER_NAME":  "dotfiles test",
		"GIT_COMMITTER_EMAIL": "test@example.com",
	} {
		t.Setenv(key, value)
	}

	f := pullFixture{e2eProject: newE2EProject(t, pullFixtureTools)}
	runGit(t, f.Root, "init", "-q", "-b", "main")
	runGit(t, f.Root, "add", "dotfiles.config.ts", "tools")
	runGit(t, f.Root, "commit", "-q", "-m", "initial configuration")

	f.Upstream = filepath.Join(t.TempDir(), "upstream.git")
	runGit(t, f.Root, "clone", "-q", "--bare", f.Root, f.Upstream)
	runGit(t, f.Root, "remote", "add", "origin", f.Upstream)
	runGit(t, f.Root, "fetch", "-q", "origin")
	runGit(t, f.Root, "branch", "-q", "--set-upstream-to=origin/main")

	f.Author = filepath.Join(t.TempDir(), "author")
	runGit(t, f.Root, "clone", "-q", f.Upstream, f.Author)
	f.Shown = displayPath(realPath(t, f.Root))
	return f
}

// publish commits tools as the author's whole tool set and pushes it upstream. The
// configuration keeps pointing its paths at the fixture's directories.
func (f pullFixture) publish(t *testing.T, tools tsTools) {
	t.Helper()
	writeTSProject(t, f.Author, `"paths": {`+projectPathsTS(f.Root)+`}`, tools)
	runGit(t, f.Author, "add", "-A", "dotfiles.config.ts", "tools")
	runGit(t, f.Author, "commit", "-q", "-m", "change tools")
	runGit(t, f.Author, "push", "-q", "origin", "main")
}

func (f pullFixture) head(t *testing.T) string {
	t.Helper()
	return runGit(t, f.Root, "rev-parse", "HEAD")
}

func (f pullFixture) upstreamHead(t *testing.T) string {
	t.Helper()
	return runGit(t, f.Upstream, "rev-parse", "main")
}

// runGit runs git in dir and returns its trimmed standard output.
func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	out, err := execRunner.NewOSRunner().Command("git", append([]string{"-C", dir}, args...)...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func realPath(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func assertExists(t *testing.T, path string, want bool) {
	t.Helper()
	_, err := os.Lstat(path)
	switch {
	case want && err != nil:
		t.Fatalf("expected %s to exist: %v", path, err)
	case !want && err == nil:
		t.Fatalf("expected %s not to exist", path)
	case !want && !os.IsNotExist(err):
		t.Fatalf("checking %s: %v", path, err)
	}
}

func TestStatePull_FastForwardsThenGenerates(t *testing.T) {
	for _, command := range [][]string{{"state", "pull"}, {"pull"}} {
		t.Run(strings.Join(command, " "), func(t *testing.T) {
			f := newPullFixture(t)
			f.publish(t, tsTools{"first": pullFixtureTools["first"], "second": `install().bin("second")`})

			out, err := f.run(command...)
			if err != nil {
				t.Fatalf("pull: %v\n%s", err, out.Combined)
			}

			if got, want := f.head(t), f.upstreamHead(t); got != want {
				t.Fatalf("HEAD = %s, want upstream %s", got, want)
			}
			// The shim of the tool that only exists upstream proves generation read
			// the pulled configuration rather than the one loaded before pulling.
			assertExists(t, filepath.Join(f.TargetDir, "second"), true)
			if !strings.Contains(out.Stderr, "Pulling "+f.Shown) || !strings.Contains(out.Stderr, "| ") {
				t.Errorf("stderr does not report the pull and git's output:\n%s", out.Stderr)
			}
			if out.Stdout != "" {
				t.Errorf("stdout = %q, want it left for pipeline data", out.Stdout)
			}
		})
	}
}

func TestStatePull_OverwritePassesToGeneration(t *testing.T) {
	f := newPullFixture(t)
	f.publish(t, tsTools{"first": pullFixtureTools["first"], "second": `install().bin("second")`})
	userFile := filepath.Join(f.TargetDir, "second")
	if err := os.WriteFile(userFile, []byte("user owned"), 0755); err != nil {
		t.Fatal(err)
	}

	if out, err := f.run("state", "pull", "--overwrite"); err != nil {
		t.Fatalf("pull --overwrite: %v\n%s", err, out.Combined)
	}

	got, err := os.ReadFile(userFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) == "user owned" {
		t.Fatalf("%s was left in place; --overwrite did not reach generation", userFile)
	}
}

func TestStatePull_FollowsSymlinkedConfiguration(t *testing.T) {
	f := newPullFixture(t)
	f.publish(t, tsTools{"first": pullFixtureTools["first"], "second": `install().bin("second")`})
	link := filepath.Join(t.TempDir(), "dotfiles.config.ts")
	if err := os.Symlink(f.ConfigPath, link); err != nil {
		t.Fatal(err)
	}

	out, err := runCommand("-c", link, "state", "pull")
	if err != nil {
		t.Fatalf("pull through %s: %v\n%s", link, err, out.Combined)
	}
	if got, want := f.head(t), f.upstreamHead(t); got != want {
		t.Fatalf("HEAD = %s, want upstream %s", got, want)
	}
}

func TestStatePull_DryRunLeavesCheckout(t *testing.T) {
	f := newPullFixture(t)
	before := f.head(t)
	f.publish(t, tsTools{"first": pullFixtureTools["first"], "second": `install().bin("second")`})

	out, err := f.run("--dry-run", "state", "pull")
	if err != nil {
		t.Fatalf("pull --dry-run: %v\n%s", err, out.Combined)
	}

	if got := f.head(t); got != before {
		t.Fatalf("HEAD moved to %s in a dry run, want %s", got, before)
	}
	if !strings.Contains(out.Stderr, "Dry run: not pulling "+f.Shown) {
		t.Errorf("stderr does not report the skipped pull:\n%s", out.Stderr)
	}
	if !strings.Contains(out.Stderr, "Starting generation") {
		t.Errorf("dry run did not simulate generation:\n%s", out.Stderr)
	}
	assertExists(t, filepath.Join(f.TargetDir, "second"), false)
}

func TestStatePull_FailuresStopBeforeGeneration(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(t *testing.T, f pullFixture)
	}{
		{
			name: "diverged branch",
			prepare: func(t *testing.T, f pullFixture) {
				writeTSProject(t, f.Root, `"paths": {`+projectPathsTS(f.Root)+`}`, tsTools{"first": pullFixtureTools["first"], "local": `install().bin("local")`})
				runGit(t, f.Root, "add", "-A", "dotfiles.config.ts", "tools")
				runGit(t, f.Root, "commit", "-q", "-m", "local change")
			},
		},
		{
			name: "uncommitted change the pull would overwrite",
			prepare: func(t *testing.T, f pullFixture) {
				if err := os.WriteFile(filepath.Join(f.Root, "tools", "first.tool.ts"), []byte("// edited\n"), 0644); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "detached HEAD",
			prepare: func(t *testing.T, f pullFixture) {
				runGit(t, f.Root, "checkout", "-q", "--detach")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newPullFixture(t)
			// The upstream change edits first.tool.ts, so a local edit to it conflicts.
			f.publish(t, tsTools{"first": `install().bin("first-renamed")`, "second": `install().bin("second")`})
			tt.prepare(t, f)
			before := f.head(t)

			out, err := f.run("state", "pull")
			wantErr := "pulling " + f.Shown + ": exit status "
			if err == nil || !strings.HasPrefix(err.Error(), wantErr) {
				t.Fatalf("error = %v, want prefix %q\n%s", err, wantErr, out.Combined)
			}
			if got := f.head(t); got != before {
				t.Fatalf("HEAD moved from %s to %s", before, got)
			}
			if strings.Contains(out.Stderr, "Starting generation") {
				t.Fatalf("generation ran after a failed pull:\n%s", out.Stderr)
			}
			assertExists(t, filepath.Join(f.TargetDir, "second"), false)
		})
	}
}

func TestStatePull_ConfigurationOutsideGit(t *testing.T) {
	p := newE2EProject(t, pullFixtureTools)

	out, err := p.run("state", "pull")
	if err == nil {
		t.Fatalf("expected an error for a configuration outside git\n%s", out.Combined)
	}
	want := "finding the git repository of " + displayPath(realPath(t, p.ConfigPath)) + ": fatal: not a git repository"
	if !strings.HasPrefix(err.Error(), want) {
		t.Fatalf("error = %q, want prefix %q", err, want)
	}
	if strings.Contains(out.Stderr, "Starting generation") {
		t.Fatalf("generation ran without a pull:\n%s", out.Stderr)
	}
}

func TestStatePull_UnusableEnvironment(t *testing.T) {
	t.Run("missing configuration file", func(t *testing.T) {
		missing := filepath.Join(t.TempDir(), "dotfiles.config.ts")
		_, err := runCommand("-c", missing, "state", "pull")
		want := "reading configuration file " + displayPath(missing) + ": no such file or directory"
		if err == nil || err.Error() != want {
			t.Fatalf("error = %v, want %q", err, want)
		}
	})

	t.Run("no default configuration", func(t *testing.T) {
		enterTempDir(t)
		t.Setenv("DOTFILES_REPO_ROOT", t.TempDir())
		_, err := runCommand("state", "pull")
		if err == nil || err.Error() != "configuration file not specified and defaults not found" {
			t.Fatalf("error = %v, want the missing-configuration error", err)
		}
	})

	t.Run("git not installed", func(t *testing.T) {
		p := newE2EProject(t, pullFixtureTools)
		t.Setenv("PATH", t.TempDir())
		_, err := p.run("state", "pull")
		if err == nil || !strings.HasPrefix(err.Error(), "finding the git repository of "+displayPath(realPath(t, p.ConfigPath))+": running git: ") {
			t.Fatalf("error = %v, want the git lookup failure", err)
		}
	})
}

func TestDisplayPath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("no home directory: %v", err)
	}
	tests := []struct {
		path string
		want string
	}{
		{home, "~"},
		{filepath.Join(home, "dotfiles"), "~" + string(filepath.Separator) + "dotfiles"},
		{home + "-sibling", home + "-sibling"},
		{filepath.Join(string(filepath.Separator), "elsewhere"), filepath.Join(string(filepath.Separator), "elsewhere")},
	}
	for _, tt := range tests {
		if got := displayPath(tt.path); got != tt.want {
			t.Errorf("displayPath(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}
