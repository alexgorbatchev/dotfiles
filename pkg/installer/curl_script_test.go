package installer

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestCurlScriptInstaller(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("#!/bin/sh\n"))
	}))
	defer server.Close()

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	dl := downloader.NewDownloader(fsys, nil)
	inst := NewCurlScriptInstaller(runner, fsys, dl, nil)
	inst.BinDir = "/test/bin"

	if inst.Name() != "curl-script" {
		t.Errorf("expected name to be 'curl-script', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success with sh", func(t *testing.T) {
		runner.Clear()
		_ = fsys.MkdirAll("/test/bin", 0755)
		_ = fsys.WriteFile("/test/bin/mytool", []byte("bin"), 0755)
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url":   server.URL,
				"shell": "sh",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(res.Binaries) != 1 || res.Binaries[0] != "mytool" {
			t.Errorf("expected mytool, got %v", res.Binaries)
		}

		// Verify shell script was run via sh
		hasShRun := false
		for _, cmd := range runner.History {
			if cmd.Name == "sh" {
				hasShRun = true
			}
		}
		if !hasShRun {
			t.Error("expected script execution with sh")
		}
	})

	t.Run("Install success with bash", func(t *testing.T) {
		runner.Clear()
		_ = fsys.MkdirAll("/test/bin", 0755)
		_ = fsys.WriteFile("/test/bin/mytool", []byte("bin"), 0755)
		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url":   server.URL,
				"shell": "bash",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		hasBashRun := false
		for _, cmd := range runner.History {
			if cmd.Name == "bash" {
				hasBashRun = true
			}
		}
		if !hasBashRun {
			t.Error("expected script execution with bash")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		destPath := filepath.Join(inst.BinDir, "mytool")
		_ = fsys.WriteFile(destPath, []byte("content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		exists, _ := fsys.Exists(destPath)
		if exists {
			t.Error("expected file to be removed")
		}
	})

	// A binary the script left outside the staging directory is not guessed at: without
	// binaryPath the installation fails and says how to point the script at the staging
	// directory, and nothing is copied out of a system directory.
	t.Run("Install fails when the binary is only in a system directory", func(t *testing.T) {
		runner.Clear()
		sysFsys := fs.NewMemFS()
		sysInst := NewCurlScriptInstaller(runner, sysFsys, downloader.NewDownloader(sysFsys, nil), nil)
		sysInst.BinDir = "/test/bin"

		_ = sysFsys.MkdirAll("/usr/local/bin", 0755)
		_ = sysFsys.WriteFile("/usr/local/bin/mytool", []byte("bin-content"), 0755)

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url":   server.URL,
				"shell": "sh",
			},
		}

		_, err := sysInst.Install(context.Background(), tool)
		if err == nil {
			t.Fatal("Install() = nil, want it to fail when the staging directory has no binary")
		}
		want := `mytool: the install script left no "mytool" in the staging directory /test/bin ` +
			`(nothing matches pattern "{,*/}mytool"); point the script at {stagingDir} through args or env, ` +
			`or set binaryPath to where it installs the binary`
		if err.Error() != want {
			t.Errorf("Install() error = %q, want %q", err, want)
		}
		if exists, _ := sysFsys.Exists("/test/bin/mytool"); exists {
			t.Error("the system binary was copied into the staging directory")
		}
	})

	t.Run("Install fails missing URL", func(t *testing.T) {
		tool := &config.ToolConfig{
			Name: "mytool",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error installing missing URL, got nil")
		}
	})

	t.Run("Install fails directory creation error", func(t *testing.T) {
		badFsys := &mockScriptErrorFS{FS: fsys}
		badDl := downloader.NewDownloader(badFsys, nil)
		badInst := NewCurlScriptInstaller(runner, badFsys, badDl, nil)
		badInst.BinDir = "/forbidden/dir"

		tool := &config.ToolConfig{
			Name: "mytool",
			InstallParams: map[string]interface{}{
				"url": server.URL,
			},
		}

		_, err := badInst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error creating directory, got nil")
		}
	})
}

