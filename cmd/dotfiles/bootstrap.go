package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
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
	"github.com/alexgorbatchev/dotfiles/pkg/proxy"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/utils"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

type Services struct {
	// ConfigPath is the absolute path of the configuration file that was loaded.
	ConfigPath    string
	ProjectConfig *config.ProjectConfig
	ToolConfigs   []*config.ToolConfig
	FS            fs.FS
	DB            *sql.DB
	Registry      *registry.Registry
	Orchestrator  *orchestrator.Orchestrator
	// Target is the resolved target OS, architecture and C library for this run.
	Target vm.Target
	// Installers is the registry the Orchestrator installs from. Commands that
	// need an installer directly (update checks) must resolve it here rather than
	// in the package-level default registry, so that tests, which are given mock
	// installers, never reach the real installers' network endpoints.
	Installers *installer.Registry
	// Runner is the command runner the Orchestrator executes through, including the
	// shell of every lifecycle hook. It is exposed for the same reason Installers is:
	// tests are given a mock, and nothing may quietly fall back to the real one.
	Runner execRunner.CommandRunner
	// HTTPClient is set only when DEV_PROXY is active. It routes through the
	// development proxy, and every installer in Installers already uses it; a
	// command with its own outbound HTTP must use it too when it is non-nil.
	HTTPClient *http.Client
	// InMemory is true when FS and the registry live in memory (dry runs and unit
	// tests), so nothing generated reaches disk and no external program can read it.
	InMemory bool

	devProxy *proxy.Server
}

// Close releases what BootstrapServices opened: the registry database and the
// development proxy when one was started. Every command defers it.
func (s *Services) Close() error {
	var errs []error
	if s.DB != nil {
		if err := s.DB.Close(); err != nil {
			errs = append(errs, fmt.Errorf("closing registry database: %w", err))
		}
	}
	if s.devProxy != nil {
		if err := s.devProxy.Stop(); err != nil {
			errs = append(errs, fmt.Errorf("stopping development proxy: %w", err))
		}
	}
	return errors.Join(errs...)
}

