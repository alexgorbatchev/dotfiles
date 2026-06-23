package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	osExec "os/exec"
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
	repoRoot := ""
	if isDevTest() {
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
		npmPath := filepath.Join(repoRoot, "test-project-npm/dotfiles.config.ts")
		localPath := filepath.Join(repoRoot, "dotfiles.config.ts")
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

	cmd := osExec.CommandContext(ctx, "bun", "run", "scripts/load-configs.ts", absConfigPath)
	cmd.Dir = repoRoot

	outputBytes, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("loading configuration failed: %w\noutput: %s", err, string(outputBytes))
	}

	var bResult struct {
		ProjectConfig config.ProjectConfig         `json:"projectConfig"`
		ToolConfigs   map[string]config.ToolConfig `json:"toolConfigs"`
	}
	if err := json.Unmarshal(outputBytes, &bResult); err != nil {
		return nil, fmt.Errorf("unmarshaling config loader result: %w", err)
	}

	var toolConfigs []*config.ToolConfig
	for _, tc := range bResult.ToolConfigs {
		localTC := tc
		toolConfigs = append(toolConfigs, &localTC)
	}

	sort.Slice(toolConfigs, func(i, j int) bool {
		return toolConfigs[i].Name < toolConfigs[j].Name
	})

	var fsys fs.FS
	if dryRun || isDevTest() {
		fsys = fs.NewMemFS()
	} else {
		fsys = fs.NewOSFS()
	}

	// For dry-runs and tests, we still open a valid database.
	// If in unit testing, use in-memory SQLite to prevent disk state pollution.
	var dbPath string
	if isDevTest() {
		dbPath = ":memory:"
	} else {
		dbPath = filepath.Join(bResult.ProjectConfig.Paths.GeneratedDir, "registry.db")
	}

	sqlDB, err := db.NewConnection(ctx, dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed connecting to SQLite database: %w", err)
	}

	reg := registry.NewRegistry(sqlDB)
	runner := execRunner.NewOSRunner()
	instReg := installer.DefaultRegistry()
	if isDevTest() {
		instReg = installer.NewRegistry()
		_ = instReg.Register(&mockInstaller{name: "github-release"})
		_ = instReg.Register(&mockInstaller{name: "cargo"})
		_ = instReg.Register(&mockInstaller{name: "curl-script"})
		_ = instReg.Register(&mockInstaller{name: "manual"})
		_ = instReg.Register(&mockInstaller{name: "brew"})
		_ = instReg.Register(&mockInstaller{name: "zsh-plugin"})
	}
	orch := orchestrator.NewOrchestrator(fsys, runner, reg, instReg)

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
					if bStr, ok := b.(string); ok && bStr == dep {
						tc.Dependencies[idx] = provider.Name
						foundProvider = true
						break
					}
				}
				if foundProvider {
					break
				}
			}
		}
	}

	return &Services{
		ProjectConfig: &bResult.ProjectConfig,
		ToolConfigs:   toolConfigs,
		FS:            fsys,
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
	return flag.Lookup("test.v") != nil
}

type mockInstaller struct {
	name string
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return false
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{
		Binaries: nil,
	}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return &installer.UpdateCheckResult{HasUpdate: false}, nil
}