// v1 resolved args and env when the script was about to run, with the script's own path
// in the context (installFromCurlScript.ts:135-141). A resolver that interpolates
// scriptPath must therefore see the downloaded file, not undefined.
func TestCurlScriptInstaller_ResolvesArgsAndEnvAtInstallTime(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("#!/bin/sh\n"))
	}))
	defer server.Close()

	toolDir := t.TempDir()
	toolPath := filepath.Join(toolDir, "resolver.tool.ts")
	toolSource := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("curl-script", {
				url: "` + server.URL + `",
				shell: "sh",
				args: (ctx) => ["--script", ctx.scriptPath, "--prefix", ctx.stagingDir],
				env: (ctx) => ({ INSTALL_SCRIPT: ctx.scriptPath, PREFIX: ctx.stagingDir }),
			}).bin("resolver"),
		);
	`
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewCurlScriptInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), nil)
	inst.BinDir = "/staging"
	_ = fsys.MkdirAll("/staging", 0755)
	_ = fsys.WriteFile("/staging/resolver", []byte("bin"), 0755)

	tool := &config.ToolConfig{
		Name:           "resolver",
		ConfigFilePath: toolPath,
		InstallParams: map[string]any{
			"url":       server.URL,
			"shell":     "sh",
			"resolvers": []any{"args", "env"},
		},
	}

	if _, err := inst.Install(context.Background(), tool); err != nil {
		t.Fatalf("Install returned error: %v", err)
	}

	var scriptRun *exec.MockCmd
	for _, cmd := range runner.History {
		if cmd.Name == "sh" {
			scriptRun = cmd
		}
	}
	if scriptRun == nil {
		t.Fatalf("the install script was never run: %+v", runner.History)
	}

	wantScriptPath := filepath.Join("/staging", "resolver-install.sh")
	wantArgs := []string{wantScriptPath, "--script", wantScriptPath, "--prefix", "/staging"}
	if len(scriptRun.Args) != len(wantArgs) {
		t.Fatalf("script args = %v, want %v", scriptRun.Args, wantArgs)
	}
	for i := range wantArgs {
		if scriptRun.Args[i] != wantArgs[i] {
			t.Fatalf("script args = %v, want %v", scriptRun.Args, wantArgs)
		}
	}

	env := scriptRun.Env()
	if !slices.Contains(env, "INSTALL_SCRIPT="+wantScriptPath) {
		t.Errorf("script environment lacks the resolved INSTALL_SCRIPT: %v", env)
	}
	if !slices.Contains(env, "PREFIX=/staging") {
		t.Errorf("script environment lacks the resolved PREFIX: %v", env)
	}
}

// A resolver that fails stops the installation instead of letting the script run with
// no arguments at all, which would install something the author did not ask for.
func TestCurlScriptInstaller_ResolverFailureStopsInstall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("#!/bin/sh\n"))
	}))
	defer server.Close()

	toolDir := t.TempDir()
	toolPath := filepath.Join(toolDir, "broken.tool.ts")
	toolSource := `
		import { defineTool } from "@alexgorbatchev/dotfiles";
		export default defineTool((install) =>
			install("curl-script", {
				url: "` + server.URL + `",
				args: () => {
					throw new Error("the resolver could not decide");
				},
			}).bin("broken"),
		);
	`
	if err := os.WriteFile(toolPath, []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing the tool file: %v", err)
	}

	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	inst := NewCurlScriptInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), nil)
	inst.BinDir = "/staging"

	tool := &config.ToolConfig{
		Name:           "broken",
		ConfigFilePath: toolPath,
		InstallParams: map[string]any{
			"url":       server.URL,
			"resolvers": []any{"args"},
		},
	}

	_, err := inst.Install(context.Background(), tool)
	if err == nil {
		t.Fatalf("expected the resolver failure to stop the installation")
	}
	if !strings.Contains(err.Error(), "the resolver could not decide") {
		t.Errorf("error = %v, want it to carry the resolver's own message", err)
	}
	for _, cmd := range runner.History {
		if cmd.Name == "sh" || cmd.Name == "bash" {
			t.Errorf("the install script ran despite the resolver failing: %+v", cmd)
		}
	}
}

// newBinaryPathInstaller returns a curl-script installer staging into /staging, whose
// filesystem expands "~" to /home/user as the CLI's does, and a project configuration
// with that home directory.
func newBinaryPathInstaller(t *testing.T) (*CurlScriptInstaller, *exec.MockRunner, fs.FS, context.Context, string) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("#!/bin/sh\n"))
	}))
	t.Cleanup(server.Close)

	runner := exec.NewMockRunner()
	fsys := fs.NewResolvedFS(fs.NewMemFS(), "/home/user")
	inst := NewCurlScriptInstaller(runner, fsys, downloader.NewDownloader(fsys, nil), nil)
	inst.BinDir = "/staging"

	projCfg := &config.ProjectConfig{}
	projCfg.Paths.HomeDir = "/home/user"
	projCfg.Paths.BinariesDir = "/home/user/.generated/binaries"
	return inst, runner, fsys, config.WithProjectConfig(context.Background(), projCfg), server.URL
}

func scriptRan(runner *exec.MockRunner) bool {
	for _, cmd := range runner.History {
		if cmd.Name == "sh" || cmd.Name == "bash" {
			return true
		}
	}
	return false
}

// A script that installs itself somewhere of its own choosing, as claude.ai/install.sh
// does, is followed there through binaryPath. The staging entry links to the path as
// written rather than to what that path currently resolves to, so when the tool updates
// itself and repoints its launcher, the managed binary follows.
func TestCurlScriptInstaller_BinaryPath(t *testing.T) {
	t.Run("links the declared binary to binaryPath as written", func(t *testing.T) {
		inst, runner, fsys, ctx, url := newBinaryPathInstaller(t)
		_ = fsys.MkdirAll("/home/user/.local/share/claude/versions", 0755)
		_ = fsys.WriteFile("/home/user/.local/share/claude/versions/2.1.0", []byte("claude"), 0755)
		_ = fsys.MkdirAll("/home/user/.local/bin", 0755)
		if err := fsys.Symlink("/home/user/.local/share/claude/versions/2.1.0", "/home/user/.local/bin/claude"); err != nil {
			t.Fatalf("creating the launcher symlink: %v", err)
		}
		runner.Register("/staging/claude", []byte("2.1.0 (Claude Code)\n"), nil)

		tool := &config.ToolConfig{
			Name:     "claude",
			Binaries: []interface{}{map[string]interface{}{"name": "claude"}},
			InstallParams: map[string]interface{}{
				"url":          url,
				"shell":        "bash",
				"binaryPath":   "~/.local/bin/claude",
				"versionArgs":  []interface{}{"--version"},
				"versionRegex": `(\d+\.\d+\.\d+)`,
			},
		}

		res, err := inst.Install(ctx, tool)
		if err != nil {
			t.Fatalf("Install() error = %v", err)
		}
		if !scriptRan(runner) {
			t.Error("the install script was never run")
		}
		if !slices.Equal(res.Binaries, []string{"claude"}) {
			t.Errorf("Binaries = %v, want [claude]", res.Binaries)
		}
		target, err := fsys.Readlink("/staging/claude")
		if err != nil {
			t.Fatalf("the staging entry is not a symlink: %v", err)
		}
		if target != "/home/user/.local/bin/claude" {
			t.Errorf("staging entry links to %q, want the path as written, /home/user/.local/bin/claude", target)
		}
		if res.Version != "2.1.0" {
			t.Errorf("Version = %q, want 2.1.0 detected through the staging link", res.Version)
		}
	})

	t.Run("fails naming the tool and the path when nothing is there", func(t *testing.T) {
		inst, _, fsys, ctx, url := newBinaryPathInstaller(t)
		tool := &config.ToolConfig{
			Name: "claude",
			InstallParams: map[string]interface{}{
				"url":        url,
				"binaryPath": "~/.local/bin/claude",
			},
		}

		_, err := inst.Install(ctx, tool)
		if err == nil {
			t.Fatal("Install() = nil, want it to fail when binaryPath names nothing")
		}
		for _, want := range []string{"claude", "~/.local/bin/claude", "/home/user/.local/bin/claude"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("Install() = %v, want it to name %q", err, want)
			}
		}
		if _, err := fsys.Lstat("/staging/claude"); err == nil {
			t.Error("a staging entry was created for a binary that does not exist")
		}
	})

	// A path that cannot be resolved is known to be wrong before anything runs, so the
	// script is not executed only for its result to be thrown away.
	t.Run("an unresolvable placeholder fails before the script runs", func(t *testing.T) {
		inst, runner, _, ctx, url := newBinaryPathInstaller(t)
		tool := &config.ToolConfig{
			Name: "claude",
			InstallParams: map[string]interface{}{
				"url":        url,
				"binaryPath": "{configFileDir}/claude",
			},
		}

		_, err := inst.Install(ctx, tool)
		if err == nil {
			t.Fatal("Install() = nil, want it to fail on the unresolvable placeholder")
		}
		for _, want := range []string{"claude", "binaryPath", "{configFileDir}"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("Install() = %v, want it to name %q", err, want)
			}
		}
		if scriptRan(runner) {
			t.Error("the install script ran although binaryPath could not be resolved")
		}
	})

	// A script that also drops a copy under the binary's name in the staging directory
	// does not win over binaryPath: the entry is replaced by the link, so the managed
	// binary still follows the launcher.
	t.Run("replaces a file the script left under the binary's name", func(t *testing.T) {
		inst, _, fsys, ctx, url := newBinaryPathInstaller(t)
		writeLauncher(t, fsys)
		_ = fsys.MkdirAll("/staging", 0755)
		_ = fsys.WriteFile("/staging/claude", []byte("stale copy"), 0755)

		if _, err := inst.Install(ctx, binaryPathTool(url)); err != nil {
			t.Fatalf("Install() error = %v", err)
		}
		target, err := fsys.Readlink("/staging/claude")
		if err != nil {
			t.Fatalf("the staging entry is not a symlink: %v", err)
		}
		if target != "/home/user/.local/bin/claude" {
			t.Errorf("staging entry links to %q, want /home/user/.local/bin/claude", target)
		}
	})

	// Each filesystem failure while staging the link stops the installation and says
	// which step failed, rather than reporting a binary that is not there.
	fsFailures := []struct {
		name     string
		failOp   string
		failPath string
		staged   bool
		want     string
	}{
		{name: "binaryPath cannot be checked", failOp: "exists", failPath: "/home/user/.local/bin/claude", want: `claude: checking binaryPath "~/.local/bin/claude" (/home/user/.local/bin/claude): exists denied`},
		{name: "staged entry cannot be cleared", failOp: "remove", failPath: "/staging/claude", staged: true, want: "claude: clearing /staging/claude for the binaryPath link: remove denied"},
		{name: "link cannot be created", failOp: "symlink", failPath: "/staging/claude", want: "claude: linking /staging/claude to binaryPath /home/user/.local/bin/claude: symlink denied"},
	}
	for _, tt := range fsFailures {
		t.Run(tt.name, func(t *testing.T) {
			inst, _, fsys, ctx, url := newBinaryPathInstaller(t)
			writeLauncher(t, fsys)
			if tt.staged {
				_ = fsys.MkdirAll("/staging", 0755)
				_ = fsys.WriteFile("/staging/claude", []byte("stale copy"), 0755)
			}
			inst.SetFS(&faultyFS{FS: fsys, failOp: tt.failOp, failPath: tt.failPath})

			_, err := inst.Install(ctx, binaryPathTool(url))
			if err == nil || err.Error() != tt.want {
				t.Fatalf("Install() error = %v, want %q", err, tt.want)
			}
		})
	}
}

// writeLauncher installs claude the way its script does: a versioned binary and a
// launcher symlink in ~/.local/bin pointing at it.
func writeLauncher(t *testing.T, fsys fs.FS) {
	t.Helper()
	_ = fsys.MkdirAll("/home/user/.local/share/claude/versions", 0755)
	_ = fsys.WriteFile("/home/user/.local/share/claude/versions/2.1.0", []byte("claude"), 0755)
	_ = fsys.MkdirAll("/home/user/.local/bin", 0755)
	if err := fsys.Symlink("/home/user/.local/share/claude/versions/2.1.0", "/home/user/.local/bin/claude"); err != nil {
		t.Fatalf("creating the launcher symlink: %v", err)
	}
}

func binaryPathTool(url string) *config.ToolConfig {
	return &config.ToolConfig{
		Name:     "claude",
		Binaries: []interface{}{map[string]interface{}{"name": "claude"}},
		InstallParams: map[string]interface{}{
			"url":        url,
			"binaryPath": "~/.local/bin/claude",
		},
	}
}

type mockScriptErrorFS struct {
	fs.FS
}

func (m *mockScriptErrorFS) MkdirAll(path string, perm os.FileMode) error {
	return errors.New("mkdir error")
}

func (m *mockScriptErrorFS) Create(path string) (io.WriteCloser, error) {
	return nil, errors.New("create error")
}
