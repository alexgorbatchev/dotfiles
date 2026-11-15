package installer

import (
	"context"
	"reflect"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestUninstallUsesInstalledPackageIdentity(t *testing.T) {
	tests := []struct {
		method   string
		identity PackageIdentity
		command  string
		args     []string
	}{
		{"brew", PackageIdentity{Name: "original", Cask: true}, "brew", []string{"uninstall", "--cask", "--", "original"}},
		{"npm", PackageIdentity{Name: "@scope/original", Manager: "bun"}, "bun", []string{"remove", "-g", "--", "@scope/original"}},
		{"uv", PackageIdentity{Name: "httpie"}, "uv", []string{"tool", "uninstall", "httpie"}},
		{"apt", PackageIdentity{Name: "original", Sudo: true}, "sudo", []string{"apt-get", "remove", "-y", "--", "original"}},
		{"dnf", PackageIdentity{Name: "original", Sudo: true}, "sudo", []string{"dnf", "remove", "-y", "original"}},
		{"pacman", PackageIdentity{Name: "original", Sudo: true}, "sudo", []string{"pacman", "-R", "--noconfirm", "--", "original"}},
		{"cargo", PackageIdentity{Name: "original"}, "cargo", []string{"uninstall", "--", "original"}},
		{"cargo", PackageIdentity{Name: "original", Managed: true}, "", nil},
	}
	for _, tt := range tests {
		t.Run(tt.method+tt.command, func(t *testing.T) {
			runner := exec.NewMockRunner()
			fsys := fs.NewMemFS()
			instances := map[string]Installer{
				"brew":   NewBrewInstaller(runner, fsys, nil),
				"npm":    NewNpmInstaller(runner, fsys, nil),
				"uv":     NewUvInstaller(runner, fsys, nil),
				"apt":    NewAptInstaller(runner, fsys, nil),
				"dnf":    NewDnfInstaller(runner, fsys, nil),
				"pacman": NewPacmanInstaller(runner, fsys, nil),
				"cargo":  NewCargoInstaller(runner, fsys, nil, nil),
			}
			tool := &config.ToolConfig{Name: "unrelated", InstallParams: map[string]interface{}{
				"formula": "changed", "package": "changed", "crateName": "changed", "packageManager": "npm",
			}}
			if err := instances[tt.method].Uninstall(context.Background(), tool, Installation{Package: &tt.identity}); err != nil {
				t.Fatal(err)
			}
			if tt.command == "" {
				if len(runner.History) != 0 {
					t.Fatalf("managed installation ran global uninstall: %+v", runner.History)
				}
				return
			}
			if len(runner.History) != 1 {
				t.Fatalf("commands = %+v", runner.History)
			}
			got := runner.History[0]
			if got.Name != tt.command || !reflect.DeepEqual(got.Args, tt.args) {
				t.Fatalf("command = %s %v, want %s %v", got.Name, got.Args, tt.command, tt.args)
			}
		})
	}
}

func TestInstallRecordsPackageForLaterUninstall(t *testing.T) {
	for _, method := range []string{"brew", "npm", "uv", "apt", "dnf", "pacman"} {
		t.Run(method, func(t *testing.T) {
			runner := exec.NewMockRunner()
			fsys := fs.NewMemFS()
			instances := map[string]Installer{
				"brew": NewBrewInstaller(runner, fsys, nil), "npm": NewNpmInstaller(runner, fsys, nil),
				"uv": NewUvInstaller(runner, fsys, nil), "apt": NewAptInstaller(runner, fsys, nil),
				"dnf": NewDnfInstaller(runner, fsys, nil), "pacman": NewPacmanInstaller(runner, fsys, nil),
			}
			tool := &config.ToolConfig{Name: "unrelated", InstallParams: map[string]interface{}{"package": "actual-package", "formula": "actual-package", "packageManager": "bun"}}
			inst := instances[method]
			result, err := inst.Install(context.Background(), tool)
			if err != nil {
				t.Fatal(err)
			}
			if result.Package == nil || result.Package.Name != "actual-package" {
				t.Fatalf("recorded identity = %+v", result.Package)
			}
			if method == "npm" && result.Package.Manager != "bun" {
				t.Fatalf("lost package manager: %+v", result.Package)
			}
			tool.InstallParams = nil
			runner.Clear()
			if err := inst.Uninstall(context.Background(), tool, Installation{Package: result.Package}); err != nil {
				t.Fatal(err)
			}
			if len(runner.History) != 1 || runner.History[0].Args[len(runner.History[0].Args)-1] != "actual-package" {
				t.Fatalf("uninstall = %+v", runner.History)
			}
		})
	}
}
