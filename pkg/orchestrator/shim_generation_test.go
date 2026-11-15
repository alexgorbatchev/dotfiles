package orchestrator

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/shell"
	"github.com/alexgorbatchev/dotfiles/pkg/usagelog"
)

// shimBinaries is the one place that decides which binaries a tool gets shims for,
// shared by generation and the stale cleanup.
func TestShimBinaries(t *testing.T) {
	t.Parallel()
	bins := testutil.DeclaredBinaries("foo", "bar")
	tests := []struct {
		name string
		tool *config.ToolConfig
		want string
	}{
		{
			name: "manual without binaryPath",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins},
		},
		{
			name: "manual with only an after-install hook",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins, InstallParams: map[string]interface{}{"hooks": []any{"after-install"}}},
		},
		{
			name: "manual with binaryPath",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins, InstallParams: map[string]interface{}{"binaryPath": "./foo"}},
			want: "foo,bar",
		},
		{
			name: "manual staged by a before-install hook",
			tool: &config.ToolConfig{InstallationMethod: "manual", Binaries: bins, InstallParams: map[string]interface{}{"hooks": []any{"before-install"}}},
			want: "foo,bar",
		},
		{
			name: "github release",
			tool: &config.ToolConfig{InstallationMethod: "github", Binaries: bins},
			want: "foo,bar",
		},
		{
			name: "no installation method",
			tool: &config.ToolConfig{Binaries: bins},
			want: "foo,bar",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := strings.Join(shimBinaries(tt.tool), ","); got != tt.want {
				t.Errorf("shimBinaries() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestGenerateTool_ExternalToolBootstrapShimTargetsCurrentEntrypoint(t *testing.T) {
	t.Parallel()
	methods := []string{"brew", "apt", "dnf", "pacman", "npm", "pkg", "dmg"}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			memFS := newMemFS()
			orch := newTestOrchestrator(t, memFS, "/home/user/dotfiles.config.ts")

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/bin",
					BinariesDir:  "/home/user/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}
			tool := &config.ToolConfig{
				Name:               method + "--" + bootstrapTestBinName,
				InstallationMethod: method,
				Binaries:           testutil.DeclaredBinaries(bootstrapTestBinName),
			}

			if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("GenerateTool failed: %v", err)
			}

			shimBytes, err := memFS.ReadFile(filepath.Join("/home/user/bin", bootstrapTestBinName))
			if err != nil {
				t.Fatalf("expected bootstrap shim to exist: %v", err)
			}
			shim := string(shimBytes)

			// v1 pointed every shim at the dotfiles-managed entrypoint; the install
			// pipeline materialises it as a symlink to the real binary on success.
			wantExecutable := "TOOL_EXECUTABLE=" + shell.Quote(filepath.Join("/home/user/binaries", tool.Name, "current", bootstrapTestBinName))
			if !strings.Contains(shim, wantExecutable) {
				t.Errorf("bootstrap shim must target the current entrypoint, want %s in:\n%s", wantExecutable, shim)
			}
			if strings.Contains(shim, "/usr/bin/"+bootstrapTestBinName) {
				t.Errorf("bootstrap shim must never guess a system path:\n%s", shim)
			}
		})
	}
}

