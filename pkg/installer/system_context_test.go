package installer

import (
	"context"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/archive"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/downloader"
	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

// libcAssets is a release that publishes a build per C library, which is the case the
// libc half of a target exists to decide.
var libcAssets = []string{
	"tool-x86_64-unknown-linux-gnu.tar.gz",
	"tool-x86_64-unknown-linux-musl.tar.gz",
}

// The C library an asset is chosen for belongs to the target the run was invoked for.
// Detecting it from the host instead meant a run targeting musl installed the glibc
// build, and every run from a Mac installed whichever build sorted first.
//
// Both C libraries are exercised so that the assertion is about the requested target
// rather than about the host the test happens to run on.
func TestGitHubInstallerSelectsTheAssetForTheRunsLibc(t *testing.T) {
	tests := []struct {
		name string
		libc string
		want string
	}{
		{name: "musl", libc: arch.LibcMusl, want: "tool-x86_64-unknown-linux-musl.tar.gz"},
		{name: "gnu", libc: arch.LibcGnu, want: "tool-x86_64-unknown-linux-gnu.tar.gz"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assets := make([]githubAsset, 0, len(libcAssets))
			for _, name := range libcAssets {
				assets = append(assets, githubAsset{Name: name})
			}

			inst := NewGitHubInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, nil)
			SetSystemContext(inst, &SystemContext{OS: arch.OSLinux, Arch: arch.ArchAMD64, Libc: tt.libc})

			matched := inst.matchAsset(assets, "")
			if matched == nil {
				t.Fatalf("no asset matched %s/%s/%s", arch.OSLinux, arch.ArchAMD64, tt.libc)
			}
			if matched.Name != tt.want {
				t.Errorf("selected %q, want %q", matched.Name, tt.want)
			}
		})
	}
}

// gitea-release resolves assets the same way, from the same target.
func TestGiteaInstallerSelectsTheAssetForTheRunsLibc(t *testing.T) {
	tests := []struct {
		name string
		libc string
		want string
	}{
		{name: "musl", libc: arch.LibcMusl, want: "tool-x86_64-unknown-linux-musl.tar.gz"},
		{name: "gnu", libc: arch.LibcGnu, want: "tool-x86_64-unknown-linux-gnu.tar.gz"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			release := &giteaRelease{TagName: "v1.0.0"}
			for _, name := range libcAssets {
				release.Assets = append(release.Assets, giteaAsset{Name: name})
			}

			inst := NewGiteaInstaller(exec.NewMockRunner(), fs.NewMemFS(), nil, nil)
			SetSystemContext(inst, &SystemContext{OS: arch.OSLinux, Arch: arch.ArchAMD64, Libc: tt.libc})

			matched, err := inst.selectAsset(context.Background(), &config.ToolConfig{Name: "tool"}, release, "")
			if err != nil {
				t.Fatalf("selectAsset returned error: %v", err)
			}
			if matched.Name != tt.want {
				t.Errorf("selected %q, want %q", matched.Name, tt.want)
			}
		})
	}
}

// A function-valued install parameter is evaluated during the installation, so its
// systemInfo has to describe the target the installation is for. An assetSelector
// branching on systemInfo.platform or systemInfo.arch otherwise chose an asset for the
// host while the rest of the run was resolved for another machine.
func TestAssetSelectorSeesTheRunsTarget(t *testing.T) {
	tests := []struct {
		name       string
		sysCtx     *SystemContext
		wantAsset  string
		assetNames []string
	}{
		{
			name:       "linux amd64",
			sysCtx:     &SystemContext{OS: arch.OSLinux, Arch: arch.ArchAMD64},
			wantAsset:  "tool-linux-amd64",
			assetNames: []string{"tool-linux-amd64", "tool-darwin-arm64"},
		},
		{
			name:       "darwin arm64",
			sysCtx:     &SystemContext{OS: arch.OSDarwin, Arch: arch.ArchARM64},
			wantAsset:  "tool-darwin-arm64",
			assetNames: []string{"tool-linux-amd64", "tool-darwin-arm64"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := selectorReleaseServer(t, "v1.0.0", tt.assetNames)

			tool := writeSelectorTool(t, "targeted", `
				import { defineTool, Platform, Architecture } from "@alexgorbatchev/dotfiles";
				export default defineTool((install) =>
					install("github-release", {
						repo: "owner/targeted",
						assetSelector: ({ assets, systemInfo }) => {
							const os = systemInfo.platform === Platform.MacOS ? "darwin"
								: systemInfo.platform === Platform.Linux ? "linux" : "none";
							const cpu = systemInfo.arch === Architecture.Arm64 ? "arm64"
								: systemInfo.arch === Architecture.X86_64 ? "amd64" : "none";
							return assets.find((a) => a.name === "tool-" + os + "-" + cpu);
						},
					}).bin("targeted"),
				);
			`, assetSelectorParam, map[string]any{"repo": "owner/targeted"})

			memFS := fs.NewMemFS()
			inst := &GitHubInstaller{
				runner:     exec.NewMockRunner(),
				fsys:       memFS,
				dl:         downloader.NewDownloader(memFS, nil),
				extractor:  archive.NewExtractor(memFS, exec.NewMockRunner()),
				sysCtx:     tt.sysCtx,
				httpClient: server.Client(),
				BaseURL:    server.URL,
				BinDir:     "/staging",
			}

			if _, err := inst.Install(context.Background(), tool); err != nil {
				t.Fatalf("Install returned error: %v", err)
			}

			fetched := server.fetched()
			if len(fetched) != 1 || fetched[0] != tt.wantAsset {
				t.Errorf("fetched %v, want only %q", fetched, tt.wantAsset)
			}
		})
	}
}

