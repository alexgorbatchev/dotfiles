package orchestrator

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
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

type spyLoggerInstaller struct {
	mockInstaller
	receivedLogger *logger.Logger
}

func (s *spyLoggerInstaller) SetLogger(l *logger.Logger) {
	s.receivedLogger = l
}

func TestInstallTool_DoesNotTagInstallerName(t *testing.T) {
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Writer: &logBuf})
	memFS := newMemFS()
	runner := exec.NewMockRunner()

	instReg := installer.NewRegistry()
	spy := &spyLoggerInstaller{
		mockInstaller: mockInstaller{name: "my-installer", binaries: []string{"my-bin"}},
	}
	if err := instReg.Register(spy); err != nil {
		t.Fatalf("registering spy installer: %v", err)
	}

	sqlDB, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("connecting to db: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
	tool := &config.ToolConfig{
		Name:               "my-tool",
		InstallationMethod: "my-installer",
		Binaries:           testutil.DeclaredBinaries("my-bin"),
	}

	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}

	if spy.receivedLogger == nil {
		t.Fatalf("installer did not receive a logger via SetLogger")
	}

	logBuf.Reset()
	spy.receivedLogger.WithTag(tool.Name).Info(logger.Message("from installer"))
	got := logBuf.String()
	if strings.Contains(got, "[my-installer]") {
		t.Errorf("logger passed to installer should not have installer name tag, got: %q", got)
	}
	if !strings.Contains(got, "INFO\t[my-tool] from installer\n") {
		t.Errorf("expected clean single tool tag, got: %q", got)
	}
}

type loggingMockInstaller struct {
	mockInstaller
	fsys        fs.FS
	binariesDir string
}

func (m *loggingMockInstaller) SetFS(f fs.FS) { m.fsys = f }

func (m *loggingMockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	if m.fsys != nil && m.binariesDir != "" {
		stagingDir := filepath.Join(m.binariesDir, tool.Name, ".staging")
		for _, b := range m.binaries {
			_ = m.fsys.WriteFile(filepath.Join(stagingDir, b), []byte("#!/bin/sh\n"), 0755)
		}
	}
	return m.mockInstaller.Install(ctx, tool)
}

func TestInstallTool_ShellOnlyLogging(t *testing.T) {
	for _, targeted := range []bool{false, true} {
		t.Run(fmt.Sprintf("targeted=%t", targeted), func(t *testing.T) {
			mem := newMemFS()
			o := newTestOrchestrator(t, mem, "")
			var output bytes.Buffer
			o.SetLogger(logger.New(logger.Config{Writer: &output}))
			project := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: "/home/user", TargetDir: "/target", GeneratedDir: "/generated", BinariesDir: "/binaries",
			}}
			tool := &config.ToolConfig{Name: "workspace", Directories: []config.DirectoryConfig{{Path: "/workspace-config"}}}
			if err := o.InstallTool(config.WithTargeted(context.Background(), targeted), tool, project); err != nil {
				t.Fatal(err)
			}
			if exists, err := mem.Exists("/workspace-config"); err != nil || !exists {
				t.Fatalf("shell-only configuration was not generated: %v", err)
			}
			if strings.Contains(output.String(), "[workspace] Generating configuration...") != targeted {
				t.Errorf("unexpected logging: %s", output.String())
			}
			if strings.Contains(output.String(), "[workspace] Installing...") {
				t.Error("shell-only tool reported binary installation")
			}
		})
	}
}