func TestInstallTool_ExternalToolShimTarget(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		// binaryExists controls whether the path the installer reports is present
		// on disk, as it is after a real install, or missing, as when an installer
		// could only guess where the package manager put the binary.
		binaryExists bool
	}{
		{name: "installer reports a real binary", binaryExists: true},
		{name: "installer reports a missing binary", binaryExists: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			memFS := newMemFS()
			runner := exec.NewMockRunner()
			log := logger.New(logger.Config{Level: logger.LogLevelQuiet, Writer: io.Discard})

			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("failed to open sqlite DB: %v", err)
			}
			defer sqlDB.Close()
			reg := registry.NewRegistry(sqlDB)
			instReg := installer.NewRegistry()

			reportedBinary := filepath.Join("/home/user/external-prefix/bin", bootstrapTestBinName)
			if tt.binaryExists {
				_ = memFS.MkdirAll(filepath.Dir(reportedBinary), 0755)
				_ = memFS.WriteFile(reportedBinary, []byte("binary-content"), 0755)
			}
			_ = instReg.Register(&mockInstaller{name: "brew", binaries: []string{reportedBinary}})

			orch := NewOrchestrator(log, memFS, runner, reg, instReg)
			orch.SetSymlinkFS(memFS)

			projCfg := &config.ProjectConfig{
				Paths: config.PathsConfig{
					HomeDir:      "/home/user",
					TargetDir:    "/home/user/bin",
					BinariesDir:  "/home/user/binaries",
					GeneratedDir: "/home/user/.generated",
				},
			}
			tool := &config.ToolConfig{
				Name:               "brew--" + bootstrapTestBinName,
				InstallationMethod: "brew",
				Binaries:           testutil.DeclaredBinaries(bootstrapTestBinName),
			}

			if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("InstallTool failed: %v", err)
			}

			shimBytes, err := memFS.ReadFile(filepath.Join("/home/user/bin", bootstrapTestBinName))
			if err != nil {
				t.Fatalf("expected shim to exist: %v", err)
			}
			shim := string(shimBytes)

			toolDir := filepath.Join("/home/user/binaries", tool.Name)
			currentEntrypoint := filepath.Join(toolDir, "current", bootstrapTestBinName)

			wantExecutable := "TOOL_EXECUTABLE=" + shell.Quote(currentEntrypoint)
			if tt.binaryExists {
				wantExecutable = "TOOL_EXECUTABLE=" + shell.Quote(reportedBinary)
			}
			if !strings.Contains(shim, wantExecutable) {
				t.Errorf("want %s in shim:\n%s", wantExecutable, shim)
			}
			if strings.Contains(shim, "/usr/bin/"+bootstrapTestBinName) {
				t.Errorf("shim must never guess a system path:\n%s", shim)
			}

			// The bootstrap shim re-checks its baked-in current entrypoint after a
			// successful install, so the install pipeline must have linked that
			// entrypoint to the binary the installer reported.
			currentTarget, err := memFS.Readlink(filepath.Join(toolDir, "current"))
			if err != nil {
				t.Fatalf("expected current symlink for external tool: %v", err)
			}
			if currentTarget != "external" {
				t.Errorf("expected current -> external, got %q", currentTarget)
			}
			entrypointTarget, err := memFS.Readlink(filepath.Join(toolDir, "external", bootstrapTestBinName))
			if err != nil {
				t.Fatalf("expected external entrypoint symlink: %v", err)
			}
			if entrypointTarget != reportedBinary {
				t.Errorf("expected entrypoint -> %s, got %q", reportedBinary, entrypointTarget)
			}
		})
	}
}

func TestGenerateTool_UninstalledToolNeverTargetsSameNamedSystemBinary(t *testing.T) {
	t.Parallel()
	const binName = "git"

	for _, method := range []string{"brew", "apt", "github-release"} {
		t.Run(method, func(t *testing.T) {
			t.Parallel()
			orch, memFS, logBuf, projCfg := newShimTargetOrchestrator(t, binName)
			tool := &config.ToolConfig{
				Name:               binName,
				InstallationMethod: method,
				Binaries:           testutil.DeclaredBinaries(binName),
			}

			if err := orch.GenerateTool(context.Background(), tool, projCfg); err != nil {
				t.Fatalf("GenerateTool failed: %v", err)
			}

			shimBytes, err := memFS.ReadFile(filepath.Join(projCfg.Paths.TargetDir, binName))
			if err != nil {
				t.Fatalf("expected shim to exist: %v", err)
			}
			shim := string(shimBytes)

			// The shim installs the tool on first use only while its target is missing,
			// so an uninstalled tool must target its own entrypoint, never /usr/bin/git.
			want := "TOOL_EXECUTABLE=" + shell.Quote(filepath.Join(projCfg.Paths.BinariesDir, binName, "current", binName))
			if !strings.Contains(shim, want) {
				t.Errorf("want %s in shim:\n%s", want, shim)
			}
			if strings.Contains(shim, "/usr/bin/"+binName) {
				t.Errorf("uninstalled tool's shim targets the system binary:\n%s", shim)
			}
			if strings.Contains(logBuf.String(), "which dotfiles did not install") {
				t.Errorf("uninstalled tool must not report a substitute binary, log:\n%s", logBuf.String())
			}
		})
	}
}

