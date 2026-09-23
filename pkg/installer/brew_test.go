package installer

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

func TestBrewInstaller(t *testing.T) {
	runner := exec.NewMockRunner()
	fsys := fs.NewMemFS()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Writer: &logBuf, Level: logger.LogLevelDefault})
	inst := NewBrewInstaller(runner, fsys, NewDefaultSystemContext())
	inst.SetLogger(log)

	if inst.Name() != "brew" {
		t.Errorf("expected name to be 'brew', got %s", inst.Name())
	}

	if inst.SupportsSudo() {
		t.Error("expected SupportsSudo() to be false")
	}

	t.Run("Install success with taps and force", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"jq","versions":{"stable":"1.7"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "jq",
			InstallParams: map[string]interface{}{
				"formula": "jq",
				"tap":     "homebrew/core",
				"force":   true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		// Verify tap and install commands were executed
		hasTap := false
		hasInstall := false
		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "tap" && cmd.Args[1] == "homebrew/core" {
				hasTap = true
			}
			if len(cmd.Args) > 1 && cmd.Args[0] == "install" && cmd.Args[1] == "--force" {
				hasInstall = true
			}
		}

		if !hasTap {
			t.Error("expected brew tap to be called")
		}
		if !hasInstall {
			t.Error("expected brew install with --force to be called")
		}
		if res.Version != "1.7" {
			t.Errorf("expected brew install result version to be '1.7', got %q", res.Version)
		}
		logStr := logBuf.String()
		if !strings.Contains(logStr, "$ brew tap homebrew/core") {
			t.Errorf("expected log to contain '$ brew tap homebrew/core', got: %s", logStr)
		}
		if !strings.Contains(logStr, "$ brew install --force jq") {
			t.Errorf("expected log to contain '$ brew install --force jq', got: %s", logStr)
		}
		if strings.Contains(logStr, "Executing command:") {
			t.Errorf("expected log NOT to contain redundant 'Executing command:', got: %s", logStr)
		}
	})

	t.Run("Install cask success", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"iterm2","versions":{"stable":"3.4"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "iterm2",
			InstallParams: map[string]interface{}{
				"cask": true,
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		hasCask := false
		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "install" && cmd.Args[1] == "--cask" {
				hasCask = true
			}
		}
		if !hasCask {
			t.Error("expected brew install with --cask to be called")
		}
	})

	t.Run("Install success with trust args link and service", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"redis","versions":{"stable":"7.0"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "redis",
			InstallParams: map[string]interface{}{
				"formula": "redis",
				"trust":   "redis/tap",
				"args":    []string{"--build-from-source"},
				"link": map[string]interface{}{
					"overwrite": true,
					"force":     true,
				},
				"service": "start",
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		hasTrust := false
		hasInstallArgs := false
		hasLink := false
		hasService := false

		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "trust" && cmd.Args[1] == "redis/tap" {
				hasTrust = true
			}
			if len(cmd.Args) > 2 && cmd.Args[0] == "install" && cmd.Args[1] == "--build-from-source" {
				hasInstallArgs = true
			}
			if len(cmd.Args) > 3 && cmd.Args[0] == "link" && cmd.Args[1] == "--overwrite" && cmd.Args[2] == "--force" {
				hasLink = true
			}
			if len(cmd.Args) > 2 && cmd.Args[0] == "services" && cmd.Args[1] == "start" && cmd.Args[2] == "redis" {
				hasService = true
			}
		}

		if !hasTrust {
			t.Error("expected brew trust to be called")
		}
		if !hasInstallArgs {
			t.Error("expected brew install with custom args to be called")
		}
		if !hasLink {
			t.Error("expected brew link to be called")
		}
		if !hasService {
			t.Error("expected brew services to be called")
		}
	})

	t.Run("Install success with boolean trust: true", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"borders","versions":{"stable":"1.0"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "borders",
			InstallParams: map[string]interface{}{
				"formula": "borders",
				"tap":     "FelixKratz/formulae",
				"trust":   true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		hasTrust := false
		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "trust" && cmd.Args[1] == "FelixKratz/formulae" {
				hasTrust = true
			}
		}

		if !hasTrust {
			t.Error("expected brew trust FelixKratz/formulae to be called when trust: true")
		}
	})

	t.Run("Install success with boolean trust: true and multiple taps", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"borders","versions":{"stable":"1.0"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "borders",
			InstallParams: map[string]interface{}{
				"formula": "borders",
				"tap":     []interface{}{"tap1/formulae", "tap2/formulae"},
				"trust":   true,
			},
		}

		inst.SetFS(fsys)
		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		trustedTaps := map[string]bool{}
		for _, cmd := range runner.History {
			if len(cmd.Args) > 1 && cmd.Args[0] == "trust" {
				trustedTaps[cmd.Args[1]] = true
			}
		}

		if !trustedTaps["tap1/formulae"] || !trustedTaps["tap2/formulae"] {
			t.Errorf("expected both taps to be trusted, got %v", trustedTaps)
		}
	})

	t.Run("Install with boolean trust: false (default)", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"borders","versions":{"stable":"1.0"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "borders",
			InstallParams: map[string]interface{}{
				"formula": "borders",
				"tap":     "FelixKratz/formulae",
				"trust":   false,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		for _, cmd := range runner.History {
			if len(cmd.Args) > 0 && cmd.Args[0] == "trust" {
				t.Errorf("expected no brew trust command when trust: false, got: %v", cmd.Args)
			}
		}
	})

	t.Run("Install success with boolean service parameter", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"redis","versions":{"stable":"7.0"}}]`), nil)

		tool := &config.ToolConfig{
			Name: "redis",
			InstallParams: map[string]interface{}{
				"formula": "redis",
				"service": true,
			},
		}

		res, err := inst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res == nil {
			t.Fatal("expected non-nil result")
		}

		hasServiceStart := false
		for _, cmd := range runner.History {
			if len(cmd.Args) > 2 && cmd.Args[0] == "services" && cmd.Args[1] == "start" && cmd.Args[2] == "redis" {
				hasServiceStart = true
			}
		}

		if !hasServiceStart {
			t.Error("expected brew services start to be called for boolean service: true")
		}
	})

	t.Run("Uninstall success", func(t *testing.T) {
		runner.Clear()
		tool := &config.ToolConfig{
			Name: "jq",
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(runner.History) == 0 {
			t.Fatal("expected command to be executed")
		}
		cmd := runner.History[0]
		if filepath.Base(cmd.Name) != "brew" || cmd.Args[0] != "uninstall" || cmd.Args[1] != "jq" {
			t.Errorf("unexpected command: %s %v", cmd.Name, cmd.Args)
		}
	})

	t.Run("Uninstall with service stops service before uninstall", func(t *testing.T) {
		testCases := []struct {
			name       string
			serviceVal interface{}
		}{
			{"service bool true", true},
			{"service string start", "start"},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				runner.Clear()
				tool := &config.ToolConfig{
					Name: "redis",
					InstallParams: map[string]interface{}{
						"service": tc.serviceVal,
					},
				}

				err := inst.Uninstall(context.Background(), tool)
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}

				if len(runner.History) < 2 {
					t.Fatalf("expected at least 2 commands, got %d", len(runner.History))
				}

				cmdStop := runner.History[0]
				if filepath.Base(cmdStop.Name) != "brew" || len(cmdStop.Args) != 3 ||
					cmdStop.Args[0] != "services" || cmdStop.Args[1] != "stop" || cmdStop.Args[2] != "redis" {
					t.Errorf("expected brew services stop redis, got: %s %v", cmdStop.Name, cmdStop.Args)
				}

				cmdUninstall := runner.History[1]
				if filepath.Base(cmdUninstall.Name) != "brew" || len(cmdUninstall.Args) != 2 ||
					cmdUninstall.Args[0] != "uninstall" || cmdUninstall.Args[1] != "redis" {
					t.Errorf("expected brew uninstall redis, got: %s %v", cmdUninstall.Name, cmdUninstall.Args)
				}
			})
		}
	})

	t.Run("Uninstall tolerates service stop failure", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
			if len(c.Args) >= 2 && c.Args[0] == "services" && c.Args[1] == "stop" {
				return errors.New("service not running")
			}
			return nil
		})

		tool := &config.ToolConfig{
			Name: "redis",
			InstallParams: map[string]interface{}{
				"service": true,
			},
		}

		err := inst.Uninstall(context.Background(), tool)
		if err != nil {
			t.Fatalf("expected uninstall to succeed despite service stop error, got: %v", err)
		}

		if len(runner.History) < 2 {
			t.Fatalf("expected at least 2 commands, got %d", len(runner.History))
		}

		cmdUninstall := runner.History[1]
		if filepath.Base(cmdUninstall.Name) != "brew" || len(cmdUninstall.Args) != 2 ||
			cmdUninstall.Args[0] != "uninstall" || cmdUninstall.Args[1] != "redis" {
			t.Errorf("expected brew uninstall redis, got: %s %v", cmdUninstall.Name, cmdUninstall.Args)
		}
	})

	t.Run("CheckUpdate success", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"jq","versions":{"stable":"1.7"},"installed":[{"version":"1.7"}]}]`), nil)

		tool := &config.ToolConfig{
			Name: "jq",
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.LatestVersion != "1.7" {
			t.Errorf("expected version 1.7, got %s", res.LatestVersion)
		}
	})

	t.Run("CheckUpdate cask v2 success", func(t *testing.T) {
		runner.Clear()
		caskJSON := []byte(`{"formulae":[],"casks":[{"token":"signal","version":"8.27.0","installed":"8.27.0","outdated":false}]}`)
		runner.Register("brew", caskJSON, nil)

		tool := &config.ToolConfig{
			Name: "signal",
			InstallParams: map[string]interface{}{
				"cask": true,
			},
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.LatestVersion != "8.27.0" {
			t.Errorf("expected version 8.27.0, got %s", res.LatestVersion)
		}
		if res.Outdated == nil || *res.Outdated {
			t.Error("expected brew to report the formula as not outdated")
		}
	})

	// A failed query and an answer with no version in it are errors, never an empty
	// result that callers read as "up to date" (issue #120).
	t.Run("CheckUpdate fails when brew info fails", func(t *testing.T) {
		runner.Clear()
		registerQuery(runner, "brew", "", "Error: No available formula with the name \"unknown-pkg\".\n", exitStatusError(1))

		res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "unknown-pkg"})
		assertCheckFailed(t, res, err, "running brew info --json=v2 unknown-pkg", "exit status 1", `No available formula with the name "unknown-pkg"`)
	})

	// A cask tool retries the query without --cask, and reports the cask query's
	// failure when the retry fails as well.
	for _, formulaWorks := range []bool{true, false} {
		name := "CheckUpdate falls back to a formula query when the cask query fails"
		if !formulaWorks {
			name = "CheckUpdate reports the cask query when the formula query fails too"
		}
		t.Run(name, func(t *testing.T) {
			runner.Clear()
			runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
				if slices.Contains(c.Args, "--cask") {
					_, _ = io.WriteString(c.Stderr(), "Error: Cask 'signal' is unavailable\n")
					return exitStatusError(1)
				}
				if !formulaWorks {
					_, _ = io.WriteString(c.Stderr(), "Error: No available formula with the name \"signal\".\n")
					return exitStatusError(1)
				}
				c.SetOutput([]byte(`{"formulae":[{"name":"signal","versions":{"stable":"8.27.0"},"installed":[{"version":"8.26.0"}],"outdated":true}],"casks":[]}`))
				return nil
			})

			tool := &config.ToolConfig{Name: "signal", InstallParams: map[string]interface{}{"cask": true}}
			res, err := inst.CheckUpdate(context.Background(), tool)
			if !formulaWorks {
				assertCheckFailed(t, res, err, "running brew info --json=v2 --cask signal", "Cask 'signal' is unavailable")
				return
			}
			if err != nil {
				t.Fatalf("CheckUpdate() error = %v", err)
			}
			if res.LatestVersion != "8.27.0" || res.Outdated == nil || !*res.Outdated {
				t.Errorf("CheckUpdate() = %+v, want 8.27.0 reported as outdated", res)
			}
		})
	}

	// brew info describes a formula or cask that is not installed as current
	// (outdated: false), so an empty installation is a failed check, not a verdict. The
	// shapes are what Homebrew prints: `installed: []` for a formula, null for a cask.
	notInstalled := []struct {
		name   string
		params map[string]interface{}
		output string
	}{
		{name: "formula", output: `{"formulae":[{"name":"cowsay","versions":{"stable":"3.8.4"},"installed":[],"outdated":false}],"casks":[]}`},
		{name: "cask", params: map[string]interface{}{"cask": true}, output: `{"formulae":[],"casks":[{"token":"cowsay","version":"156.0.1","installed":null,"outdated":false}]}`},
		{name: "formula in the v1 shape", output: `[{"name":"cowsay","versions":{"stable":"3.8.4"},"installed":[],"outdated":false}]`},
	}
	for _, tt := range notInstalled {
		t.Run("CheckUpdate fails for a "+tt.name+" that is not installed", func(t *testing.T) {
			runner.Clear()
			runner.Register("brew", []byte(tt.output), nil)

			res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "cowsay", InstallParams: tt.params})
			assertCheckFailed(t, res, err, "brew package cowsay is not installed: brew info reports no installed version")
		})
	}

	t.Run("CheckUpdate names the brew executable that ran", func(t *testing.T) {
		const brewPath = "/home/linuxbrew/.linuxbrew/bin/brew"
		brewFS := fs.NewMemFS()
		if err := brewFS.MkdirAll(filepath.Dir(brewPath), 0755); err != nil {
			t.Fatalf("creating brew directory: %v", err)
		}
		if err := brewFS.WriteFile(brewPath, []byte("#!/bin/sh\n"), 0755); err != nil {
			t.Fatalf("writing brew: %v", err)
		}
		brewRunner := exec.NewMockRunner()
		registerQuery(brewRunner, brewPath, "", "Error: No available formula with the name \"jq\".\n", exitStatusError(1))

		res, err := NewBrewInstaller(brewRunner, brewFS, nil).CheckUpdate(context.Background(), &config.ToolConfig{Name: "jq"})
		assertCheckFailed(t, res, err, "running "+brewPath+" info --json=v2 jq")
	})

	t.Run("CheckUpdate fails when brew info names no version", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`{"formulae":[{"name":"jq","versions":{"stable":""}}],"casks":[]}`), nil)

		res, err := inst.CheckUpdate(context.Background(), &config.ToolConfig{Name: "jq"})
		assertCheckFailed(t, res, err, "no version found for brew package jq")
	})

	t.Run("Install error tap fails", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "tap" {
				return errors.New("tap failed")
			}
			return nil
		})

		tool := &config.ToolConfig{
			Name: "jq",
			InstallParams: map[string]interface{}{
				"tap": "broken/tap",
			},
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})

	t.Run("Install error install fails", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
			if len(c.Args) > 0 && c.Args[0] == "install" {
				return errors.New("install failed")
			}
			return nil
		})

		tool := &config.ToolConfig{
			Name: "jq",
		}

		_, err := inst.Install(context.Background(), tool)
		if err == nil {
			t.Error("expected error but got nil")
		}
	})

	t.Run("Brew executable resolution in /opt/homebrew/bin", func(t *testing.T) {
		optFS := fs.NewMemFS()
		_ = optFS.MkdirAll("/opt/homebrew/bin", 0755)
		_ = optFS.WriteFile("/opt/homebrew/bin/brew", []byte("#!/bin/sh"), 0755)
		_ = optFS.WriteFile("/opt/homebrew/bin/borders", []byte("#!/bin/sh"), 0755)

		optRunner := exec.NewMockRunner()
		var capturedEnv []string
		optRunner.RegisterFunc("/opt/homebrew/bin/brew", func(c *exec.MockCmd) error {
			capturedEnv = c.Env()
			return nil
		})

		optInst := NewBrewInstaller(optRunner, optFS, nil)

		tool := &config.ToolConfig{
			Name:     "borders",
			Binaries: testutil.DeclaredBinaries("borders"),
			InstallParams: map[string]interface{}{
				"tap": "FelixKratz/formulae",
			},
		}

		res, err := optInst.Install(context.Background(), tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Binaries) != 1 || res.Binaries[0] != "/opt/homebrew/bin/borders" {
			t.Errorf("expected binary at /opt/homebrew/bin/borders, got: %v", res.Binaries)
		}

		hasOptInEnv := false
		envList := capturedEnv
		if len(envList) == 0 {
			envList = os.Environ()
		}
		for _, env := range envList {
			if strings.HasPrefix(env, "PATH=") && strings.Contains(env, "/opt/homebrew/bin") {
				hasOptInEnv = true
				break
			}
		}
		if !hasOptInEnv {
			t.Errorf("expected /opt/homebrew/bin to be in command PATH environment")
		}
	})

	t.Run("Failed command pipes error output with | prefix", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", nil, errors.New("exec: \"brew\": executable file not found in $PATH"))

		var testLogBuf bytes.Buffer
		testLog := logger.New(logger.Config{Writer: &testLogBuf, Level: logger.LogLevelDefault})
		failInst := NewBrewInstaller(runner, fsys, NewDefaultSystemContext())
		failInst.SetLogger(testLog)

		tool := &config.ToolConfig{
			Name: "borders",
			InstallParams: map[string]interface{}{
				"tap": "FelixKratz/formulae",
			},
		}

		_, err := failInst.Install(context.Background(), tool)
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		logStr := testLogBuf.String()
		if !strings.Contains(logStr, "$ brew tap FelixKratz/formulae") {
			t.Errorf("expected log to contain '$ brew tap FelixKratz/formulae', got:\n%s", logStr)
		}
		if !strings.Contains(logStr, "| exec: \"brew\": executable file not found in $PATH") {
			t.Errorf("expected piped error '| exec: \"brew\": executable file not found in $PATH', got:\n%s", logStr)
		}
	})
}

