package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	execRunner "github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/orchestrator"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

type Services struct {
	ProjectConfig *config.ProjectConfig
	ToolConfigs   []*config.ToolConfig
	FS            fs.FS
	DB            *sql.DB
	Registry      *registry.Registry
	Orchestrator  *orchestrator.Orchestrator
}

// BootstrapServices parses config files and initializes core services.
func BootstrapServices(ctx context.Context, configPath string) (*Services, error) {
	repoRoot := os.Getenv("DOTFILES_REPO_ROOT")
	if repoRoot == "" {
		// Find repo root from working directory
		dir, _ := os.Getwd()
		for dir != "/" && dir != "." {
			if exists, _ := fileExists(filepath.Join(dir, "go.mod")); exists {
				repoRoot = dir
				break
			}
			dir = filepath.Dir(dir)
		}
	}
	if repoRoot == "" {
		repoRoot, _ = os.Getwd()
	}

	if configPath == "" {
		npmPath := filepath.Join(repoRoot, "test-project-npm/dotfiles.config.json")
		localPath := filepath.Join(repoRoot, "dotfiles.config.json")
		if exists, _ := fileExists(npmPath); exists {
			configPath = npmPath
		} else if exists, _ := fileExists(localPath); exists {
			configPath = localPath
		} else {
			return nil, fmt.Errorf("configuration file not specified and defaults not found")
		}
	}

	if !filepath.IsAbs(configPath) {
		configPath = filepath.Join(repoRoot, configPath)
	}

	absConfigPath, err := filepath.Abs(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed resolving absolute config path: %w", err)
	}

	// Support loading converted JSON configuration natively in Go (completely serverless and independent of Bun!)
	if strings.HasSuffix(absConfigPath, ".ts") {
		jsonPath := strings.TrimSuffix(absConfigPath, ".ts") + ".json"
		if exists, _ := fileExists(jsonPath); exists {
			absConfigPath = jsonPath
		} else {
			return nil, fmt.Errorf("configuration file must be .json format or have a converted JSON file: %s", absConfigPath)
		}
	}

	data, err := os.ReadFile(absConfigPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read native JSON config: %w", err)
	}

	var bResult struct {
		ProjectConfig config.ProjectConfig         `json:"projectConfig"`
		ToolConfigs   map[string]config.ToolConfig `json:"toolConfigs"`
	}
	if err := json.Unmarshal(data, &bResult); err != nil {
		return nil, fmt.Errorf("failed to unmarshal native JSON project config: %w", err)
	}

	projCfg := bResult.ProjectConfig

	// If MOCK_SERVER_PORT is set, override public hosts to target mock server
	mockPort := os.Getenv("MOCK_SERVER_PORT")
	if mockPort != "" {
		mockHost := "http://127.0.0.1:" + mockPort
		projCfg.Github.Host = mockHost
		projCfg.Cargo.CratesIo.Host = mockHost
		projCfg.Cargo.GithubRaw.Host = mockHost
		projCfg.Cargo.GithubRelease.Host = mockHost
	}

	// Resolve the generatedDir placeholders in paths
	if strings.Contains(projCfg.Paths.HomeDir, "{paths.generatedDir}") {
		projCfg.Paths.HomeDir = strings.ReplaceAll(projCfg.Paths.HomeDir, "{paths.generatedDir}", projCfg.Paths.GeneratedDir)
	}
	if strings.Contains(projCfg.Paths.TargetDir, "{paths.generatedDir}") {
		projCfg.Paths.TargetDir = strings.ReplaceAll(projCfg.Paths.TargetDir, "{paths.generatedDir}", projCfg.Paths.GeneratedDir)
	}
	if strings.Contains(projCfg.Paths.BinariesDir, "{paths.generatedDir}") {
		projCfg.Paths.BinariesDir = strings.ReplaceAll(projCfg.Paths.BinariesDir, "{paths.generatedDir}", projCfg.Paths.GeneratedDir)
	}

	var toolConfigs []*config.ToolConfig
	for _, tc := range bResult.ToolConfigs {
		localTC := tc
		toolConfigs = append(toolConfigs, &localTC)
	}

	sort.Slice(toolConfigs, func(i, j int) bool {
		return toolConfigs[i].Name < toolConfigs[j].Name
	})

	ResolvePlatformConfigs(toolConfigs, installer.NewDefaultSystemContext())

	var fsys fs.FS
	if (dryRun && os.Getenv("DOTFILES_E2E_TEST") != "true") || (isDevTest() && os.Getenv("DOTFILES_E2E_TEST") != "true") {
		fsys = fs.NewMemFS()
	} else {
		fsys = fs.NewOSFS()
	}

	// For dry-runs and tests, we still open a valid database.
	// If in unit testing, use in-memory SQLite to prevent disk state pollution.
	var dbPath string
	if isDevTest() && os.Getenv("DOTFILES_E2E_TEST") != "true" {
		dbPath = ":memory:"
	} else {
		dbPath = filepath.Join(projCfg.Paths.GeneratedDir, "registry.db")
	}

	sqlDB, err := db.NewConnection(ctx, dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed connecting to SQLite database: %w", err)
	}

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(fsys, reg, "system").WithFileType("shim")

	runner := execRunner.NewOSRunner()
	instReg := installer.DefaultRegistry()
	if isDevTest() && os.Getenv("DOTFILES_E2E_USE_REAL_INSTALLERS") != "true" {
		instReg = installer.NewRegistry()
		_ = instReg.Register(&mockInstaller{name: "github-release"})
		_ = instReg.Register(&mockInstaller{name: "cargo"})
		_ = instReg.Register(&mockInstaller{name: "curl-script"})
		_ = instReg.Register(&mockInstaller{name: "manual"})
		_ = instReg.Register(&mockInstaller{name: "brew"})
		_ = instReg.Register(&mockInstaller{name: "zsh-plugin"})
		_ = instReg.Register(&mockInstaller{name: "gitea-release"})
		_ = instReg.Register(&mockInstaller{name: "curl-tar"})
		_ = instReg.Register(&mockInstaller{name: "curl-binary"})
		_ = instReg.Register(&mockInstaller{name: "dmg"})
		_ = instReg.Register(&mockInstaller{name: "npm"})
		_ = instReg.Register(&mockInstaller{name: "apt"})
		_ = instReg.Register(&mockInstaller{name: "pacman"})
		_ = instReg.Register(&mockInstaller{name: "dnf"})
		_ = instReg.Register(&mockInstaller{name: "pkg"})
	}
	orch := orchestrator.NewOrchestrator(trackedFS, runner, reg, instReg)

	// Map binary dependencies to fully-qualified tool names (e.g., fnm -> curl-script--fnm)
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

	return &Services{
		ProjectConfig: &projCfg,
		ToolConfigs:   toolConfigs,
		FS:            trackedFS,
		DB:            sqlDB,
		Registry:      reg,
		Orchestrator:  orch,
	}, nil
}

func fileExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func isDevTest() bool {
	return flag.Lookup("test.v") != nil || os.Getenv("DOTFILES_E2E_TEST") == "true"
}

type mockInstaller struct {
	name string
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.name == "apt" || m.name == "pacman" || m.name == "dnf" || m.name == "manual" || m.name == "pkg"
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	var binaries []string
	for _, b := range tool.Binaries {
		switch val := b.(type) {
		case string:
			binaries = append(binaries, val)
		case map[string]interface{}:
			if name, ok := val["name"].(string); ok {
				binaries = append(binaries, name)
			}
		}
	}
	if len(binaries) == 0 {
		binaries = []string{tool.Name}
	}
	return &installer.InstallResult{
		Binaries: binaries,
	}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{HasUpdate: false}, nil
}

func matchesPlatform(platforms int, osName string) bool {
	if platforms == 7 { // All
		return true
	}
	if platforms == 3 { // Unix (Linux | MacOS)
		return osName == "linux" || osName == "darwin"
	}
	if platforms == 2 && osName == "darwin" {
		return true
	}
	if platforms == 1 && osName == "linux" {
		return true
	}
	return false
}

func matchesArch(architectures int, archName string) bool {
	if architectures == 3 { // All
		return true
	}
	if architectures == 2 && archName == "arm64" {
		return true
	}
	if architectures == 1 && (archName == "amd64" || archName == "x86_64") {
		return true
	}
	return false
}

func ResolvePlatformConfigs(toolConfigs []*config.ToolConfig, sysCtx *installer.SystemContext) {
	for _, tc := range toolConfigs {
		if len(tc.PlatformConfigs) == 0 {
			continue
		}

		for _, entry := range tc.PlatformConfigs {
			if matchesPlatform(entry.Platforms, sysCtx.OS) {
				// Resolve match architecture if specified
				if entry.Architectures != nil {
					if !matchesArch(*entry.Architectures, sysCtx.Arch) {
						continue
					}
				}

				// Map entry.Config to a JSON string and unmarshal to tc
				jsonBytes, err := json.Marshal(entry.Config)
				if err == nil {
					_ = json.Unmarshal(jsonBytes, tc)
				}
			}
		}
	}
}
