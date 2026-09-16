package installer

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

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

	t.Run("CheckUpdate success", func(t *testing.T) {
		runner.Clear()
		runner.Register("brew", []byte(`[{"name":"jq","versions":{"stable":"1.7"}}]`), nil)

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
		if res.HasUpdate {
			t.Error("expected hasUpdate to be false")
		}
	})

	t.Run("CheckUpdate error graceful fallback", func(t *testing.T) {
		runner.Clear()
		runner.RegisterFunc("brew", func(c *exec.MockCmd) error {
			return errors.New("exit status 1")
		})

		tool := &config.ToolConfig{
			Name: "unknown-pkg",
		}

		res, err := inst.CheckUpdate(context.Background(), tool)
		if err != nil {
			t.Fatalf("expected graceful fallback on error, got error: %v", err)
		}
		if res.HasUpdate {
			t.Error("expected hasUpdate to be false on error")
		}
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
			Name: "borders",
			Binaries: []interface{}{"borders"},
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