// Every installation method is carried out for a platform, an architecture and a C
// library, so every installer has to take the run's target and keep it. One that kept
// the host's instead would quietly install the wrong thing on a targeted run.
func TestEveryInstallerTakesTheRunsTarget(t *testing.T) {
	runner := exec.NewMockRunner()
	memFS := fs.NewMemFS()
	dl := downloader.NewDownloader(memFS, nil)

	installers := []Installer{
		NewAptInstaller(runner, memFS, nil),
		NewBrewInstaller(runner, memFS, nil),
		NewCargoInstaller(runner, memFS, dl, nil),
		NewCurlBinaryInstaller(runner, memFS, dl, nil),
		NewCurlScriptInstaller(runner, memFS, dl, nil),
		NewCurlTarInstaller(runner, memFS, dl, nil),
		NewDmgInstaller(runner, memFS, dl, nil),
		NewDnfInstaller(runner, memFS, nil),
		NewGiteaInstaller(runner, memFS, dl, nil),
		NewGitHubInstaller(runner, memFS, dl, nil),
		NewManualInstaller(memFS, nil),
		NewNpmInstaller(runner, memFS, nil),
		NewPacmanInstaller(runner, memFS, nil),
		NewPkgInstaller(runner, memFS, dl, nil),
		NewUvInstaller(runner, memFS, nil),
		NewZshPluginInstaller(runner, memFS, nil),
	}

	target := &SystemContext{OS: arch.OSLinux, Arch: arch.ArchARM64, Libc: arch.LibcMusl}
	for _, inst := range installers {
		t.Run(inst.Name(), func(t *testing.T) {
			// Each one is an installation method a run can actually reach, rather
			// than a type that only this test constructs.
			if _, err := DefaultRegistry().Get(inst.Name()); err != nil {
				t.Fatalf("installation method %q is not registered: %v", inst.Name(), err)
			}
			setter, ok := inst.(SystemContextSetter)
			if !ok {
				t.Fatalf("installer %q does not accept the run's target", inst.Name())
			}
			setter.SetSystemContext(target)
		})
	}
}

// The target an installer is given is the one the configuration was loaded for, so the
// conversion between the two has to preserve it -- including the rule that only a Linux
// target has a C library.
func TestNewSystemContextCarriesTheResolvedTarget(t *testing.T) {
	tests := []struct {
		name   string
		target vm.Target
		want   SystemContext
	}{
		{
			name:   "a Linux target keeps its C library",
			target: vm.Target{OS: arch.OSLinux, Arch: arch.ArchARM64, Libc: arch.LibcMusl},
			want:   SystemContext{OS: arch.OSLinux, Arch: arch.ArchARM64, Libc: arch.LibcMusl},
		},
		{
			name:   "a macOS target has none",
			target: vm.Target{OS: arch.OSDarwin, Arch: arch.ArchARM64, Libc: arch.LibcMusl},
			want:   SystemContext{OS: arch.OSDarwin, Arch: arch.ArchARM64, Libc: arch.LibcUnknown},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NewSystemContext(tt.target); *got != tt.want {
				t.Errorf("NewSystemContext(%+v) = %+v, want %+v", tt.target, *got, tt.want)
			}
		})
	}
}