func TestInstallTool_TargetedVsBatchLogging(t *testing.T) {
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{
		Writer: &logBuf,
		Level:  logger.LogLevelDefault,
	})

	memFS := newMemFS()
	runner := exec.NewMockRunner()

	instReg := installer.NewRegistry()
	_ = instReg.Register(&loggingMockInstaller{
		mockInstaller: mockInstaller{
			name:     "mock-test1",
			binaries: []string{"tool1-bin"},
		},
		binariesDir: "/home/user/binaries",
	})
	_ = instReg.Register(&loggingMockInstaller{
		mockInstaller: mockInstaller{
			name:     "mock-test2",
			binaries: []string{"tool2-bin"},
		},
		binariesDir: "/home/user/binaries",
	})

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("NewConnection failed: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}

	tool1 := &config.ToolConfig{
		Name:               "tool1",
		InstallationMethod: "mock-test1",
		Binaries:           testutil.DeclaredBinaries("tool1-bin"),
	}

	tool2 := &config.ToolConfig{
		Name:               "tool2",
		InstallationMethod: "mock-test2",
		Binaries:           testutil.DeclaredBinaries("tool2-bin"),
	}

	t.Run("targeted install on uninstalled tool logs Installing at INFO", func(t *testing.T) {
		logBuf.Reset()
		if err := orch.InstallTool(config.WithTargeted(ctx, true), tool1, projCfg); err != nil {
			t.Fatalf("targeted InstallTool tool1 failed: %v", err)
		}
		out := logBuf.String()
		if !strings.Contains(out, "[tool1] Installing...") {
			t.Errorf("expected targeted install on uninstalled tool to log 'Installing...', got:\n%s", out)
		}
		if strings.Contains(out, "Already installed") {
			t.Errorf("expected targeted install on uninstalled tool NOT to log 'Already installed', got:\n%s", out)
		}
	})

	t.Run("targeted install on already-installed tool logs Already installed at INFO", func(t *testing.T) {
		logBuf.Reset()
		if err := orch.InstallTool(config.WithTargeted(ctx, true), tool1, projCfg); err != nil {
			t.Fatalf("targeted InstallTool tool1 (second run) failed: %v", err)
		}
		out := logBuf.String()
		if !strings.Contains(out, "[tool1] Already installed") {
			t.Errorf("expected targeted install on already-installed tool to log 'Already installed', got:\n%s", out)
		}
		if strings.Contains(out, "[tool1] Installing...") {
			t.Errorf("expected targeted install on already-installed tool NOT to log 'Installing...', got:\n%s", out)
		}
	})

	t.Run("batch install where tool is already installed does not log Already installed or Installing at INFO", func(t *testing.T) {
		logBuf.Reset()
		if err := orch.InstallTools(ctx, []*config.ToolConfig{tool1}, projCfg); err != nil {
			t.Fatalf("batch InstallTools failed: %v", err)
		}
		out := logBuf.String()
		if strings.Contains(out, "Already installed") {
			t.Errorf("expected batch install of already-installed tool NOT to log 'Already installed' at info level, got:\n%s", out)
		}
		if strings.Contains(out, "[tool1] Installing...") {
			t.Errorf("expected batch install of already-installed tool NOT to log 'Installing...', got:\n%s", out)
		}
	})

	t.Run("batch install with an uninstalled tool logs Installing for uninstalled tool only", func(t *testing.T) {
		logBuf.Reset()
		if err := orch.InstallTools(ctx, []*config.ToolConfig{tool1, tool2}, projCfg); err != nil {
			t.Fatalf("batch InstallTools (mixed) failed: %v", err)
		}
		out := logBuf.String()
		if !strings.Contains(out, "[tool2] Installing...") {
			t.Errorf("expected batch install of uninstalled tool2 to log 'Installing...', got:\n%s", out)
		}
		if strings.Contains(out, "[tool1] Installing...") {
			t.Errorf("expected batch install of already-installed tool1 NOT to log 'Installing...', got:\n%s", out)
		}
		if strings.Contains(out, "Already installed") {
			t.Errorf("expected batch install NOT to log 'Already installed' at info level, got:\n%s", out)
		}
	})

	t.Run("targeted install with force on already-installed tool logs Installing", func(t *testing.T) {
		logBuf.Reset()
		if err := orch.InstallTool(config.WithForce(config.WithTargeted(ctx, true), true), tool1, projCfg); err != nil {
			t.Fatalf("forced targeted InstallTool tool1 failed: %v", err)
		}
		out := logBuf.String()
		if !strings.Contains(out, "[tool1] Installing...") {
			t.Errorf("expected forced targeted install to log 'Installing...', got:\n%s", out)
		}
		if strings.Contains(out, "Already installed") {
			t.Errorf("expected forced targeted install NOT to log 'Already installed', got:\n%s", out)
		}
	})
}

func TestLineLogWriter(t *testing.T) {
	t.Parallel()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Writer: &logBuf})

	lw := logger.NewLineWriter(log, "[prefix]")
	_, err := lw.Write([]byte("message line 1\nmessage line 2\nunfinished line"))
	if err != nil {
		t.Fatalf("lineLogWriter Write failed: %v", err)
	}
	lw.Flush()

	out := logBuf.String()
	if !strings.Contains(out, "message line 1") || !strings.Contains(out, "unfinished line") {
		t.Errorf("expected lineLogWriter to flush lines, got %q", out)
	}
}