func TestGenerateTool_InstalledToolWithMissingBinaryReportsSystemSubstitute(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	const binName = "docker"
	orch, memFS, logBuf, projCfg := newShimTargetOrchestrator(t, binName)
	tool := &config.ToolConfig{
		Name:               "orbstack",
		InstallationMethod: "brew",
		Binaries:           testutil.DeclaredBinaries(binName),
	}

	// The recorded binary is gone and current holds no entrypoint, as for a cask whose
	// binaries land outside the prefix its installer reported.
	if err := orch.reg.WithTx(ctx, func(tx *sql.Tx) error {
		return orch.reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    tool.Name,
			Version:     "1.0.0",
			InstallPath: filepath.Join(projCfg.Paths.BinariesDir, tool.Name),
			Timestamp:   "now",
			InstalledAt: 100,
			BinaryPaths: `["/opt/homebrew/opt/orbstack/bin/docker"]`,
		})
	}); err != nil {
		t.Fatalf("recording installation: %v", err)
	}

	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool failed: %v", err)
	}

	shimBytes, err := memFS.ReadFile(filepath.Join(projCfg.Paths.TargetDir, binName))
	if err != nil {
		t.Fatalf("expected shim to exist: %v", err)
	}
	if want := "TOOL_EXECUTABLE=" + shell.Quote("/usr/bin/"+binName); !strings.Contains(string(shimBytes), want) {
		t.Errorf("want %s in shim:\n%s", want, shimBytes)
	}

	wantWarn := `WARN	[orbstack] Installed binary "docker" is missing at ~/binaries/orbstack/current/docker; its shim runs /usr/bin/docker, which dotfiles did not install`
	if !strings.Contains(logBuf.String(), wantWarn) {
		t.Errorf("want warning %q, log:\n%s", wantWarn, logBuf.String())
	}
}

func TestInstallThenGenerate_SystemSubstituteIsReportedEveryTime(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	const binName = "docker"
	orch, memFS, logBuf, projCfg := newShimTargetOrchestrator(t, binName)

	// The installer reports a binary that is not there, as OrbStack's cask does, so the
	// shim can only fall back to the docker on PATH.
	reported := "/opt/homebrew/opt/orbstack/bin/docker"
	if err := orch.instRegistry.Register(&mockInstaller{name: "brew", binaries: []string{reported}}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}
	tool := &config.ToolConfig{
		Name:               "orbstack",
		InstallationMethod: "brew",
		Binaries:           testutil.DeclaredBinaries(binName),
	}
	wantWarn := `Installed binary "docker" is missing at ~/binaries/orbstack/current/docker; its shim runs /usr/bin/docker, which dotfiles did not install`
	wantTarget := "TOOL_EXECUTABLE=" + shell.Quote("/usr/bin/"+binName)
	shimPath := filepath.Join(projCfg.Paths.TargetDir, binName)

	if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("InstallTool failed: %v", err)
	}
	if shim, _ := memFS.ReadFile(shimPath); !strings.Contains(string(shim), wantTarget) {
		t.Errorf("after install, want %s in shim:\n%s", wantTarget, shim)
	}
	if !strings.Contains(logBuf.String(), wantWarn) {
		t.Errorf("install must report the substitute, log:\n%s", logBuf.String())
	}

	record, err := orch.reg.GetToolInstallation(ctx, tool.Name)
	if err != nil || record == nil {
		t.Fatalf("expected an installation record, got %v, %v", record, err)
	}
	if strings.Contains(record.BinaryPaths, "/usr/bin/") {
		t.Errorf("the substitute was recorded as the tool's binary: %s", record.BinaryPaths)
	}

	logBuf.Reset()
	if err := orch.GenerateTool(ctx, tool, projCfg); err != nil {
		t.Fatalf("GenerateTool failed: %v", err)
	}
	if shim, _ := memFS.ReadFile(shimPath); !strings.Contains(string(shim), wantTarget) {
		t.Errorf("after generate, want %s in shim:\n%s", wantTarget, shim)
	}
	if !strings.Contains(logBuf.String(), wantWarn) {
		t.Errorf("generate after install must still report the substitute, log:\n%s", logBuf.String())
	}
}

