package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

func TestGenerateCompletionsForTool_SkipMissingSource(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	fsys := newMemFS()
	runner := exec.NewMockRunner()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, fsys, runner, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	tool := &config.ToolConfig{
		Name:               "cargo--eza",
		Binaries:           testutil.DeclaredBinaries("eza"),
		ConfigFilePath:     "/home/user/tools/eza.tool.ts",
		InstallationMethod: "cargo",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: "/home/user/.generated/binaries/cargo--eza/current/completions/zsh/_eza",
			},
		},
	}

	// When source file does NOT exist, GenerateCompletionsForTool must skip creating a broken symlink
	err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed: %v", err)
	}

	compPath := "/home/user/.generated/shell-scripts/zsh/completions/_eza"
	exists, _ := fsys.Exists(compPath)
	if exists {
		t.Errorf("Expected completion symlink NOT to exist when source file is missing")
	}

	// Now create source file and re-run: symlink should be created
	_ = fsys.MkdirAll("/home/user/.generated/binaries/cargo--eza/current/completions/zsh", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/cargo--eza/current/completions/zsh/_eza", []byte("# completion"), 0644)

	err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed on second run: %v", err)
	}

	exists, _ = fsys.Exists(compPath)
	if !exists {
		t.Errorf("Expected completion symlink to exist after source file was created")
	}
}

func TestGenerateCompletionsForTool_CmdCompletion(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
	fsys := newMemFS()
	runner := exec.NewMockRunner()
	runner.Register("mytool", []byte("# mytool zsh completion"), nil)
	runner.Register("/home/user/.generated/binaries/mytool/current/mytool", []byte("# mytool zsh completion"), nil)
	runner.Register("slowtool", nil, fmt.Errorf("context deadline exceeded"))
	runner.Register("/home/user/.generated/binaries/slowtool/current/slowtool", nil, fmt.Errorf("context deadline exceeded"))

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, fsys, runner, reg, nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	// 1. Tool with successful completion command
	_ = fsys.MkdirAll("/home/user/.generated/binaries/mytool/current", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/mytool/current/mytool", []byte("dummy bin"), 0755)
	_ = fsys.MkdirAll("/home/user/.generated/binaries/slowtool/current", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/slowtool/current/slowtool", []byte("dummy bin"), 0755)

	toolSuccess := &config.ToolConfig{
		Name:               "mytool",
		Binaries:           testutil.DeclaredBinaries("mytool"),
		ConfigFilePath:     "/home/user/tools/mytool.tool.ts",
		InstallationMethod: "github-release",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "mytool completion zsh",
				},
			},
		},
	}

	err = orch.GenerateCompletionsForTool(ctx, toolSuccess, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed on success tool: %v", err)
	}

	compPath := "/home/user/.generated/shell-scripts/zsh/completions/_mytool"
	content, err := fsys.ReadFile(compPath)
	if err != nil {
		t.Fatalf("expected completion file to exist: %v", err)
	}
	if string(content) != "# mytool zsh completion" {
		t.Errorf("expected completion content '# mytool zsh completion', got %q", string(content))
	}

	// 2. Tool with failing/timing-out completion command (should recover gracefully)
	toolSlow := &config.ToolConfig{
		Name:               "slowtool",
		Binaries:           testutil.DeclaredBinaries("slowtool"),
		ConfigFilePath:     "/home/user/tools/slowtool.tool.ts",
		InstallationMethod: "github-release",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "slowtool completion zsh",
				},
			},
		},
	}

	err = orch.GenerateCompletionsForTool(ctx, toolSlow, projCfg)
	if err != nil {
		t.Fatalf("expected GenerateCompletionsForTool to recover gracefully from timeout, got error: %v", err)
	}
}

// A completion command that exceeds completionCommandTimeout must be reported as a
// timeout rather than as a generic failure, because the two call for different fixes:
// a timeout means the binary was too slow to respond, not that the command is wrong.
func TestGenerateCompletionsForTool_CmdTimeoutIsReportedAsTimeout(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	fsys := newMemFS()
	runner := exec.NewMockRunner()
	runner.Register("/home/user/.generated/binaries/stalledtool/current/stalledtool", nil, context.DeadlineExceeded)

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()

	orch := NewOrchestrator(log, fsys, runner, registry.NewRegistry(sqlDB), nil)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	_ = fsys.MkdirAll("/home/user/.generated/binaries/stalledtool/current", 0755)
	_ = fsys.WriteFile("/home/user/.generated/binaries/stalledtool/current/stalledtool", []byte("dummy bin"), 0755)

	tool := &config.ToolConfig{
		Name:               "stalledtool",
		Binaries:           testutil.DeclaredBinaries("stalledtool"),
		ConfigFilePath:     "/home/user/tools/stalledtool.tool.ts",
		InstallationMethod: "github-release",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "stalledtool completion zsh",
				},
			},
		},
	}

	if err := orch.GenerateCompletionsForTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("expected a completion timeout to be non-fatal, got error: %v", err)
	}

	if logged := logBuf.String(); !strings.Contains(logged, "timed out after") {
		t.Errorf("expected a timeout to be reported as such, got log: %s", logged)
	}
	if exists, _ := fsys.Exists("/home/user/.generated/shell-scripts/zsh/completions/_stalledtool"); exists {
		t.Error("expected no completion file to be written when the command times out")
	}
}

