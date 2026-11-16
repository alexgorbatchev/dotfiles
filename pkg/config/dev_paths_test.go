package config

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestDevelopmentStorageAllowsIndependentDirectories(t *testing.T) {
	root := t.TempDir()
	for _, tc := range []struct {
		name  string
		paths PathsConfig
	}{
		{"default", PathsConfig{}},
		{"custom location", PathsConfig{DevToolsDir: "local-development"}},
		{"nested in generated", PathsConfig{DevToolsDir: "{paths.generatedDir}/local/development"}},
		{"shared prefix only", PathsConfig{TargetDir: "bin", DevToolsDir: "bin-more"}},
		{"shared prefix reversed", PathsConfig{TargetDir: "bin-more", DevToolsDir: "bin"}},
		{"shims in project root", PathsConfig{TargetDir: root}},
		{"dedicated directory inside shim directory", PathsConfig{DevToolsDir: "{paths.targetDir}/local-dev"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			project := &ProjectConfig{Paths: tc.paths}
			if err := project.ResolvePlaceholders(root); err != nil {
				t.Fatalf("independent directory rejected: %v", err)
			}
		})
	}
	if err := (&ProjectConfig{}).ValidateDevToolsDir(); err != nil {
		t.Fatalf("unresolved empty directory: %v", err)
	}
}

func TestDevelopmentStorageRejectsManagedTreeOverlap(t *testing.T) {
	root := t.TempDir()
	for _, managed := range []struct {
		name  string
		paths PathsConfig
		path  string
	}{
		{"binaries", PathsConfig{BinariesDir: filepath.Join(root, "managed", "binaries")}, filepath.Join(root, "managed", "binaries")},
		{"shims", PathsConfig{TargetDir: filepath.Join(root, "managed", "bin")}, filepath.Join(root, "managed", "bin")},
		{"shell scripts", PathsConfig{ShellScriptsDir: filepath.Join(root, "managed", "shell-scripts")}, filepath.Join(root, "managed", "shell-scripts")},
		{"generated types", PathsConfig{GeneratedDir: filepath.Join(root, "generated")}, filepath.Join(root, "generated", "node_modules")},
		{"cache", PathsConfig{GeneratedDir: filepath.Join(root, "generated")}, filepath.Join(root, "generated", "cache")},
		{"usage", PathsConfig{GeneratedDir: filepath.Join(root, "generated")}, filepath.Join(root, "generated", "usage")},
	} {
		for _, relation := range []struct{ name, path string }{
			{"equal", managed.path},
			{"descendant", filepath.Join(managed.path, "dev")},
			{"ancestor", filepath.Dir(managed.path)},
		} {
			if managed.name == "shims" && relation.name == "descendant" {
				continue
			}
			t.Run(managed.name+"/"+relation.name, func(t *testing.T) {
				project := &ProjectConfig{Paths: managed.paths}
				project.Paths.DevToolsDir = relation.path
				err := project.ValidateDevToolsDir()
				if err == nil || !strings.Contains(err.Error(), "paths.devToolsDir") || !strings.Contains(err.Error(), "overlaps managed directory") {
					t.Fatalf("overlapping development storage accepted: %v", err)
				}
			})
		}
	}
}

func TestDevelopmentStorageOverlapIsRejectedAfterPlaceholderResolution(t *testing.T) {
	project := &ProjectConfig{Paths: PathsConfig{DevToolsDir: "{paths.binariesDir}/local-dev"}}
	err := project.ResolvePlaceholders(t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "paths.binariesDir") {
		t.Fatalf("resolved overlap accepted: %v", err)
	}
}
