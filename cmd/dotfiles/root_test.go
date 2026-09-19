package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	hostarch "github.com/alexgorbatchev/dotfiles/pkg/arch"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/alexgorbatchev/dotfiles/pkg/vm"
)

func TestGetLoggerNilWriterAndFlags(t *testing.T) {
	log := GetLogger("test", nil)
	if log == nil {
		t.Errorf("expected non-nil logger")
	}

	logLevel = "invalid-level"
	quiet = true
	verbose = false
	trace = true

	log1 := GetLogger("test1", nil)
	if log1 == nil || log1.Level() != logger.LogLevelQuiet {
		t.Errorf("expected LogLevelQuiet when quiet flag is true")
	}

	quiet = false
	verbose = true
	log2 := GetLogger("test2", nil)
	if log2 == nil || log2.Level() != logger.LogLevelVerbose {
		t.Errorf("expected LogLevelVerbose when verbose flag is true")
	}
}

// --platform takes the spellings people use in the authoring API (Platform.MacOS,
// { os: "macos" }) as well as the GOOS name, and every accepted spelling lands on the
// GOOS name vm.Target evaluates .platform() blocks against. Anything else is rejected
// while the command line is parsed, naming the accepted values, instead of being
// accepted and then silently matching nothing.
func TestPlatformFlag(t *testing.T) {
	tests := []struct {
		name       string
		value      string
		wantTarget string
		wantErr    string
	}{
		{name: "macos", value: "macos", wantTarget: "darwin"},
		{name: "darwin", value: "darwin", wantTarget: "darwin"},
		{name: "case and spacing are forgiven", value: " MacOS ", wantTarget: "darwin"},
		{name: "linux", value: "linux", wantTarget: "linux"},
		{name: "windows", value: "windows", wantTarget: "windows"},
		{name: "unknown value", value: "macintosh", wantErr: "accepted values are macos (or darwin), linux and windows"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand("--platform", tt.value, "--config", "test-project/dotfiles.config.ts", "env")
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("--platform %q was accepted, output:\n%s", tt.value, out.Combined)
				}
				if !strings.Contains(err.Error(), tt.wantErr) || !strings.Contains(err.Error(), tt.value) {
					t.Errorf("error %q should name the rejected value and the accepted ones", err)
				}
				if platform != "" {
					t.Errorf("a rejected value left platform = %q", platform)
				}
				return
			}
			if err != nil {
				t.Fatalf("--platform %q: %v\n%s", tt.value, err, out.Combined)
			}
			if platform != tt.wantTarget {
				t.Errorf("--platform %q reached the loader as %q, want %q", tt.value, platform, tt.wantTarget)
			}
		})
	}
}

// --libc overrides the detected C library the way --platform overrides the operating
// system, and takes the spellings the authoring API's Libc enum uses. A value that names
// no libc is rejected while the command line is parsed, rather than being accepted and
// then quietly evaluating the configuration against the host after all.
func TestLibcFlag(t *testing.T) {
	tests := []struct {
		name       string
		value      string
		wantTarget string
		wantErr    string
	}{
		{name: "gnu", value: "gnu", wantTarget: hostarch.LibcGnu},
		{name: "musl", value: "musl", wantTarget: hostarch.LibcMusl},
		{name: "unknown", value: "unknown", wantTarget: hostarch.LibcUnknown},
		{name: "case and spacing are forgiven", value: " Musl ", wantTarget: hostarch.LibcMusl},
		{name: "the internal name is not the public one", value: "glibc", wantErr: "accepted values are gnu, musl, unknown"},
		{name: "nonsense", value: "libc6", wantErr: "accepted values are gnu, musl, unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := runCommand("--libc", tt.value, "--config", "test-project/dotfiles.config.ts", "env")
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("--libc %q was accepted, output:\n%s", tt.value, out.Combined)
				}
				if !strings.Contains(err.Error(), tt.wantErr) || !strings.Contains(err.Error(), tt.value) {
					t.Errorf("error %q should name the rejected value and the accepted ones", err)
				}
				if libc != "" {
					t.Errorf("a rejected value left libc = %q", libc)
				}
				return
			}
			if err != nil {
				t.Fatalf("--libc %q: %v\n%s", tt.value, err, out.Combined)
			}
			if libc != tt.wantTarget {
				t.Errorf("--libc %q reached the loader as %q, want %q", tt.value, libc, tt.wantTarget)
			}
		})
	}
}

// Without --libc the loader is handed no override at all, so the configuration is
// evaluated against whatever the host runs.
func TestLibcFlagDefaultsToDetection(t *testing.T) {
	if _, err := runCommand("--config", "test-project/dotfiles.config.ts", "env"); err != nil {
		t.Fatalf("env without --libc: %v", err)
	}
	if libc != "" {
		t.Errorf("libc = %q without --libc, want the empty value that means \"detect\"", libc)
	}
}

const libcReportingTool = `
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install, ctx) => install("manual", { binaryPath: "/libc/" + ctx.systemInfo.libc }));`