// Install and generate have to agree on the set of shims a tool owns. The declared
// .bin() set is that set: an installer-reported binary the tool never declared used to
// get a shim on install and lose it to the next generate's stale-shim cleanup, which
// an install would then put back.
func TestOrchestrator_UndeclaredBinariesLogLevel(t *testing.T) {
	t.Parallel()
	for _, tt := range []struct {
		name        string
		level       logger.LogLevel
		wantMessage bool
	}{
		{"default", logger.LogLevelDefault, false},
		{"verbose", logger.LogLevelVerbose, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var output bytes.Buffer
			orch := &Orchestrator{logger: logger.New(logger.Config{Level: tt.level, Writer: &output})}
			orch.warnUndeclaredBinaries(&config.ToolConfig{Name: "reporting-tool"}, []string{"extra-bin"})
			message := "Installer reported binaries the tool does not declare with .bin(): extra-bin"
			if got := strings.Contains(output.String(), message); got != tt.wantMessage {
				t.Errorf("message present = %v, want %v; output: %s", got, tt.wantMessage, output.String())
			}
		})
	}
}

func TestOrchestrator_InstallTool_ShimsOnlyDeclaredBinaries(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	// The installer reports a binary the tool declares, one it does not, and an
	// absolute path for a declared binary it placed outside the tool's current dir.
	_ = instReg.Register(&mockInstaller{
		name:     "custom-method",
		binaries: []string{"declared-bin", "extra-bin", "/opt/vendor/bin/elsewhere-bin"},
	})

	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	orch := NewOrchestrator(log, fsys, runner, reg, instReg)
	orch.SetSymlinkFS(fsys)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:      "/home/user",
			TargetDir:    "/home/user/bin",
			BinariesDir:  "/home/user/binaries",
			GeneratedDir: "/home/user/.generated",
		},
	}
	_ = fsys.MkdirAll("/home/user/bin", 0755)
	_ = fsys.MkdirAll("/home/user/binaries/reporting-tool/current", 0755)
	_ = fsys.WriteFile("/home/user/binaries/reporting-tool/current/declared-bin", []byte("bin"), 0755)
	_ = fsys.MkdirAll("/opt/vendor/bin", 0755)
	_ = fsys.WriteFile("/opt/vendor/bin/elsewhere-bin", []byte("bin"), 0755)

	version := "1.2.3"
	tool := &config.ToolConfig{
		Name:               "reporting-tool",
		Version:            &version,
		InstallationMethod: "custom-method",
		Binaries:           testutil.DeclaredBinaries("declared-bin", "elsewhere-bin"),
	}
	tools := []*config.ToolConfig{tool}

	if err := orch.InstallTools(ctx, tools, projCfg); err != nil {
		t.Fatalf("InstallTools failed: %v", err)
	}

	for _, bin := range []string{"declared-bin", "elsewhere-bin"} {
		if exists, _ := fsys.Exists(filepath.Join("/home/user/bin", bin)); !exists {
			t.Errorf("expected a shim for the declared binary %q", bin)
		}
	}
	if exists, _ := fsys.Exists("/home/user/bin/extra-bin"); exists {
		t.Error("expected no shim for the installer-reported binary the tool does not declare")
	}

	warning := `Installer reported binaries the tool does not declare with .bin(): extra-bin`
	if !strings.Contains(logBuf.String(), warning) {
		t.Errorf("expected a warning naming the undeclared binary, got:\n%s", logBuf.String())
	}

	// A declared binary the installer placed elsewhere is shimmed at the path it
	// reported, not at the tool's current directory.
	shim, err := fsys.ReadFile("/home/user/bin/elsewhere-bin")
	if err != nil {
		t.Fatalf("reading the elsewhere-bin shim: %v", err)
	}
	if !strings.Contains(string(shim), "/opt/vendor/bin/elsewhere-bin") {
		t.Errorf("expected the shim to target the installer-reported path, got:\n%s", shim)
	}

	logBuf.Reset()
	if err := orch.GenerateTools(ctx, tools, projCfg); err != nil {
		t.Fatalf("GenerateTools failed: %v", err)
	}
	for _, line := range strings.Split(logBuf.String(), "\n") {
		if strings.Contains(line, "Removing stale shim") && strings.Contains(line, "~/bin/") {
			t.Errorf("generate removed a shim install had just written: %s", strings.TrimSpace(line))
		}
	}
	for _, bin := range []string{"declared-bin", "elsewhere-bin"} {
		if exists, _ := fsys.Exists(filepath.Join("/home/user/bin", bin)); !exists {
			t.Errorf("expected the shim for %q to survive generate", bin)
		}
	}
	if exists, _ := fsys.Exists("/home/user/bin/extra-bin"); exists {
		t.Error("expected generate not to produce a shim for the undeclared binary either")
	}
}