// TestGenerateCompletionsForToolRejectsUnresolvablePlaceholder pins that a completion
// declaration holding a placeholder nothing can fill is reported rather than quietly
// producing no completion. The generate pipeline decides how loud that is; what matters
// here is that the resolver's answer reaches it.
func TestGenerateCompletionsForToolRejectsUnresolvablePlaceholder(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		completions interface{}
		wantErr     string
	}{
		{
			name:        "source path",
			completions: "{configFileDir}/_bat",
			wantErr:     "completions source",
		},
		{
			name:        "source path in a declaration object",
			completions: map[string]interface{}{"source": "{configFileDir}/_bat"},
			wantErr:     "completions source",
		},
		{
			name:        "command",
			completions: map[string]interface{}{"cmd": "{paths.homeDir} completion zsh"},
			wantErr:     "completions command",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			fsys := newMemFS()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening the registry database: %v", err)
			}
			defer sqlDB.Close()

			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})
			orch := NewOrchestrator(log, fsys, exec.NewMockRunner(), registry.NewRegistry(sqlDB), nil)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:         "/home/user",
					TargetDir:       "/home/user/.generated/bin",
					BinariesDir:     "/home/user/.generated/binaries",
					ShellScriptsDir: "/home/user/.generated/shell-scripts",
					GeneratedDir:    "/home/user/.generated",
				},
			}
			// A command is resolvable text, so it takes a cycle rather than an unknown
			// name to make it unresolvable.
			if tt.wantErr == "completions command" {
				projCfg.Paths.HomeDir = "{paths.dotfilesDir}/sub"
				projCfg.Paths.DotfilesDir = "{paths.homeDir}/dot"
			}

			tool := &config.ToolConfig{
				Name:           "bat",
				Binaries:       testutil.DeclaredBinaries("bat"),
				ConfigFilePath: "/home/user/tools/bat.tool.ts",
				ShellConfigs: &config.ShellConfigs{
					Zsh: &config.ShellTypeConfig{Completions: tt.completions},
				},
			}

			err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
			if err == nil {
				t.Fatal("GenerateCompletionsForTool() = nil, want it to report the unresolvable placeholder")
			}
			for _, want := range []string{"bat", "zsh", tt.wantErr} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("GenerateCompletionsForTool() = %v, want it to name %q", err, want)
				}
			}
		})
	}
}

func TestCompletionFilesystemFailuresSurface(t *testing.T) {
	for _, failure := range []struct {
		name, operation string
		sourceForm      bool
	}{
		{"destination inspection", "exists", false},
		{"source inspection", "exists", true},
		{"source replacement removal", "remove", true},
		{"source linking", "symlink", true},
	} {
		t.Run(failure.name, func(t *testing.T) {
			o, mem := declFixture(t)
			cfg := declProjectConfig()
			cfg.Paths.ShellScriptsDir = "/home/user/shell"
			path := "/home/user/shell/zsh/completions/_test"
			source := "/home/user/completion-source"
			writeDecl(t, mem, source, "completion")
			binary := "/home/user/.generated/binaries/test/current/test"
			writeDecl(t, mem, binary, "binary")
			comp := any(map[string]interface{}{"cmd": "test completion zsh"})
			if failure.sourceForm {
				comp = source
			}
			if failure.sourceForm && failure.operation == "exists" {
				path = source
			}
			o.fs = &artifactFailureFS{FS: mem, operation: failure.operation, path: path, err: os.ErrPermission}
			tool := &config.ToolConfig{Name: "test", ShellConfigs: &config.ShellConfigs{Zsh: &config.ShellTypeConfig{Completions: comp}}}
			if err := o.GenerateCompletionsForTool(context.Background(), tool, cfg); !errors.Is(err, os.ErrPermission) {
				t.Fatalf("lost completion failure: %v", err)
			}
		})
	}
}