// writeLibcProbeProject lays out a throwaway project whose only tool reports the libc
// the configuration was evaluated for.
func writeLibcProbeProject(t *testing.T) string {
	t.Helper()

	projectDir := t.TempDir()
	toolsDir := filepath.Join(projectDir, "tools")
	if err := os.MkdirAll(toolsDir, 0755); err != nil {
		t.Fatalf("creating tools dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(toolsDir, "probe.tool.ts"), []byte(libcReportingTool), 0644); err != nil {
		t.Fatalf("writing tool: %v", err)
	}
	configPath := filepath.Join(projectDir, "dotfiles.config.ts")
	configSource := `export default { paths: { dotfilesDir: "` + projectDir + `" } };`
	if err := os.WriteFile(configPath, []byte(configSource), 0644); err != nil {
		t.Fatalf("writing config: %v", err)
	}
	return configPath
}

// The flag is only worth having if it reaches the loader. --platform and --arch do;
// --libc was registered, documented and then read by nothing, so a tool evaluated
// against ctx.systemInfo.libc saw the host's value whatever was asked for.
//
// Which C library is in use is a Linux question, so the target's platform answers it
// before the flag does, as it did in v1
// (packages/cli/src/runtime/createBaseRuntimeContext.ts:59-68).
func TestLibcFlagReachesSystemInfo(t *testing.T) {
	tests := []struct {
		name     string
		targetOS string
		value    string
		want     string
	}{
		{name: "musl", targetOS: hostarch.OSLinux, value: hostarch.LibcMusl, want: hostarch.LibcMusl},
		{name: "gnu", targetOS: hostarch.OSLinux, value: hostarch.LibcGnu, want: hostarch.LibcGnu},
		{
			name:     "a macOS target has no C library to select",
			targetOS: hostarch.OSDarwin,
			value:    hostarch.LibcMusl,
			want:     hostarch.LibcUnknown,
		},
		{name: "detected when the flag is absent", value: "", want: hostarch.DetectLibc(hostarch.FileExists)},
	}

	configPath := writeLibcProbeProject(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DOTFILES_DRY_RUN", "true")
			previousDryRun := dryRun
			dryRun = true
			previousLibc := libc
			libc = tt.value
			previousPlatform := platform
			platform = tt.targetOS
			t.Cleanup(func() {
				dryRun = previousDryRun
				libc = previousLibc
				platform = previousPlatform
			})

			services, err := BootstrapServices(context.Background(), configPath)
			if err != nil {
				t.Fatalf("bootstrap failed: %v", err)
			}
			defer services.DB.Close()

			if len(services.ToolConfigs) != 1 {
				t.Fatalf("expected the probe tool, got %d tool configurations", len(services.ToolConfigs))
			}
			if got := services.ToolConfigs[0].InstallParams["binaryPath"]; got != "/libc/"+tt.want {
				t.Errorf("systemInfo.libc reached the tool as %v, want %q", got, "/libc/"+tt.want)
			}
		})
	}
}

// A run carried out for another machine says so, once per flag that overrode detection.
// v1 warned the same way (packages/cli/src/runtime/createBaseRuntimeContext.ts:50-58):
// the output of a targeted run is indistinguishable from this machine's, so nothing else
// tells the reader it describes a different one.
func TestResolveTargetWarnsPerOverriddenFlag(t *testing.T) {
	tests := []struct {
		name        string
		platform    string
		arch        string
		libc        string
		wantTarget  vm.Target
		wantWarning []string
		noWarning   []string
	}{
		{
			name:       "nothing overridden stays quiet",
			wantTarget: vm.Target{OS: hostarch.GetOS(), Arch: hostarch.GetArch(), Libc: hostarch.DetectLibc(hostarch.FileExists)},
			noWarning:  []string{"overridden", "ignored"},
		},
		{
			name:       "a Linux target reports all three",
			platform:   hostarch.OSLinux,
			arch:       hostarch.ArchARM64,
			libc:       hostarch.LibcMusl,
			wantTarget: vm.Target{OS: hostarch.OSLinux, Arch: hostarch.ArchARM64, Libc: hostarch.LibcMusl},
			wantWarning: []string{
				"Platform overridden to: linux",
				"Arch overridden to: arm64",
				"Libc overridden to: musl",
			},
		},
		{
			name:        "a C library a macOS target cannot use is reported as ignored",
			platform:    hostarch.OSDarwin,
			libc:        hostarch.LibcMusl,
			wantTarget:  vm.Target{OS: hostarch.OSDarwin, Arch: hostarch.GetArch(), Libc: hostarch.LibcUnknown},
			wantWarning: []string{"Platform overridden to: darwin", "Libc musl ignored"},
			noWarning:   []string{"Libc overridden", "Arch overridden"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			previousPlatform, previousArch, previousLibc := platform, arch, libc
			platform, arch, libc = tt.platform, tt.arch, tt.libc
			t.Cleanup(func() {
				platform, arch, libc = previousPlatform, previousArch, previousLibc
			})

			var out bytes.Buffer
			got := resolveTarget(logger.New(logger.Config{Writer: &out}))

			if got != tt.wantTarget {
				t.Errorf("resolveTarget() = %+v, want %+v", got, tt.wantTarget)
			}
			for _, want := range tt.wantWarning {
				if !strings.Contains(out.String(), want) {
					t.Errorf("expected a warning containing %q, got:\n%s", want, out.String())
				}
			}
			for _, unwanted := range tt.noWarning {
				if strings.Contains(out.String(), unwanted) {
					t.Errorf("expected nothing about %q, got:\n%s", unwanted, out.String())
				}
			}
		})
	}
}
