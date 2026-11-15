package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestBootstrapAndExecutionSideEffects(t *testing.T) {
	t.Setenv("DOTFILES_DRY_RUN", "true")
	ctx := context.Background()
	// Force dryRun = true for in-memory DB and MemFS simulation, and put it back so
	// later direct BootstrapServices calls do not silently run in memory.
	previousDryRun := dryRun
	dryRun = true
	t.Cleanup(func() { dryRun = previousDryRun })
	services, err := BootstrapServices(ctx, filepath.Join(findRepoRoot(), "test-project/dotfiles.config.ts"))
	if err != nil {
		t.Fatalf("bootstrap failed: %v", err)
	}
	defer services.DB.Close()

	if services.ProjectConfig.Paths.HomeDir == "" {
		t.Errorf("expected loaded config, got empty HomeDir")
	}

	if len(services.ToolConfigs) != 18 {
		t.Errorf("expected exactly 18 tool configurations to be successfully loaded natively, but got %d", len(services.ToolConfigs))
	}

	// Run install tools on orchestrator
	err = services.Orchestrator.InstallTools(ctx, services.ToolConfigs, services.ProjectConfig)
	if err != nil {
		t.Fatalf("orchestrator install failed: %v", err)
	}

	// Assert database mutations occurred!
	ops, err := services.Registry.GetFileOperations(ctx, registry.FileOperationFilter{})
	if err != nil {
		t.Fatalf("failed to query registry operations: %v", err)
	}
	if len(ops) == 0 {
		t.Errorf("expected registry database mutations (file operations recorded), got 0")
	}

	// Assert filesystem side-effects in MemFS!
	exists, err := services.FS.Exists(filepath.Join(services.ProjectConfig.Paths.TargetDir, "bat"))
	if err != nil {
		t.Fatalf("FS check failed: %v", err)
	}
	if !exists {
		t.Errorf("expected target shim 'bat' to be created in MemFS, but it is missing")
	}
}

func TestObjectBasedBinaryMatching(t *testing.T) {
	// Test tool config with object binary representation
	tool := &config.ToolConfig{
		Name: "my-tool",
		Binaries: []any{
			map[string]any{
				"name": "my-bin",
			},
		},
		Dependencies: []string{"fnm"},
	}

	// We have dependency "fnm", which should resolve to "curl-script--fnm" since curl-script--fnm provides fnm
	toolConfigs := []*config.ToolConfig{
		tool,
		{
			Name: "curl-script--fnm",
			Binaries: []any{
				map[string]any{
					"name": "fnm",
				},
			},
		},
	}

	// Map binary dependencies to fully-qualified tool names
	for _, tc := range toolConfigs {
		for idx, dep := range tc.Dependencies {
			foundProvider := false
			for _, provider := range toolConfigs {
				if provider.Name == dep || strings.HasSuffix(provider.Name, "--"+dep) {
					tc.Dependencies[idx] = provider.Name
					foundProvider = true
					break
				}
				for _, b := range provider.Binaries {
					switch val := b.(type) {
					case string:
						if val == dep {
							tc.Dependencies[idx] = provider.Name
							foundProvider = true
							break
						}
					case map[string]interface{}:
						if bName, ok := val["name"].(string); ok && bName == dep {
							tc.Dependencies[idx] = provider.Name
							foundProvider = true
							break
						}
					}
				}
				if foundProvider {
					break
				}
			}
		}
	}

	if tool.Dependencies[0] != "curl-script--fnm" {
		t.Errorf("expected dependency 'fnm' to be resolved to 'curl-script--fnm', got %q", tool.Dependencies[0])
	}
}

func TestDefaultConfigResolution(t *testing.T) {
	createTempConfigDir(t)

	ctx := context.Background()
	services, err := BootstrapServices(ctx, "")
	if err != nil {
		t.Fatalf("expected BootstrapServices with empty configPath to resolve default config, got error: %v", err)
	}
	defer services.DB.Close()

	if services.ProjectConfig == nil {
		t.Fatalf("expected non-nil ProjectConfig")
	}
}

func TestCandidateFallbackSearch(t *testing.T) {
	candidates := []string{
		"dotfiles.config.ts",
		".dotfiles.config.ts",
		"dotfiles.config.js",
		".dotfiles.config.js",
	}

	for _, candName := range candidates {
		t.Run("finds "+candName, func(t *testing.T) {
			tmpDir := t.TempDir()
			origDir, _ := os.Getwd()
			_ = os.Chdir(tmpDir)
			defer os.Chdir(origDir)

			filePath := filepath.Join(tmpDir, candName)
			content := `export default { paths: { ` + projectPathsTS(tmpDir) + ` } };`
			_ = os.WriteFile(filePath, []byte(content), 0644)

			ctx := context.Background()
			services, err := BootstrapServices(ctx, "")
			if err != nil {
				t.Fatalf("failed resolving default config for %s: %v", candName, err)
			}
			services.DB.Close()
			if services.ProjectConfig == nil {
				t.Errorf("expected non-nil ProjectConfig for %s", candName)
			}
		})
	}
}

