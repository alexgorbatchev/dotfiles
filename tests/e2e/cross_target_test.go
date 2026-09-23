package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// One resolved target governs a whole run: the configuration is loaded for it, the
// asset is selected for it, and the run says which flags overrode detection. Before
// --platform/--arch reached the installers, a targeted install downloaded the host's
// asset into a configuration resolved for another machine.
//
// Both targets are exercised so that the assertion is about the requested target
// rather than about the host the test happens to run on.
func TestE2ECrossTargetInstallSelectsTheRequestedAsset(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		platform   string
		targetArch string
		wantAsset  string
	}{
		{
			name:       "linux amd64",
			platform:   "linux",
			targetArch: "amd64",
			wantAsset:  "github-release-tool-1.0.0-linux_amd64.tar.gz",
		},
		{
			name:       "macos arm64",
			platform:   "macos",
			targetArch: "arm64",
			wantAsset:  "github-release-tool-1.0.0-macos_arm64.tar.gz",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ms := NewMockServer(t, "main")
			defer ms.Close()

			h := NewTestHarness(t, HarnessOptions{
				ConfigPath: "config.ts",
				Env: map[string]string{
					"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
				},
			})
			h.MockServerURL = ms.Server.URL
			h.CopyFixture("main")

			stdout, stderr, exitCode, err := h.Install(
				[]string{"github-release-tool"},
				"--platform", tt.platform, "--arch", tt.targetArch,
			)
			if err != nil || exitCode != 0 {
				t.Fatalf("install failed: %v (exit %d)\nstdout: %s\nstderr: %s", err, exitCode, stdout, stderr)
			}

			downloads := ms.Downloads()
			if len(downloads) != 1 || downloads[0] != tt.wantAsset {
				t.Errorf("downloaded %v, want only %q", downloads, tt.wantAsset)
			}

			for _, want := range []string{"Platform overridden to: ", "Arch overridden to: " + tt.targetArch} {
				if !strings.Contains(stderr, want) {
					t.Errorf("expected stderr to warn %q, got:\n%s", want, stderr)
				}
			}
		})
	}
}

// A hook, and every function-valued install parameter with it, runs for the target the
// run was invoked for. Its systemInfo described the host before the target reached
// vm.RunHook, so a hook branching on the platform took the wrong branch.
//
// The C library follows the resolved platform rather than the host's, which is how v1
// decided it (packages/cli/src/runtime/createBaseRuntimeContext.ts:59-68): a macOS
// target reports Libc.Unknown, a Linux target takes the --libc flag.
func TestE2ECrossTargetHookSeesTheRequestedTarget(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		platform     string
		targetArch   string
		libc         string
		wantPlatform int
		wantArch     int
		wantLibc     string
	}{
		{
			name:         "linux arm64 musl",
			platform:     "linux",
			targetArch:   "arm64",
			libc:         "musl",
			wantPlatform: config.PlatformLinux,
			wantArch:     config.ArchArm64,
			wantLibc:     "musl",
		},
		{
			name:         "macos amd64 has no C library",
			platform:     "macos",
			targetArch:   "amd64",
			wantPlatform: config.PlatformMacOS,
			wantArch:     config.ArchX86_64,
			wantLibc:     "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			h := NewTestHarness(t, HarnessOptions{
				ConfigPath: "config.ts",
				Env: map[string]string{
					"DOTFILES_E2E_USE_REAL_INSTALLERS": "true",
				},
			})
			h.CopyFixture("cross-target")

			args := []string{"--platform", tt.platform, "--arch", tt.targetArch}
			if tt.libc != "" {
				args = append(args, "--libc", tt.libc)
			}
			stdout, stderr, exitCode, err := h.Install([]string{"target-probe"}, args...)
			if err != nil || exitCode != 0 {
				t.Fatalf("install failed: %v (exit %d)\nstdout: %s\nstderr: %s", err, exitCode, stdout, stderr)
			}

			data, err := os.ReadFile(filepath.Join(h.TempDir, ".generated", "system-info.json"))
			if err != nil {
				t.Fatalf("the after-install hook wrote no systemInfo: %v\nstdout: %s\nstderr: %s", err, stdout, stderr)
			}
			var got struct {
				Platform int    `json:"platform"`
				Arch     int    `json:"arch"`
				Libc     string `json:"libc"`
			}
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("the hook wrote %q, which is not JSON: %v", data, err)
			}

			if got.Platform != tt.wantPlatform {
				t.Errorf("systemInfo.platform = %d, want the Platform member %d", got.Platform, tt.wantPlatform)
			}
			if got.Arch != tt.wantArch {
				t.Errorf("systemInfo.arch = %d, want the Architecture member %d", got.Arch, tt.wantArch)
			}
			if got.Libc != tt.wantLibc {
				t.Errorf("systemInfo.libc = %q, want %q", got.Libc, tt.wantLibc)
			}
		})
	}
}