func TestGenerateCompletionsForTool(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	ctx := context.Background()

	database, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer database.Close()

	reg := registry.NewRegistry(database)
	log := logger.New(logger.Config{Writer: io.Discard})
	instReg := installer.NewRegistry()

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/test",
			DotfilesDir:     "/home/test/dotfiles",
			TargetDir:       "/home/test/.bin",
			BinariesDir:     "/home/test/.binaries",
			GeneratedDir:    "/home/test/.generated",
			ShellScriptsDir: "/home/test/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	// Create tool completion file on disk
	_ = memFS.MkdirAll("/home/test/dotfiles/completions", 0755)
	_ = memFS.WriteFile("/home/test/dotfiles/completions/_rg", []byte("#compdef rg\n_rg() {}"), 0644)

	tool := &config.ToolConfig{
		Name:     "ripgrep",
		Binaries: testutil.DeclaredBinaries("rg"),
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: "/home/test/dotfiles/completions/_rg",
			},
			Bash: &config.ShellTypeConfig{
				Completions: "/home/test/dotfiles/completions/_rg",
			},
		},
	}

	err = orch.GenerateCompletionsForTool(ctx, tool, projCfg)
	if err != nil {
		t.Fatalf("GenerateCompletionsForTool failed: %v", err)
	}

	data, err := memFS.ReadFile("/home/test/.generated/shell-scripts/zsh/completions/_rg")
	if err != nil || !strings.Contains(string(data), "#compdef rg") {
		t.Errorf("expected completion file written, got data %q, err=%v", string(data), err)
	}
}

func TestGenerateCompletionsForToolCoverage(t *testing.T) {
	ctx := context.Background()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	orch := newTestOrchestrator(t, memFS, "")
	orch.runner = runner

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			DotfilesDir:     "/home/user/dotfiles",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/binaries",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
		},
	}

	// 1. Completion with map source
	_ = memFS.MkdirAll("/home/user/dotfiles/completions", 0755)
	_ = memFS.WriteFile("/home/user/dotfiles/completions/zsh-comp", []byte("comp script"), 0644)
	toolMapSource := &config.ToolConfig{
		Name:           "tool-src",
		ConfigFilePath: "/home/user/dotfiles/tools/tool-src.tool.ts",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"source": "/home/user/dotfiles/completions/zsh-comp",
				},
			},
		},
	}
	if err := orch.GenerateCompletionsForTool(ctx, toolMapSource, projCfg); err != nil {
		t.Fatalf("GenerateCompletionsForTool with map source failed: %v", err)
	}

	// 2. Completion with cmd resolved from DB recorded binary paths
	_ = memFS.MkdirAll("/opt/custom/bin", 0755)
	_ = memFS.WriteFile("/opt/custom/bin/custom-cli", []byte("cli"), 0755)
	_ = orch.reg.WithTx(ctx, func(tx *sql.Tx) error {
		return orch.reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "db-tool",
			Version:     "1.0",
			InstallPath: "/opt/custom/bin/custom-cli",
			Timestamp:   "now",
			InstalledAt: 100,
			BinaryPaths: `["/opt/custom/bin/custom-cli"]`,
		})
	})
	runner.Register("/opt/custom/bin/custom-cli", []byte("#compdef custom-cli\n"), nil)

	toolDBCmd := &config.ToolConfig{
		Name: "db-tool",
		ShellConfigs: &config.ShellConfigs{
			Zsh: &config.ShellTypeConfig{
				Completions: map[string]interface{}{
					"cmd": "custom-cli completion zsh",
				},
			},
		},
	}
	if err := orch.GenerateCompletionsForTool(ctx, toolDBCmd, projCfg); err != nil {
		t.Fatalf("GenerateCompletionsForTool with DB cmd failed: %v", err)
	}

	// 3. Completion command failure
	runner.Register("/opt/custom/bin/custom-cli", []byte(""), errors.New("command failed"))
	// Force overwrite so it attempts running command again
	ctxOverwrite := config.WithOverwrite(ctx, true)
	if err := orch.GenerateCompletionsForTool(ctxOverwrite, toolDBCmd, projCfg); err != nil {
		t.Fatalf("GenerateCompletionsForTool on failing command returned error: %v", err)
	}

	// 4. Completion command timeout
	runner.RegisterFunc("/opt/custom/bin/custom-cli", func(c *exec.MockCmd) error {
		return context.DeadlineExceeded
	})
	if err := orch.GenerateCompletionsForTool(ctxOverwrite, toolDBCmd, projCfg); err != nil {
		t.Fatalf("GenerateCompletionsForTool on timed out command returned error: %v", err)
	}
}
