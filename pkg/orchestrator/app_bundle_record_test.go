package orchestrator

import (
	"context"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/db"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/installer"
	"github.com/alexgorbatchev/dotfiles/pkg/registry"
)

// bundleInstaller installs an app bundle, as the dmg installer does, and records the
// Installation each Uninstall is handed.
type bundleInstaller struct {
	bundle      string
	uninstalled []installer.Installation
}

func (b *bundleInstaller) Name() string       { return "bundle" }
func (b *bundleInstaller) SupportsSudo() bool { return false }
func (b *bundleInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*installer.InstallResult, error) {
	return &installer.InstallResult{AppBundlePath: b.bundle}, nil
}
func (b *bundleInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig, installed installer.Installation) error {
	b.uninstalled = append(b.uninstalled, installed)
	return nil
}
func (b *bundleInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*installer.UpdateCheckResult, error) {
	return nil, installer.ErrUpdateCheckUnsupported
}

// TestUninstallToolHandsTheInstallerTheRecordedBundle is the orchestrator half of
// issue #174: the bundle an install reported is recorded, and the uninstall hands it
// back to the installer, which has no other way to learn a name the volume chose.
func TestUninstallToolHandsTheInstallerTheRecordedBundle(t *testing.T) {
	const bundle = "/Applications/Visual Studio Code.app"
	tests := []struct {
		name   string
		bundle string
	}{
		{name: "an installer that placed a bundle", bundle: bundle},
		{name: "an installer that placed none", bundle: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			sqlDB, err := db.NewConnection(ctx, ":memory:")
			if err != nil {
				t.Fatalf("opening database: %v", err)
			}
			t.Cleanup(func() { _ = sqlDB.Close() })
			reg := registry.NewRegistry(sqlDB)
			inst := &bundleInstaller{bundle: tt.bundle}
			instReg := installer.NewRegistry()
			if err := instReg.Register(inst); err != nil {
				t.Fatalf("Register: %v", err)
			}
			orch := NewOrchestrator(nil, fs.NewMemFS(), exec.NewMockRunner(), reg, instReg)
			projCfg := &config.ProjectConfig{Paths: config.PathsConfig{
				HomeDir: "/home/user", TargetDir: "/home/user/bin", BinariesDir: "/home/user/binaries",
			}}
			tool := &config.ToolConfig{Name: "vscode", InstallationMethod: "bundle"}

			if err := orch.InstallTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("InstallTool: %v", err)
			}
			rec, err := reg.GetToolInstallation(ctx, "vscode")
			if err != nil || rec == nil {
				t.Fatalf("GetToolInstallation = %v, %v", rec, err)
			}
			// An installer that placed no bundle leaves the column NULL, not an empty path.
			switch {
			case tt.bundle == "" && rec.AppBundlePath != nil:
				t.Errorf("recorded AppBundlePath %q, want none", *rec.AppBundlePath)
			case tt.bundle != "" && (rec.AppBundlePath == nil || *rec.AppBundlePath != tt.bundle):
				t.Errorf("recorded AppBundlePath %v, want %q", rec.AppBundlePath, tt.bundle)
			}

			if err := orch.UninstallTool(ctx, tool, projCfg); err != nil {
				t.Fatalf("UninstallTool: %v", err)
			}
			want := installer.Installation{AppBundlePath: tt.bundle}
			if len(inst.uninstalled) != 1 || inst.uninstalled[0] != want {
				t.Errorf("Uninstall was handed %+v, want [%+v]", inst.uninstalled, want)
			}
		})
	}
}

// TestUninstallToolWithoutARecord hands the installer the zero Installation when
// dotfiles holds no record of the tool, which is how an installer learns it has none.
func TestUninstallToolWithoutARecord(t *testing.T) {
	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	inst := &bundleInstaller{}
	instReg := installer.NewRegistry()
	if err := instReg.Register(inst); err != nil {
		t.Fatalf("Register: %v", err)
	}
	orch := NewOrchestrator(nil, fs.NewMemFS(), exec.NewMockRunner(), registry.NewRegistry(sqlDB), instReg)
	projCfg := &config.ProjectConfig{Paths: config.PathsConfig{BinariesDir: "/home/user/binaries"}}

	if err := orch.UninstallTool(ctx, &config.ToolConfig{Name: "vscode", InstallationMethod: "bundle"}, projCfg); err != nil {
		t.Fatalf("UninstallTool: %v", err)
	}
	if len(inst.uninstalled) != 1 || inst.uninstalled[0] != (installer.Installation{}) {
		t.Errorf("Uninstall was handed %+v, want one zero Installation", inst.uninstalled)
	}
}

// TestUninstallToolReportsAnUnreadableRecord fails an uninstall whose installation
// record cannot be read, instead of handing the installer an empty Installation that
// would read as "no record".
func TestUninstallToolReportsAnUnreadableRecord(t *testing.T) {
	ctx := context.Background()
	sqlDB, err := db.NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	inst := &bundleInstaller{}
	instReg := installer.NewRegistry()
	if err := instReg.Register(inst); err != nil {
		t.Fatalf("Register: %v", err)
	}
	orch := NewOrchestrator(nil, fs.NewMemFS(), exec.NewMockRunner(), registry.NewRegistry(sqlDB), instReg)
	_ = sqlDB.Close()

	err = orch.UninstallTool(ctx, &config.ToolConfig{Name: "vscode", InstallationMethod: "bundle"}, &config.ProjectConfig{})
	if err == nil || !strings.Contains(err.Error(), "reading the installation record of vscode") {
		t.Fatalf("UninstallTool = %v, want the record read failure", err)
	}
	if len(inst.uninstalled) != 0 {
		t.Errorf("Uninstall ran with %+v despite the unreadable record", inst.uninstalled)
	}
}
