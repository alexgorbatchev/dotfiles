package orchestrator

import (
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// TestSymlinkAndCopyPlaceholdersResolved pins that createSymlinks and applyCopies
// resolve path placeholders (such as {paths.homeDir}) in target paths rather than
// treating them as literal relative paths under the cwd, and expands leading ~.
func TestSymlinkAndCopyPlaceholdersResolved(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		pipeline string
		op       string // "symlink" or "copy"
		target   string
		wantPath string
	}{
		{
			name:     "generate symlink with {paths.homeDir}",
			pipeline: "generate",
			op:       "symlink",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "install symlink with {paths.homeDir}",
			pipeline: "install",
			op:       "symlink",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "generate symlink with tilde",
			pipeline: "generate",
			op:       "symlink",
			target:   "~/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "generate copy with {paths.homeDir}",
			pipeline: "generate",
			op:       "copy",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "install copy with {paths.homeDir}",
			pipeline: "install",
			op:       "copy",
			target:   "{paths.homeDir}/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
		{
			name:     "generate copy with tilde",
			pipeline: "generate",
			op:       "copy",
			target:   "~/.config/test-tool/config.yml",
			wantPath: "/home/user/.config/test-tool/config.yml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := newMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			if err := orch.instRegistry.Register(&mockInstaller{name: "mock-method"}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}

			sourcePath := "/home/user/tools/test-tool/config.yml"
			writeMemFile(t, memFS, sourcePath, "managed content")

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/.generated/bin",
					BinariesDir:  "/home/user/.generated/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}

			tool := &config.ToolConfig{
				Name:           "test-tool",
				ConfigFilePath: "/home/user/tools/test-tool/test-tool.tool.ts",
			}
			if tt.pipeline == "install" {
				tool.InstallationMethod = "mock-method"
			}

			if tt.op == "symlink" {
				tool.Symlinks = []config.SymlinkConfig{{Source: "./config.yml", Target: tt.target}}
			} else {
				tool.Copies = []config.CopyConfig{{Source: "./config.yml", Target: tt.target}}
			}

			var err error
			if tt.pipeline == "install" {
				err = orch.InstallTool(ctx, tool, projCfg)
			} else {
				err = orch.GenerateTool(ctx, tool, projCfg)
			}
			if err != nil {
				t.Fatalf("%s failed: %v", tt.pipeline, err)
			}

			// The file/symlink should exist at tt.wantPath
			exists, err := memFS.Exists(tt.wantPath)
			if err != nil || !exists {
				t.Fatalf("expected file at %s, exists=%v, err=%v", tt.wantPath, exists, err)
			}

			// It should NOT exist under cwd relative path like {paths.homeDir}/...
			cwdTarget, err := memFS.Abs(tt.target)
			if err == nil && cwdTarget != tt.wantPath {
				if exists, _ := memFS.Exists(cwdTarget); exists {
					t.Errorf("found artifact at cwd path %s", cwdTarget)
				}
			}

			// CleanupStale should not consider it stale
			if tt.op == "symlink" {
				if err := orch.CleanupStaleSymlinks(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
					t.Fatalf("CleanupStaleSymlinks failed: %v", err)
				}
			} else {
				if err := orch.CleanupStaleCopies(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
					t.Fatalf("CleanupStaleCopies failed: %v", err)
				}
			}
			if exists, _ := memFS.Exists(tt.wantPath); !exists {
				t.Errorf("cleanup removed valid artifact at %s", tt.wantPath)
			}
		})
	}
}

// TestSymlinkAndCopyRejectsUnresolvablePlaceholder pins that an unresolvable placeholder
// in .symlink() or .copy() target fails the pipeline naming the tool, target, and token.
func TestSymlinkAndCopyRejectsUnresolvablePlaceholder(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		pipeline string
		op       string // "symlink" or "copy"
		target   string
	}{
		{name: "generate symlink", pipeline: "generate", op: "symlink", target: "{configFileDir}/tool.conf"},
		{name: "install symlink", pipeline: "install", op: "symlink", target: "{configFileDir}/tool.conf"},
		{name: "generate copy", pipeline: "generate", op: "copy", target: "{configFileDir}/tool.conf"},
		{name: "install copy", pipeline: "install", op: "copy", target: "{configFileDir}/tool.conf"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := newMemFS()
			orch := newTestOrchestrator(t, memFS, "")
			if err := orch.instRegistry.Register(&mockInstaller{name: "mock-method"}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}

			sourcePath := "/home/user/tools/test-tool/config.yml"
			writeMemFile(t, memFS, sourcePath, "managed content")

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/.generated/bin",
					BinariesDir:  "/home/user/.generated/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}

			tool := &config.ToolConfig{
				Name:           "test-tool",
				ConfigFilePath: "/home/user/tools/test-tool/test-tool.tool.ts",
			}
			if tt.pipeline == "install" {
				tool.InstallationMethod = "mock-method"
			}

			if tt.op == "symlink" {
				tool.Symlinks = []config.SymlinkConfig{{Source: "./config.yml", Target: tt.target}}
			} else {
				tool.Copies = []config.CopyConfig{{Source: "./config.yml", Target: tt.target}}
			}

			var err error
			if tt.pipeline == "install" {
				err = orch.InstallTool(ctx, tool, projCfg)
			} else {
				err = orch.GenerateTool(ctx, tool, projCfg)
			}
			if err == nil {
				t.Fatalf("%s = nil, want it to fail on unresolvable placeholder in target", tt.pipeline)
			}

			for _, want := range []string{"test-tool", "{configFileDir}"} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("%s error = %v, want it to contain %q", tt.pipeline, err, want)
				}
			}

			cwdTarget, _ := memFS.Abs(tt.target)
			if exists, _ := memFS.Exists(cwdTarget); exists {
				t.Errorf("artifact was created under cwd at %s", cwdTarget)
			}
		})
	}
}