// TestBrewInstallerLinkParameter pins the v1 contract for `link`: a truthy
// boolean or an options object runs `brew link`, while false or an omitted key
// runs nothing (issue #34).
func TestBrewInstallerLinkParameter(t *testing.T) {
	tests := []struct {
		name         string
		params       map[string]interface{}
		wantLinkArgs []string
	}{
		{
			name:         "link true runs brew link",
			params:       map[string]interface{}{"formula": "jq", "link": true},
			wantLinkArgs: []string{"link", "jq"},
		},
		{
			name: "link object adds overwrite and force flags",
			params: map[string]interface{}{
				"formula": "jq",
				"link":    map[string]interface{}{"overwrite": true, "force": true},
			},
			wantLinkArgs: []string{"link", "--overwrite", "--force", "jq"},
		},
		{
			name:         "link false does not run brew link",
			params:       map[string]interface{}{"formula": "jq", "link": false},
			wantLinkArgs: nil,
		},
		{
			name:         "link omitted does not run brew link",
			params:       map[string]interface{}{"formula": "jq"},
			wantLinkArgs: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := exec.NewMockRunner()
			runner.Register("brew", []byte(`[{"name":"jq","versions":{"stable":"1.7"}}]`), nil)
			inst := NewBrewInstaller(runner, fs.NewMemFS(), NewDefaultSystemContext())

			if _, err := inst.Install(context.Background(), &config.ToolConfig{Name: "jq", InstallParams: tt.params}); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			var gotLinkArgs []string
			for _, cmd := range runner.History {
				if len(cmd.Args) > 0 && cmd.Args[0] == "link" {
					if gotLinkArgs != nil {
						t.Fatalf("brew link ran more than once: %v", runner.History)
					}
					gotLinkArgs = cmd.Args
				}
			}
			if strings.Join(gotLinkArgs, " ") != strings.Join(tt.wantLinkArgs, " ") {
				t.Fatalf("brew link args = %v, want %v", gotLinkArgs, tt.wantLinkArgs)
			}
		})
	}
}
