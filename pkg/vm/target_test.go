package vm

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/config"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

// loadToolSource writes tool as the only tool configuration in a throwaway repository
// and loads it for the given target, so platform-dependent behavior can be asserted
// from any host.
func loadToolSource(t *testing.T, tool string, opts ...Option) (map[string]*config.ToolConfig, error) {
	t.Helper()

	tmpDir := t.TempDir()
	toolsDir := filepath.Join(tmpDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolsDir, "probe.tool.ts"), []byte(tool), 0644); err != nil {
		t.Fatalf("writing tool: %v", err)
	}

	configPath := filepath.Join(tmpDir, "dotfiles.config.ts")
	if err := os.WriteFile(configPath, []byte(`export default { paths: { dotfilesDir: "`+tmpDir+`" } };`), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}

	_, toolConfigs, err := LoadTypeScriptConfig(logger.New(logger.Config{Writer: io.Discard}), fs.NewOSFS(), configPath, opts...)
	return toolConfigs, err
}

const perArchTool = `
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install()
    .platform(Platform.MacOS, Architecture.Arm64, (install) =>
      install("manual", { binaryPath: "/opt/homebrew/bin/brew" }))
    .platform(Platform.MacOS, Architecture.X86_64, (install) =>
      install("manual", { binaryPath: "/usr/local/bin/brew" })),
);`

// WithTarget backs --platform/--arch. Without it reaching the loader, .platform()
// blocks would always be evaluated against the host that happens to be running.
func TestWithTargetSelectsPlatformBlocks(t *testing.T) {
	tests := []struct {
		name       string
		targetOS   string
		targetArch string
		want       string
		disabled   bool
	}{
		{name: "apple silicon", targetOS: "darwin", targetArch: "arm64", want: "/opt/homebrew/bin/brew"},
		{name: "intel", targetOS: "darwin", targetArch: "amd64", want: "/usr/local/bin/brew"},
		{name: "linux matches neither block", targetOS: "linux", targetArch: "amd64", disabled: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, perArchTool, WithTarget(Target{OS: tt.targetOS, Arch: tt.targetArch}))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}

			if tt.disabled {
				if !tool.Disabled {
					t.Errorf("expected the tool to be disabled for %s/%s", tt.targetOS, tt.targetArch)
				}
				return
			}
			if tool.Disabled {
				t.Fatalf("expected the tool to be enabled for %s/%s", tt.targetOS, tt.targetArch)
			}
			if got := tool.InstallParams["binaryPath"]; got != tt.want {
				t.Errorf("binaryPath = %v, want %v", got, tt.want)
			}
		})
	}
}

// A misspelled DSL constant is undefined in JavaScript. Treating it as "unconstrained"
// would silently widen the block instead of reporting the mistake.
func TestUnknownPlatformConstantsAreRejected(t *testing.T) {
	tests := []struct {
		name string
		tool string
		want string
	}{
		{
			name: "misspelled architecture",
			tool: `
import { Architecture, defineTool, Platform } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install().platform(Platform.MacOS, Architecture.Arm65, (install) =>
    install("manual", { binaryPath: "/typo" })),
);`,
			want: "Unknown architecture value",
		},
		{
			name: "misspelled platform",
			tool: `
import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install().platform(Platform.MacOs, (install) =>
    install("manual", { binaryPath: "/typo" })),
);`,
			want: "unknown platform value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := loadToolSource(t, tt.tool, WithTarget(Target{OS: "darwin", Arch: "arm64"}))
			if err == nil {
				t.Fatal("expected loading to fail")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("expected an error mentioning %q, got: %v", tt.want, err)
			}
		})
	}
}

// Platform is a bitmask, so a combination such as Platform.Linux | Platform.MacOS must
// match each OS it includes rather than only an exact value. There is deliberately no
// named alias for that combination: Linux, macOS and Windows are the only platforms.
func TestCombinedPlatformBitmaskMatchesEachMember(t *testing.T) {
	const unixTool = `
import { defineTool, Platform } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install().platform(Platform.Linux | Platform.MacOS, (install) =>
    install("manual", { binaryPath: "/unix" })),
);`

	for _, targetOS := range []string{"darwin", "linux"} {
		t.Run(targetOS, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, unixTool, WithTarget(Target{OS: targetOS, Arch: "arm64"}))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool := toolConfigs["probe"]
			if tool == nil || tool.Disabled {
				t.Fatalf("expected Linux|MacOS to match %s, got %+v", targetOS, tool)
			}
			if got := tool.InstallParams["binaryPath"]; got != "/unix" {
				t.Errorf("binaryPath = %v, want /unix", got)
			}
		})
	}

	t.Run("windows is excluded", func(t *testing.T) {
		toolConfigs, err := loadToolSource(t, unixTool, WithTarget(Target{OS: "windows", Arch: "amd64"}))
		if err != nil {
			t.Fatalf("load failed: %v", err)
		}
		if tool := toolConfigs["probe"]; tool != nil && !tool.Disabled {
			t.Error("expected Linux|MacOS not to match windows")
		}
	})
}

// Which C library a run reports follows the platform it resolved to, not the machine
// doing the resolving: it is a Linux question, so a macOS or Windows target answers
// "unknown" however the host is built and whatever --libc named. v1 decided it the same
// way (packages/cli/src/runtime/createBaseRuntimeContext.ts:59-68).
func TestTargetResolveDecidesLibcFromTheResolvedPlatform(t *testing.T) {
	tests := []struct {
		name   string
		target Target
		want   string
	}{
		{
			name:   "a Linux target takes the named C library",
			target: Target{OS: arch.OSLinux, Arch: arch.ArchAMD64, Libc: arch.LibcMusl},
			want:   arch.LibcMusl,
		},
		{
			name:   "a macOS target has none to name",
			target: Target{OS: arch.OSDarwin, Arch: arch.ArchARM64, Libc: arch.LibcMusl},
			want:   arch.LibcUnknown,
		},
		{
			name:   "a Windows target has none to detect",
			target: Target{OS: "windows", Arch: arch.ArchAMD64},
			want:   arch.LibcUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolved := tt.target.Resolve()
			if resolved.Libc != tt.want {
				t.Errorf("Resolve().Libc = %q, want %q", resolved.Libc, tt.want)
			}
			if resolved.OS != tt.target.OS || resolved.Arch != tt.target.Arch {
				t.Errorf("Resolve() = %+v, want the platform and architecture carried through unchanged", resolved)
			}
		})
	}
}

// What no flag named comes from the host, which is what a run without
// --platform/--arch/--libc installs for.
func TestTargetResolveFillsWhatWasNotNamedFromTheHost(t *testing.T) {
	resolved := Target{}.Resolve()

	if resolved.OS != arch.GetOS() {
		t.Errorf("Resolve().OS = %q, want the host's %q", resolved.OS, arch.GetOS())
	}
	if resolved.Arch != arch.GetArch() {
		t.Errorf("Resolve().Arch = %q, want the host's %q", resolved.Arch, arch.GetArch())
	}
	if want := arch.DetectLibc(arch.FileExists); resolved.Libc != want {
		t.Errorf("Resolve().Libc = %q, want the detected %q", resolved.Libc, want)
	}
}