// The target directory and the usage-log directory belong to the project, not to
// whichever tool happened to be installed first: both hold artifacts of every tool.
// Recorded as one tool's shims they become stale shims of that tool the moment it is
// generated, and the cleanup deletes them, taking the usage log with them as soon as
// the directory is empty enough for Remove to succeed.
func TestInstallThenGenerate_SystemDirectoriesAreNotToolOwnedShims(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	var logBuf bytes.Buffer
	log := logger.New(logger.Config{Level: logger.LogLevelVerbose, Writer: &logBuf})
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed creating DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	if err := instReg.Register(&mockInstaller{name: "manual"}); err != nil {
		t.Fatalf("registering installer: %v", err)
	}

	orch := NewOrchestrator(log, fsys, runner, reg, instReg)
	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			TargetDir:       "/home/user/.generated/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
			GeneratedDir:    "/home/user/.generated",
		},
	}

	if err := fsys.MkdirAll("/opt/probe", 0755); err != nil {
		t.Fatalf("creating binary directory: %v", err)
	}
	if err := fsys.WriteFile("/opt/probe/probe", []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("writing binary: %v", err)
	}

	tool := &config.ToolConfig{
		Name:               "probe",
		Binaries:           testutil.DeclaredBinaries("probe"),
		ConfigFilePath:     "/home/user/tools/probe.tool.ts",
		InstallationMethod: "manual",
		InstallParams:      map[string]interface{}{"binaryPath": "/opt/probe/probe"},
	}

	// A fresh project: nothing pre-creates the directories the install pipeline needs.
	if err := orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("InstallTools: %v", err)
	}
	if exists, _ := fsys.Exists(filepath.Join(projCfg.Paths.TargetDir, "probe")); !exists {
		t.Fatal("expected install to generate a shim for the declared binary")
	}

	usageDir := usagelog.Dir(projCfg.Paths.GeneratedDir)
	usageLogPath := usagelog.Path(projCfg.Paths.GeneratedDir)
	if err := fsys.WriteFile(usageLogPath, []byte("v1\t1700000000\tprobe\tprobe\n"), 0644); err != nil {
		t.Fatalf("writing usage log: %v", err)
	}

	systemDirs := map[string]bool{}
	for _, dir := range []string{projCfg.Paths.TargetDir, usageDir} {
		systemDirs[dir] = true
		systemDirs[orch.formatPath(projCfg, dir)] = true
	}

	states, err := reg.GetFileStatesForTool(ctx, tool.Name)
	if err != nil {
		t.Fatalf("reading file states: %v", err)
	}
	for _, state := range states {
		if systemDirs[state.FilePath] {
			t.Errorf("install recorded the shared directory %s as a file of tool %q (type %q)", state.FilePath, tool.Name, state.FileType)
		}
	}

	logBuf.Reset()
	if err := orch.GenerateTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("GenerateTools: %v", err)
	}

	const marker = "Removing stale shim: "
	for _, line := range strings.Split(logBuf.String(), "\n") {
		idx := strings.Index(line, marker)
		if idx < 0 {
			continue
		}
		if named := strings.TrimSpace(line[idx+len(marker):]); systemDirs[named] {
			t.Errorf("generate reported removing the shared directory %s as a stale shim", named)
		}
	}

	if exists, _ := fsys.Exists(usageLogPath); !exists {
		t.Error("expected the usage log written before generate to survive it")
	}
	for dir := range systemDirs {
		if strings.HasPrefix(dir, "~") {
			continue
		}
		if exists, _ := fsys.Exists(dir); !exists {
			t.Errorf("expected %s to survive generate", dir)
		}
	}
}
