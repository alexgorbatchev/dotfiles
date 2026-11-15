package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"regexp"
	"testing"

	"github.com/alexgorbatchev/dotfiles/internal/testutil"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
	"github.com/alexgorbatchev/dotfiles/pkg/version"
)

// TestOrchestrator_InstallFollowsInstallParamVersionPin pins that the installation
// record and the already-installed check read the version the installer installs
// (config.ToolConfig.RequestedVersion). A `version` install parameter wins over
// .version() for github-release, so the record holds the parameter's version, and
// changing the parameter reinstalls an installed tool instead of leaving it at the
// old pin.
func TestOrchestrator_InstallFollowsInstallParamVersionPin(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()
	reg := registry.NewRegistry(sqlDB)
	instReg := installer.NewRegistry()
	mockInst := &mockInstaller{name: "github-release", binaries: []string{"pinned-bin"}}
	_ = instReg.Register(mockInst)
	orch := NewOrchestrator(nil, fsys, exec.NewMockRunner(), reg, instReg)
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
	_ = fsys.MkdirAll("/home/user/binaries", 0755)
	_ = fsys.MkdirAll("/home/user/.generated/usage", 0755)

	dotVersion := "v0.2.0"
	tool := &config.ToolConfig{
		Name:               "pinned",
		Version:            &dotVersion,
		InstallationMethod: "github-release",
		InstallParams:      map[string]any{"repo": "acme/pinned", "version": "v0.1.0"},
		Binaries:           testutil.DeclaredBinaries("pinned-bin"),
	}
	recorded := func(t *testing.T) string {
		t.Helper()
		rec, err := reg.GetToolInstallation(ctx, "pinned")
		if err != nil || rec == nil {
			t.Fatalf("installation record = %+v, %v", rec, err)
		}
		return rec.Version
	}

	if err := orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("installing: %v", err)
	}
	if got := recorded(t); got != "v0.1.0" {
		t.Errorf("recorded version = %q, want the v0.1.0 the install parameter pins", got)
	}

	tool.InstallParams["version"] = "v0.3.0"
	if err := orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("installing with the changed pin: %v", err)
	}
	if mockInst.installCount != 2 {
		t.Errorf("installer ran %d time(s), want 2: a changed pin must reinstall the tool", mockInst.installCount)
	}
	if got := recorded(t); got != "v0.3.0" {
		t.Errorf("recorded version after the pin changed = %q, want v0.3.0", got)
	}

	// A range names no installed version, so the record falls back to what the
	// installer reports, here nothing, and so to a timestamp.
	tool.InstallParams["version"] = "^0.3.0"
	if err := orch.InstallTools(config.WithForce(ctx, true), []*config.ToolConfig{tool}, projCfg); err != nil {
		t.Fatalf("installing with a range: %v", err)
	}
	if got := recorded(t); got == "^0.3.0" || !timestampPattern.MatchString(got) {
		t.Errorf("recorded version for a range = %q, want a generated timestamp", got)
	}
}

var timestampPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$`)

func TestOrchestrator_Install_UnversionedToolTimestamp(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	fsys := newMemFS()
	runner := exec.NewMockRunner()

	sqlDB, err := db.NewConnection(ctx, fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name()))
	if err != nil {
		t.Fatalf("failed to open sqlite DB: %v", err)
	}
	defer sqlDB.Close()

	reg := registry.NewRegistry(sqlDB)
	log := logger.New(logger.Config{Writer: io.Discard})

	mockInst := &mockInstaller{
		name:     "mock-unversioned",
		binaries: []string{"unversioned-bin"},
	}

	instReg := installer.NewRegistry()
	_ = instReg.Register(mockInst)

	projCfg := &config.ProjectConfig{
		Paths: config.PathsConfig{
			HomeDir:         "/home/user",
			DotfilesDir:     "/home/user/dotfiles",
			TargetDir:       "/home/user/bin",
			BinariesDir:     "/home/user/.generated/binaries",
			GeneratedDir:    "/home/user/.generated",
			ShellScriptsDir: "/home/user/.generated/shell-scripts",
		},
	}

	orch := NewOrchestrator(log, fsys, runner, reg, instReg)

	versionLatest := "latest"
	tool := &config.ToolConfig{
		Name:               "signal",
		InstallationMethod: "mock-unversioned",
		Version:            &versionLatest,
		Binaries:           testutil.DeclaredBinaries("signal-bin"),
	}

	err = orch.InstallTools(ctx, []*config.ToolConfig{tool}, projCfg)
	if err != nil {
		t.Fatalf("unexpected pipeline failure: %v", err)
	}

	instRec, err := reg.GetToolInstallation(ctx, "signal")
	if err != nil {
		t.Fatalf("failed to get installation record: %v", err)
	}
	if instRec == nil {
		t.Fatal("expected tool installation record to be created, got nil")
	}

	// The version MUST be a timestamp (YYYY-MM-DD-HH-MM-SS) and NOT "latest" or "unknown"
	matched, err := regexp.MatchString(`^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$`, instRec.Version)
	if err != nil || !matched {
		t.Fatalf("expected unversioned tool installation to be timestamped YYYY-MM-DD-HH-MM-SS, got version: %q", instRec.Version)
	}
	if instRec.Version == "latest" || instRec.Version == "unknown" {
		t.Fatalf("version cannot be 'latest' or 'unknown', got %q", instRec.Version)
	}
}

func TestShouldSkipInstallationAndHealth(t *testing.T) {
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
			HomeDir:      "/home/test",
			DotfilesDir:  "/home/test/dotfiles",
			TargetDir:    "/home/test/.bin",
			BinariesDir:  "/home/test/.binaries",
			GeneratedDir: "/home/test/.generated",
		},
	}

	orch := NewOrchestrator(log, memFS, runner, reg, instReg)

	ver := "1.0.0"
	tool := &config.ToolConfig{
		Name:               "ripgrep",
		Version:            &ver,
		InstallationMethod: "github-release",
		Binaries:           testutil.DeclaredBinaries("rg"),
	}

	// 1. Not installed -> shouldSkip = false
	skip, err := orch.shouldSkipInstallation(ctx, tool, projCfg)
	if err != nil || skip {
		t.Errorf("expected skip=false when not installed, got skip=%v, err=%v", skip, err)
	}

	// 2. Record installation on disk & DB
	_ = memFS.MkdirAll("/home/test/.binaries/ripgrep/current", 0755)
	_ = memFS.WriteFile("/home/test/.binaries/ripgrep/current/rg", []byte("bin"), 0755)
	_ = memFS.MkdirAll("/opt/rg", 0755)
	_ = memFS.WriteFile("/opt/rg/rg", []byte("bin"), 0755)

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &registry.ToolInstallationRecord{
			ToolName:    "ripgrep",
			Version:     "1.0.0",
			InstallPath: "/opt/rg/rg",
			Timestamp:   "now",
			InstalledAt: 1000,
			BinaryPaths: `["/opt/rg/rg"]`,
		})
	})

	// 3. Healthy & matching version -> shouldSkip = true
	skip, err = orch.shouldSkipInstallation(ctx, tool, projCfg)
	if err != nil || !skip {
		t.Errorf("expected skip=true for healthy matching install, got skip=%v, err=%v", skip, err)
	}

	// 4. Version mismatch -> shouldSkip = false
	verNew := "2.0.0"
	toolNew := *tool
	toolNew.Version = &verNew
	skip, err = orch.shouldSkipInstallation(ctx, &toolNew, projCfg)
	if err != nil || skip {
		t.Errorf("expected skip=false for version mismatch, got skip=%v, err=%v", skip, err)
	}

	// 5. Force enabled -> shouldSkip = false
	ctxForce := config.WithForce(ctx, true)
	skip, err = orch.shouldSkipInstallation(ctxForce, tool, projCfg)
	if err != nil || skip {
		t.Errorf("expected skip=false when force enabled, got skip=%v, err=%v", skip, err)
	}

	// 6. Overwrite enabled without force -> shouldSkip = true
	ctxOverwrite := config.WithOverwrite(ctx, true)
	skip, err = orch.shouldSkipInstallation(ctxOverwrite, tool, projCfg)
	if err != nil || !skip {
		t.Errorf("expected skip=true when overwrite enabled without force, got skip=%v, err=%v", skip, err)
	}
}

func TestGetTargetVersion(t *testing.T) {
	t.Parallel()
	memFS := newMemFS()
	runner := exec.NewMockRunner()
	orch := NewOrchestrator(logger.New(logger.Config{Writer: io.Discard}), memFS, runner, nil, nil)

	ver1 := "v1.2.3"
	verConstraint := "^1.0.0"
	verLatest := "latest"

	// 1. Exact top level version
	t1 := &config.ToolConfig{Version: &ver1}
	if got := orch.getTargetVersion(t1); got != "v1.2.3" {
		t.Errorf("getTargetVersion(v1.2.3) = %q, want 'v1.2.3'", got)
	}

	// 2. Semver constraint -> returns empty
	t2 := &config.ToolConfig{Version: &verConstraint}
	if got := orch.getTargetVersion(t2); got != "" {
		t.Errorf("getTargetVersion(^1.0.0) = %q, want empty", got)
	}

	// 3. Latest -> returns empty
	t3 := &config.ToolConfig{Version: &verLatest}
	if got := orch.getTargetVersion(t3); got != "" {
		t.Errorf("getTargetVersion(latest) = %q, want empty", got)
	}

	// 4. Apt/Dnf version from InstallParams
	t4 := &config.ToolConfig{
		InstallationMethod: "apt",
		InstallParams: map[string]interface{}{
			"version": "v2.3.4",
		},
	}
	if got := orch.getTargetVersion(t4); got != "v2.3.4" {
		t.Errorf("getTargetVersion(apt v2.3.4) = %q, want 'v2.3.4'", got)
	}

	// 5. The target is the version the installer installs (config.ToolConfig.
	// RequestedVersion): an install parameter the method reads wins over .version(),
	// and .version() is the fallback for every method, apt included.
	ver0 := "v0.2.0"
	for _, tt := range []struct {
		name string
		tool *config.ToolConfig
		want string
	}{
		{"github-release version parameter", &config.ToolConfig{InstallationMethod: "github-release", Version: &verLatest, InstallParams: map[string]any{"version": "v0.1.0"}}, "v0.1.0"},
		{"the parameter wins over .version()", &config.ToolConfig{InstallationMethod: "gitea-release", Version: &ver0, InstallParams: map[string]any{"version": "v0.1.0"}}, "v0.1.0"},
		{"dmg github-release source version", &config.ToolConfig{InstallationMethod: "dmg", InstallParams: map[string]any{"source": map[string]any{"type": "github-release", "repo": "o/r", "version": "v3.0.0"}}}, "v3.0.0"},
		{"an apt version with a tilde is exact", &config.ToolConfig{InstallationMethod: "apt", InstallParams: map[string]any{"version": "1.0~rc1-1"}}, version.CleanVersion("1.0~rc1-1")},
		{"apt falls back to .version()", &config.ToolConfig{InstallationMethod: "apt", Version: &ver0}, "v0.2.0"},
		{"a parameter of latest overrides a .version() pin", &config.ToolConfig{InstallationMethod: "npm", Version: &ver0, InstallParams: map[string]any{"version": "latest"}}, ""},
		{"a parameter range is not an exact target", &config.ToolConfig{InstallationMethod: "npm", InstallParams: map[string]any{"version": "^3.0.0"}}, ""},
		{"a parameter the method never reads is no target", &config.ToolConfig{InstallationMethod: "cargo", Version: &verLatest, InstallParams: map[string]any{"version": "2.0.0"}}, ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := orch.getTargetVersion(tt.tool); got != tt.want {
				t.Errorf("getTargetVersion() = %q, want %q", got, tt.want)
			}
		})
	}
}
