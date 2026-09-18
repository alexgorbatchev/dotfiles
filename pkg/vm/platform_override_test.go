package vm

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// The v1 project configuration shape: an Apple Silicon machine puts its shims where
// Homebrew does, everything else keeps the default.
const platformOverrideConfig = `
import { defineConfig } from "@alexgorbatchev/dotfiles";
export default defineConfig(({ configFileDir }) => ({
  paths: {
    dotfilesDir: configFileDir,
    targetDir: "/usr/local/bin",
  },
  platform: [
    {
      match: [{ os: "macos", arch: "arm64" }],
      config: { paths: { targetDir: "/opt/homebrew/bin" } },
    },
    {
      match: [{ os: "linux" }],
      config: { system: { sudoPrompt: "linux sudo:" } },
    },
  ],
}));`

// A tool that reports the project paths it was handed, so the test can check that a
// tool file observes the same resolved configuration Go does.
const projectPathsProbeTool = `
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install, ctx) =>
  install("manual", { targetDir: ctx.projectConfig.paths.targetDir }),
);`

// loadProjectSource loads config, with the given tool as the only tool file, for
// the given target.
func loadProjectSource(t *testing.T, configSource, toolSource string, opts ...Option) (*config.ProjectConfig, map[string]*config.ToolConfig, error) {
	t.Helper()

	tmpDir := t.TempDir()
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolsDir, "probe.tool.ts"), []byte(toolSource), 0644); err != nil {
		t.Fatalf("writing tool: %v", err)
	}
	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	if err := os.WriteFile(configPath, []byte(configSource), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	return LoadTypeScriptConfig(logger.New(logger.Config{Writer: io.Discard}), fs.NewOSFS(), configPath, opts...)
}

// Project-level platform overrides are matched against the same target as tool-level
// .platform() blocks, so --platform/--arch steer both, and the tool context sees the
// configuration with the overrides already folded in.
func TestProjectPlatformOverridesFollowTarget(t *testing.T) {
	tests := []struct {
		name           string
		targetOS       string
		targetArch     string
		wantTargetDir  string
		wantSudoPrompt string
	}{
		{name: "apple silicon", targetOS: "darwin", targetArch: "arm64", wantTargetDir: "/opt/homebrew/bin"},
		{name: "intel mac keeps the default", targetOS: "darwin", targetArch: "amd64", wantTargetDir: "/usr/local/bin"},
		{name: "linux matches the os-only override", targetOS: "linux", targetArch: "arm64", wantTargetDir: "/usr/local/bin", wantSudoPrompt: "linux sudo:"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			projCfg, toolConfigs, err := loadProjectSource(t, platformOverrideConfig, projectPathsProbeTool, WithTarget(Target{OS: tt.targetOS, Arch: tt.targetArch}))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			if projCfg.Paths.TargetDir != tt.wantTargetDir {
				t.Errorf("Paths.TargetDir = %q, want %q", projCfg.Paths.TargetDir, tt.wantTargetDir)
			}
			if projCfg.System.SudoPrompt != tt.wantSudoPrompt {
				t.Errorf("System.SudoPrompt = %q, want %q", projCfg.System.SudoPrompt, tt.wantSudoPrompt)
			}

			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			if got := tool.InstallParams["targetDir"]; got != tt.wantTargetDir {
				t.Errorf("tool context targetDir = %v, want %q (Go resolved %q)", got, tt.wantTargetDir, projCfg.Paths.TargetDir)
			}
		})
	}
}

// A section with the right name but the wrong kind of value passes the key check and is
// caught when the resolved JSON is decoded into the typed configuration.
func TestProjectConfigSectionOfWrongTypeIsRejected(t *testing.T) {
	_, _, err := loadProjectSource(t, `export default { paths: "nope" };`, projectPathsProbeTool)
	if err == nil {
		t.Fatal("expected loading to fail")
	}
	if !strings.Contains(err.Error(), "unmarshaling JSON to ProjectConfig struct") {
		t.Errorf("unexpected error: %v", err)
	}
}

// A loader result whose tool map is not an object is rejected when the envelope is
// decoded, before any project configuration is looked at.
func TestEvaluateUnifiedBundleRejectsMalformedToolConfigs(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/tmp/.gen", BinariesDir: "/tmp/bin"}}

	_, err := evaluateUnifiedBundle(log, fs.NewMemFS(), "globalThis.__loaderResult = { toolConfigs: 12345 };", "/tmp", projCfg, Target{})
	if err == nil {
		t.Fatal("expected evaluateUnifiedBundle to fail")
	}
	if !strings.Contains(err.Error(), "unmarshaling loader result") {
		t.Errorf("unexpected error: %v", err)
	}
}

// A bundle whose configuration file exported nothing has no project configuration to
// resolve, and the loader result says so with a nil pointer rather than an error.
func TestEvaluateUnifiedBundleWithoutProjectConfig(t *testing.T) {
	log := logger.New(logger.Config{Writer: io.Discard})
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{GeneratedDir: "/tmp/.gen", BinariesDir: "/tmp/bin"}}

	for name, script := range map[string]string{
		"absent": "globalThis.__loaderResult = { toolConfigs: {} };",
		"null":   "globalThis.__loaderResult = { projectConfig: null, toolConfigs: {} };",
	} {
		t.Run(name, func(t *testing.T) {
			res, err := evaluateUnifiedBundle(log, fs.NewMemFS(), script, "/tmp", projCfg, Target{})
			if err != nil {
				t.Fatalf("evaluateUnifiedBundle failed: %v", err)
			}
			if res.ProjectConfig != nil {
				t.Errorf("expected no project config, got %+v", res.ProjectConfig)
			}
		})
	}
}

// A matcher outside the v1 vocabulary is a configuration mistake and is reported at
// load time rather than silently never matching.
func TestProjectPlatformOverrideMatcherIsValidated(t *testing.T) {
	const badMatcher = `
export default {
  paths: { targetDir: "/usr/local/bin" },
  platform: [{ match: [{ platform: "darwin", arch: "arm64" }], config: {} }],
};`

	_, _, err := loadProjectSource(t, badMatcher, projectPathsProbeTool, WithTarget(Target{OS: "darwin", Arch: "arm64"}))
	if err == nil {
		t.Fatal("expected loading to fail")
	}
	want := `unknown property "platform[0].match[0].platform"`
	if !strings.Contains(err.Error(), want) {
		t.Errorf("expected an error mentioning %q, got: %v", want, err)
	}
}