func TestRelativeConfigPathResolution(t *testing.T) {
	tmpDir := t.TempDir()
	origDir, _ := os.Getwd()
	_ = os.Chdir(tmpDir)
	defer os.Chdir(origDir)

	subDir := filepath.Join(tmpDir, "sub")
	_ = os.MkdirAll(subDir, 0755)

	cfgPath := filepath.Join(subDir, "custom.config.ts")
	content := `export default { paths: { ` + projectPathsTS(tmpDir) + ` } };`
	_ = os.WriteFile(cfgPath, []byte(content), 0644)

	ctx := context.Background()
	// Pass relative path "sub/custom.config.ts"
	services, err := BootstrapServices(ctx, "sub/custom.config.ts")
	if err != nil {
		t.Fatalf("failed resolving relative path from cwd: %v", err)
	}
	services.DB.Close()
	if services.ProjectConfig == nil {
		t.Errorf("expected non-nil ProjectConfig")
	}
}

// A tool is named after its file.
func TestBootstrapServices_ToolNameFromFileName(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := writeTSProject(t, tmpDir, `"paths": {`+projectPathsTS(tmpDir)+`}`,
		tsTools{"implicit-name-tool": `install("github-release", { repo: "acme/implicit" })`})

	ctx := context.Background()
	services, err := BootstrapServices(ctx, configPath)
	if err != nil {
		t.Fatalf("BootstrapServices failed: %v", err)
	}
	defer services.DB.Close()

	if len(services.ToolConfigs) != 1 {
		t.Fatalf("expected 1 tool config, got %d", len(services.ToolConfigs))
	}
	if services.ToolConfigs[0].Name != "implicit-name-tool" {
		t.Errorf("expected tool name 'implicit-name-tool', got %q", services.ToolConfigs[0].Name)
	}
}

func TestBootstrapServices_DependencyResolution(t *testing.T) {
	writeConfig := func(t *testing.T, tools tsTools) string {
		t.Helper()
		dir := t.TempDir()
		return writeTSProject(t, dir, `"paths": {`+projectPathsTS(dir)+`}`, tools)
	}

	t.Run("a binary provided by two tools is ambiguous", func(t *testing.T) {
		path := writeConfig(t, tsTools{
			"alpha": `install().bin("shared")`,
			"beta":  `install().bin("shared")`,
			"user":  `install().dependsOn("shared")`,
		})
		_, err := BootstrapServices(context.Background(), path)
		if err == nil || !strings.Contains(err.Error(), `ambiguous dependency: binary "shared" is provided by multiple tools: alpha, beta`) {
			t.Fatalf("error = %v, want the ambiguity report naming both providers", err)
		}
	})

	t.Run("dependencies resolve to the providing tool", func(t *testing.T) {
		path := writeConfig(t, tsTools{
			"object-provider":  `install().bin("objbin")`,
			"curl-script--fnm": `install()`,
			"user":             `install().dependsOn("objbin", "fnm", "unknown-dep")`,
		})
		services, err := BootstrapServices(context.Background(), path)
		if err != nil {
			t.Fatalf("BootstrapServices: %v", err)
		}
		defer services.DB.Close()
		user := config.FindTool(services.ToolConfigs, "user")
		if user == nil {
			t.Fatal("user tool missing")
		}
		want := []string{"object-provider", "curl-script--fnm", "unknown-dep"}
		if !slices.Equal(user.Dependencies, want) {
			t.Fatalf("dependencies = %v, want %v", user.Dependencies, want)
		}
	})
}

