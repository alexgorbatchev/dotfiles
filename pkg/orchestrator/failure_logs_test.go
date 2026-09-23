package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// TestCompletionFailureLogNamesTheCause pins that a completion that cannot be generated
// is reported with its cause outside --trace (#131), whether generation or an
// installation generated it. The logger keeps an error argument's text for --trace, so
// the cause has to be part of the message.
func TestCompletionFailureLogNamesTheCause(t *testing.T) {
	t.Parallel()
	const want = `[comp-tool] Failed to generate completions: generating completion for zsh: comp-tool: zsh completions source "{nosuch}/_comp": unknown placeholder {nosuch}`

	for _, tt := range []struct {
		name string
		run  func(ctx context.Context, o *Orchestrator, tool *config.ToolConfig, projCfg *config.ProjectConfig) error
	}{
		{"generate", func(ctx context.Context, o *Orchestrator, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.GenerateTool(ctx, tool, projCfg)
		}},
		{"install", func(ctx context.Context, o *Orchestrator, tool *config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.InstallTool(ctx, tool, projCfg)
		}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening registry: %v", err)
			}
			defer sqlDB.Close()

			instReg := installer.NewRegistry()
			if err := instReg.Register(&mockInstaller{name: "comp-method", binaries: []string{"/home/user/binaries/comp-tool/current/comp"}}); err != nil {
				t.Fatalf("registering installer: %v", err)
			}
			var logBuf bytes.Buffer
			log := logger.New(logger.Config{Writer: &logBuf})
			memFS := fs.NewMemFS()
			o := NewOrchestrator(log, memFS, exec.NewMockRunner(), registry.NewRegistry(sqlDB), instReg)
			projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir:         "/home/user",
				TargetDir:       "/home/user/bin",
				BinariesDir:     "/home/user/binaries",
				GeneratedDir:    "/home/user/.generated",
				ShellScriptsDir: "/home/user/.generated/shell-scripts",
			}}
			if err := memFS.MkdirAll("/home/user/binaries/comp-tool", 0755); err != nil {
				t.Fatalf("creating binaries dir: %v", err)
			}
			tool := &config.ToolConfig{
				Name:               "comp-tool",
				InstallationMethod: "comp-method",
				Binaries:           testutil.DeclaredBinaries("comp"),
				ConfigFilePath:     "/home/user/tools/comp-tool.tool.ts",
				ShellConfigs:       &config.ShellConfigs{Zsh: &config.ShellTypeConfig{Completions: "{nosuch}/_comp"}},
			}

			if err := tt.run(ctx, o, tool, projCfg); err != nil {
				t.Fatalf("a completion failure must not fail the %s: %v", tt.name, err)
			}
			if got := logBuf.String(); !strings.Contains(got, want) {
				t.Errorf("log = %q, want it to contain %q", got, want)
			}
		})
	}
}

// TestPipelineFailureLogsNameTheCause pins that the failures GenerateTools and
// InstallTools log without failing, syncing the TypeScript types and removing an
// orphaned tool, are reported with their cause outside --trace (#131).
func TestPipelineFailureLogsNameTheCause(t *testing.T) {
	t.Parallel()
	const (
		syncFailure    = `Syncing TypeScript types failed: creating generated node_modules directory /home/user/.generated/node_modules/@alexgorbatchev/dotfiles: `
		cleanupFailure = `[ghost] Failed to cleanup orphaned tool: `
		cleanupCause   = "installations are kept"
	)

	for _, tt := range []struct {
		name string
		run  func(ctx context.Context, o *Orchestrator, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error
		want []string
	}{
		{"generate", func(ctx context.Context, o *Orchestrator, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.GenerateTools(ctx, tools, projCfg)
		}, []string{syncFailure, cleanupFailure, cleanupCause}},
		{"install", func(ctx context.Context, o *Orchestrator, tools []*config.ToolConfig, projCfg *config.ProjectConfig) error {
			return o.InstallTools(ctx, tools, projCfg)
		}, []string{syncFailure}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening registry: %v", err)
			}
			defer sqlDB.Close()
			reg := registry.NewRegistry(sqlDB)
			// ghost is recorded but no longer configured, so it is an orphan, and the
			// trigger makes removing its installation record fail.
			if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
				method := "manual"
				if err := reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{ToolName: "ghost", Version: "1.0.0", InstallPath: "/x", BinaryPaths: "[]", InstallMethod: &method}); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, "CREATE TRIGGER keep_installations BEFORE DELETE ON tool_installations BEGIN SELECT RAISE(ABORT, '"+cleanupCause+"'); END")
				return err
			}); err != nil {
				t.Fatalf("seeding registry: %v", err)
			}

			var logBuf bytes.Buffer
			memFS := fs.NewMemFS()
			o := NewOrchestrator(logger.New(logger.Config{Writer: &logBuf}), memFS, exec.NewMockRunner(), reg, installer.NewRegistry())
			projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir:      "/home/user",
				TargetDir:    "/home/user/bin",
				BinariesDir:  "/home/user/binaries",
				GeneratedDir: "/home/user/.generated",
			}}
			// A file where the generated node_modules directory belongs cannot be made
			// into one.
			if err := memFS.MkdirAll("/home/user/.generated", 0755); err != nil {
				t.Fatalf("creating generated dir: %v", err)
			}
			if err := memFS.WriteFile("/home/user/.generated/node_modules", []byte("not a directory"), 0644); err != nil {
				t.Fatalf("writing node_modules file: %v", err)
			}

			if err := tt.run(ctx, o, []*config.ToolConfig{{Name: "shell-only"}}, projCfg); err != nil {
				t.Fatalf("these failures must not fail the %s: %v", tt.name, err)
			}
			got := logBuf.String()
			for _, want := range tt.want {
				if !strings.Contains(got, want) {
					t.Errorf("log = %q, want it to contain %q", got, want)
				}
			}
		})
	}
}
