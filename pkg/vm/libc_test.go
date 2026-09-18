package vm

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/arch"
)

// libcProbeTool reports the detected libc together with every Libc member it equals.
// Referencing Libc at all requires the enum to be a runtime global, and naming a member
// requires the detected spelling and the enum to agree: the two halves of the defect.
const libcProbeTool = `
import { defineTool, Libc } from "@alexgorbatchev/dotfiles";
export default defineTool((install, ctx) => {
  const matched = [
    ctx.systemInfo.libc === Libc.Unknown ? "Unknown" : "",
    ctx.systemInfo.libc === Libc.Gnu ? "Gnu" : "",
    ctx.systemInfo.libc === Libc.Musl ? "Musl" : "",
  ].filter((name) => name !== "").join("+");
  return install("manual", { binaryPath: "/probe/" + ctx.systemInfo.libc + "/" + matched });
});`

// memberNameOf reports the Libc member name the given detected value belongs to, so the
// expectation is derived from detection rather than from the host this test runs on.
func memberNameOf(t *testing.T, value string) string {
	t.Helper()
	for name, member := range libcConstants {
		if member == value {
			return name
		}
	}
	t.Fatalf("detected libc %q is not a Libc member; members are %v", value, libcConstants)
	return ""
}

// A tool file that compares systemInfo.libc against the Libc enum has to load and has to
// match exactly one member, on every host: the enum is worthless otherwise.
func TestLibcEnumMatchesDetectedValue(t *testing.T) {
	toolConfigs, err := loadToolSource(t, libcProbeTool)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	tool, ok := toolConfigs["probe"]
	if !ok {
		t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
	}

	detected := arch.DetectLibc(arch.FileExists)
	want := "/probe/" + detected + "/" + memberNameOf(t, detected)
	if got := tool.InstallParams["binaryPath"]; got != want {
		t.Errorf("probe reported %v, want %q", got, want)
	}
}

// Inside the bundle a module's own bindings are not global, so a tool file that names a
// DSL constant without importing it sees nothing unless the constant was registered.
// Platform and Architecture are registered for exactly that reason; Libc has to be too.
const unimportedLibcProbeTool = `
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install("manual", { binaryPath: "/probe/" + Libc.Gnu + "/" + Libc.Musl + "/" + Libc.Unknown }),
);`

func TestLibcIsRegisteredAsGlobal(t *testing.T) {
	toolConfigs, err := loadToolSource(t, unimportedLibcProbeTool)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	tool, ok := toolConfigs["probe"]
	if !ok {
		t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
	}

	want := "/probe/" + libcConstants["Gnu"] + "/" + libcConstants["Musl"] + "/" + libcConstants["Unknown"]
	if got := tool.InstallParams["binaryPath"]; got != want {
		t.Errorf("probe reported %v, want %q", got, want)
	}
}

var libcEnumBlockPattern = regexp.MustCompile(`(?s)export enum Libc \{(.*?)\n\}`)
var libcEnumMemberPattern = regexp.MustCompile(`(\w+) = "([^"]*)",`)

// The emitted declarations are what a tool file type-checks against, and they are
// hand-written, so nothing but this test stops them from describing members the runtime
// never produces.
func TestLibcDeclarationMatchesConstants(t *testing.T) {
	source, err := os.ReadFile("dsl-types.ts")
	if err != nil {
		t.Fatalf("reading dsl-types.ts: %v", err)
	}

	block := libcEnumBlockPattern.FindSubmatch(source)
	if block == nil {
		t.Fatalf("no `export enum Libc` declaration found in dsl-types.ts")
	}

	declared := make(map[string]string)
	for _, member := range libcEnumMemberPattern.FindAllStringSubmatch(string(block[1]), -1) {
		declared[member[1]] = member[2]
	}

	if len(declared) != len(libcConstants) {
		t.Fatalf("dsl-types.ts declares %v, Go provides %v", declared, libcConstants)
	}
	for name, want := range libcConstants {
		if got, ok := declared[name]; !ok || got != want {
			t.Errorf("dsl-types.ts declares Libc.%s = %q, want %q", name, got, want)
		}
	}
}

const libcReportingTool = `
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool((install, ctx) => install("manual", { binaryPath: "/libc/" + ctx.systemInfo.libc }));`

// WithTarget backs --libc the way it backs --platform and --arch: the configuration is
// evaluated for the libc the caller names, and for the host's when it names none.
func TestWithTargetOverridesLibc(t *testing.T) {
	tests := []struct {
		name       string
		targetLibc string
		want       string
	}{
		{name: "musl override", targetLibc: arch.LibcMusl, want: arch.LibcMusl},
		{name: "gnu override", targetLibc: arch.LibcGnu, want: arch.LibcGnu},
		{name: "unknown override", targetLibc: arch.LibcUnknown, want: arch.LibcUnknown},
		{name: "unset falls back to the host", targetLibc: "", want: arch.DetectLibc(arch.FileExists)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, libcReportingTool, WithTarget(Target{Libc: tt.targetLibc}))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			if got := tool.InstallParams["binaryPath"]; got != "/libc/"+tt.want {
				t.Errorf("systemInfo.libc reported %v, want %q", got, "/libc/"+tt.want)
			}
		})
	}
}

// Detection reports the spelling release assets use, so an author never has to know that
// the GNU C library is called glibc internally.
func TestLibcConstantsUseReleaseAssetSpelling(t *testing.T) {
	for name, value := range libcConstants {
		if strings.Contains(value, "glibc") {
			t.Errorf("Libc.%s = %q spells the GNU C library glibc; release assets spell it gnu", name, value)
		}
	}
}