func TestBootstrapServices_DiscoveryAndFailures(t *testing.T) {
	t.Run("falls back to the repository root for the default config", func(t *testing.T) {
		repoRoot := t.TempDir()
		configPath := writeTSProject(t, repoRoot, fmt.Sprintf(`"paths": {"homeDir": %q, "generatedDir": %q}`,
			filepath.ToSlash(filepath.Join(repoRoot, "home")), filepath.ToSlash(filepath.Join(repoRoot, "generated"))), nil)
		enterTempDir(t)
		t.Setenv("DOTFILES_REPO_ROOT", repoRoot)

		services, err := BootstrapServices(context.Background(), "")
		if err != nil {
			t.Fatalf("BootstrapServices: %v", err)
		}
		defer services.DB.Close()
		if services.ConfigPath != configPath {
			t.Fatalf("ConfigPath = %q, want %q", services.ConfigPath, configPath)
		}
	})

	t.Run("a configuration that does not compile is reported", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "dotfiles.config.ts")
		if err := os.WriteFile(path, []byte("export default {"), 0644); err != nil {
			t.Fatalf("writing config: %v", err)
		}
		_, err := BootstrapServices(context.Background(), path)
		if err == nil || !strings.Contains(err.Error(), "loading dotfiles.config.ts: compiling project config") {
			t.Fatalf("error = %v, want compile failure", err)
		}
	})

	t.Run("an unusable registry location is reported", func(t *testing.T) {
		// Other tests flip the dryRun global directly; a dry run would use an
		// in-memory registry and never touch the unusable location.
		previousDryRun := dryRun
		dryRun = false
		t.Cleanup(func() { dryRun = previousDryRun })
		t.Setenv("DOTFILES_E2E_TEST", "true")
		dir := t.TempDir()
		blocker := filepath.Join(dir, "generated")
		if err := os.WriteFile(blocker, []byte("not a directory"), 0644); err != nil {
			t.Fatalf("writing blocker: %v", err)
		}
		path := writeTSProject(t, dir, fmt.Sprintf(`"paths": {"homeDir": %q, "generatedDir": %q}`, filepath.ToSlash(dir), filepath.ToSlash(blocker)), nil)
		_, err := BootstrapServices(context.Background(), path)
		if err == nil || !strings.Contains(err.Error(), "failed connecting to SQLite database") {
			t.Fatalf("error = %v, want database connection failure", err)
		}
	})

	t.Run("fileExists reports errors other than absence", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "file")
		if err := os.WriteFile(file, []byte("x"), 0644); err != nil {
			t.Fatalf("writing file: %v", err)
		}
		exists, err := fileExists(filepath.Join(file, "child"))
		if exists || err == nil {
			t.Fatalf("fileExists(child of a file) = (%v, %v), want (false, error)", exists, err)
		}
	})
}

// TestMockInstaller_CheckUpdate pins that the development stand-in answers an update
// check the way the production installer of the same name does, so a dev-test run never
// reports a tool nothing could have checked as up to date.
func TestMockInstaller_CheckUpdate(t *testing.T) {
	for name, wantUnsupported := range map[string]bool{
		"manual":         true,
		"curl-binary":    true,
		"curl-tar":       true,
		"curl-script":    true,
		"cargo":          false,
		"zsh-plugin":     true,
		"github-release": false,
		"gitea-release":  false,
		"brew":           false,
	} {
		t.Run(name, func(t *testing.T) {
			m := &mockInstaller{name: name}
			res, err := m.CheckUpdate(context.Background(), &config.ToolConfig{Name: "tool", InstallationMethod: name})
			if got := errors.Is(err, installer.ErrUpdateCheckUnsupported); got != wantUnsupported {
				t.Fatalf("CheckUpdate() = %+v, %v; unsupported = %t, want %t", res, err, got, wantUnsupported)
			}
			if !wantUnsupported && (err != nil || res == nil) {
				t.Fatalf("CheckUpdate() = %+v, %v; want an answer", res, err)
			}
		})
	}
}

func TestMockInstaller_ObjectBinaries(t *testing.T) {
	memFS := fs.NewMemFS()
	projCfg := &config.ProjectConfig{}
	projCfg.Paths.BinariesDir = "/bins"
	stagingDir := filepath.Join(projCfg.Paths.BinariesDir, "tool", "v1")
	if err := memFS.MkdirAll(stagingDir, 0755); err != nil {
		t.Fatalf("creating staging dir: %v", err)
	}

	m := &mockInstaller{name: "manual", fsys: memFS, projCfg: projCfg}
	res, err := m.Install(context.Background(), &config.ToolConfig{
		Name:     "tool",
		Binaries: []interface{}{map[string]interface{}{"name": "objbin"}, map[string]interface{}{"pattern": "no-name"}},
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if !slices.Equal(res.Binaries, []string{"objbin"}) {
		t.Fatalf("Binaries = %v, want the named object binary only", res.Binaries)
	}
	if exists, _ := memFS.Exists(filepath.Join(stagingDir, "objbin")); !exists {
		t.Fatalf("expected the mock binary to be written into %s", stagingDir)
	}
}

func TestConfigDiscoveryIgnoresUnrelatedGoModule(t *testing.T) {
	t.Setenv("DOTFILES_REPO_ROOT", "")
	t.Setenv("DOTFILES_ENV_DIR", "")
	root := t.TempDir()
	writeTSProject(t, root, `"paths": {`+projectPathsTS(root)+`}`, nil)
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module unrelated.example/project\n"), 0644); err != nil {
		t.Fatal(err)
	}
	child := filepath.Join(root, "child")
	if err := os.Mkdir(child, 0755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(child)
	if path, err := resolveConfigPath(""); err == nil {
		t.Fatalf("discovered unrelated module configuration %q", path)
	}
	missing := filepath.Join(child, "dotfiles.config.ts")
	if path, err := resolveConfigPath("dotfiles.config.ts"); err != nil || path != missing {
		t.Fatalf("relative configuration resolved to %q, %v; want %q", path, err, missing)
	}
	if _, err := BootstrapServices(context.Background(), "dotfiles.config.ts"); err == nil || !strings.Contains(err.Error(), missing) {
		t.Fatalf("missing configuration error = %v; want the working-directory path %s", err, missing)
	}
}