// BootstrapServices parses config files and initializes core services.
func BootstrapServices(ctx context.Context, configPath string) (services *Services, err error) {
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

	cwd, _ := os.Getwd()

	if configPath == "" {
		candidateNames := []string{
			"dotfiles.config.ts",
			".dotfiles.config.ts",
			"dotfiles.config.js",
			".dotfiles.config.js",
			"dotfiles.config.json",
			".dotfiles.config.json",
		}

		var candidates []string
		for _, name := range candidateNames {
			candidates = append(candidates, filepath.Join(cwd, name))
		}
		if repoRoot != "" && repoRoot != cwd {
			for _, name := range candidateNames {
				candidates = append(candidates, filepath.Join(repoRoot, name))
			}
		}

		found := false
		for _, cand := range candidates {
			if exists, _ := fileExists(cand); exists {
				configPath = cand
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("configuration file not specified and defaults not found")
		}
	} else {
		if home, err := os.UserHomeDir(); err == nil {
			configPath = utils.ExpandHomePath(home, configPath)
		}
		if !filepath.IsAbs(configPath) {
			cwdRel := filepath.Join(cwd, configPath)
			if exists, _ := fileExists(cwdRel); exists {
				configPath = cwdRel
			} else {
				configPath = filepath.Join(repoRoot, configPath)
			}
		}
	}

	absConfigPath, err := filepath.Abs(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed resolving absolute config path: %w", err)
	}

	// Dry runs and unit tests operate on an in-memory file system and registry, so
	// nothing they generate reaches disk.
	inMemory := dryRun || (isDevTest() && os.Getenv("DOTFILES_E2E_TEST") != "true")

	var fsys fs.FS
	if inMemory {
		// A dry run must see the machine it would install onto, so that "already
		// installed" and "this path is taken" are answered against reality.
		fsys = fs.NewMemFSWithHostFallback()
	} else {
		fsys = fs.NewOSFS()
	}
	fsys = fs.NewResolvedFS(fsys, "")

	// One resolved target governs the whole run: the configuration is loaded for it,
	// the installers select assets for it, and the lifecycle hooks report it. Building
	// it here, where the flags are parsed, is what keeps those three from each
	// rediscovering the host on their own.
	target := resolveTarget(GetLogger("config", os.Stderr))

	var projCfg *config.ProjectConfig
	var toolConfigs []*config.ToolConfig

	if strings.HasSuffix(absConfigPath, ".ts") || strings.HasSuffix(absConfigPath, ".js") {
		var err error
		var toolMap map[string]*config.ToolConfig
		// --platform/--arch/--libc must reach the loader, because .platform() blocks and
		// everything a tool file derives from ctx.systemInfo are evaluated while the
		// configuration is being loaded.
		projCfg, toolMap, err = vm.LoadTypeScriptConfig(GetLogger("config", os.Stderr), fsys, absConfigPath, vm.WithTarget(target))
		if err != nil {
			return nil, fmt.Errorf("loading %s: %w", filepath.Base(absConfigPath), err)
		}
		for _, tc := range toolMap {
			toolConfigs = append(toolConfigs, tc)
		}
	} else {
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

		projCfg = &bResult.ProjectConfig
		for name, tc := range bResult.ToolConfigs {
			localTC := tc
			if localTC.Name == "" {
				localTC.Name = name
			}
			toolConfigs = append(toolConfigs, &localTC)
		}
	}

	// If MOCK_SERVER_PORT is set, override public hosts to target mock server
	mockPort := os.Getenv("MOCK_SERVER_PORT")
	if mockPort != "" {
		mockHost := "http://127.0.0.1:" + mockPort
		projCfg.Github.Host = mockHost
		projCfg.Cargo.CratesIo.Host = mockHost
		projCfg.Cargo.GithubRaw.Host = mockHost
		projCfg.Cargo.GithubRelease.Host = mockHost
	}

	if err := projCfg.ResolvePlaceholders(filepath.Dir(absConfigPath)); err != nil {
		return nil, fmt.Errorf("resolving paths in %s: %w", filepath.Base(absConfigPath), err)
	}

	if rfs, ok := fsys.(*fs.ResolvedFS); ok {
		rfs.SetHomeDir(projCfg.Paths.HomeDir)
	}

	sort.Slice(toolConfigs, func(i, j int) bool {
		return toolConfigs[i].Name < toolConfigs[j].Name
	})

	// For dry-runs and tests, we still open a valid database.
	// If in unit testing or dry-run, use in-memory SQLite to prevent disk state pollution.
	var dbPath string
	if inMemory {
		dbPath = ":memory:"
	} else {
		dbPath = filepath.Join(projCfg.Paths.GeneratedDir, "registry.db")
	}

	sqlDB, err := db.NewConnection(ctx, dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed connecting to SQLite database: %w", err)
	}

	reg := registry.NewRegistry(sqlDB)
	trackedFS := fs.NewTrackedFileSystem(fsys, reg, nil, "system").WithFileType("shim")

	var runner execRunner.CommandRunner = execRunner.NewOSRunner()
	instReg := installer.DefaultRegistry()
	if isDevTest() && os.Getenv("DOTFILES_E2E_USE_REAL_INSTALLERS") != "true" {
		// Lifecycle hooks run arbitrary shell through this runner, so a test that
		// installs anything would otherwise execute it for real: the fixture's
		// Homebrew hook is a `curl | bash` that prompts for a password and blocks.
		// The installers below are substituted for the same reason.
		runner = execRunner.NewMockRunner()
		instReg = installer.NewRegistry()
		_ = instReg.Register(&mockInstaller{name: "github-release", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "cargo", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "curl-script", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "manual", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "brew", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "zsh-plugin", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "gitea-release", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "curl-tar", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "curl-binary", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "dmg", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "npm", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "apt", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "pacman", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "dnf", fsys: fsys, projCfg: projCfg})
		_ = instReg.Register(&mockInstaller{name: "pkg", fsys: fsys, projCfg: projCfg})
	}
	orch := orchestrator.NewOrchestrator(GetLogger("orchestrator", os.Stderr), trackedFS, runner, reg, instReg)
	orch.SetConfigFilePath(absConfigPath)
	orch.SetTarget(target)
	if inMemory {
		orch.SetSymlinkFS(fsys)
	}

	devProxy, err := startDevProxy(GetLogger("proxy", os.Stderr))
	if err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	defer func() {
		if err != nil && devProxy != nil {
			_ = devProxy.Stop()
		}
	}()
	var httpClient *http.Client
	if devProxy != nil {
		httpClient = devProxy.Client()
		for _, name := range instReg.List() {
			inst, err := instReg.Get(name)
			if err != nil {
				return nil, fmt.Errorf("routing installer %q through the development proxy: %w", name, err)
			}
			installer.SetHTTPClient(inst, httpClient)
		}
	}

	// Map binary dependencies to fully-qualified tool names (e.g., fnm -> curl-script--fnm)
	for _, tc := range toolConfigs {
		for idx, dep := range tc.Dependencies {
			var matchingProviders []string
			for _, provider := range toolConfigs {
				isProvider := false
				if provider.Name == dep || strings.HasSuffix(provider.Name, "--"+dep) {
					isProvider = true
				} else {
					for _, b := range provider.Binaries {
						switch val := b.(type) {
						case map[string]interface{}:
							if bName, ok := val["name"].(string); ok && bName == dep {
								isProvider = true
							}
						case config.BinaryConfig:
							if val.Name == dep {
								isProvider = true
							}
						case *config.BinaryConfig:
							if val != nil && val.Name == dep {
								isProvider = true
							}
						}
						if isProvider {
							break
						}
					}
				}
				if isProvider {
					matchingProviders = append(matchingProviders, provider.Name)
				}
			}
			if len(matchingProviders) > 1 {
				sort.Strings(matchingProviders)
				_ = sqlDB.Close()
				return nil, fmt.Errorf("ambiguous dependency: binary %q is provided by multiple tools: %s", dep, strings.Join(matchingProviders, ", "))
			} else if len(matchingProviders) == 1 {
				tc.Dependencies[idx] = matchingProviders[0]
			}
		}
	}

	return &Services{
		ConfigPath:    absConfigPath,
		ProjectConfig: projCfg,
		ToolConfigs:   toolConfigs,
		FS:            trackedFS,
		DB:            sqlDB,
		Registry:      reg,
		Orchestrator:  orch,
		Target:        target,
		Installers:    instReg,
		Runner:        runner,
		HTTPClient:    httpClient,
		InMemory:      inMemory,
		devProxy:      devProxy,
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
	name    string
	fsys    fs.FS
	projCfg *config.ProjectConfig
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.name == "manual" || m.name == "apt" || m.name == "dnf" || m.name == "pacman" || m.name == "pkg"
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	var binaries []string
	for _, b := range tool.Binaries {
		if val, ok := b.(map[string]interface{}); ok {
			if name, ok := val["name"].(string); ok {
				binaries = append(binaries, name)
			}
		}
	}
	if len(binaries) == 0 {
		binaries = []string{tool.Name}
	}

	// Write mock binaries to the active staging directory
	if m.fsys != nil && m.projCfg != nil {
		toolDir := filepath.Join(m.projCfg.Paths.BinariesDir, tool.Name)
		entries, err := m.fsys.ReadDir(toolDir)
		if err == nil {
			for _, entry := range entries {
				subDir := filepath.Join(toolDir, entry)
				for _, binName := range binaries {
					binPath := filepath.Join(subDir, binName)
					_ = m.fsys.WriteFile(binPath, []byte("mock binary content"), 0755)
				}
			}
		}
	}

	return &installer.InstallResult{
		Binaries: binaries,
	}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

// mockUpdateCheckUnsupported names the installers that answer every update check with
// installer.ErrUpdateCheckUnsupported in production. dmg and pkg are left out because
// theirs depends on the tool's source, which this stand-in does not model.
var mockUpdateCheckUnsupported = map[string]bool{
	"manual":      true,
	"curl-binary": true,
	"curl-tar":    true,
	"curl-script": true,
	"zsh-plugin":  true,
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	if mockUpdateCheckUnsupported[m.name] {
		return nil, installer.ErrUpdateCheckUnsupported
	}
	return &installer.UpdateCheckResult{}, nil
}
