package vm

import (
	"encoding/json"
	"maps"
	"os"
	"regexp"
	"strconv"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

// describeSystemInfo is JavaScript shared by the probes below. It names the Platform and
// Architecture member systemInfo equals, and whether an `os` member exists, so that the
// expectation is stated in the constants an author compares against rather than in raw
// numbers: a mapping that disagreed with the DSL's constants would name no member.
const describeSystemInfo = `
const describe = (info) =>
  (Object.keys(Platform).find((name) => Platform[name] === info.platform) ?? "none") + "/" +
  (Object.keys(Architecture).find((name) => Architecture[name] === info.arch) ?? "none") + "/" +
  ("os" in info ? "has-os" : "no-os");
`

// systemInfoTargets are the targets a run can be invoked for, each with the Platform and
// Architecture member v1 reported for it (platformFromNodeJS / architectureFromNodeJS in
// packages/core/src/common/platform.types.ts).
var systemInfoTargets = []struct {
	target Target
	want   string
}{
	{Target{OS: "darwin", Arch: "arm64"}, "MacOS/Arm64/no-os"},
	{Target{OS: "darwin", Arch: "amd64"}, "MacOS/X86_64/no-os"},
	{Target{OS: "linux", Arch: "arm64"}, "Linux/Arm64/no-os"},
	{Target{OS: "linux", Arch: "amd64"}, "Linux/X86_64/no-os"},
	{Target{OS: "windows", Arch: "amd64"}, "Windows/X86_64/no-os"},
}

func targetName(target Target) string {
	return target.OS + "/" + target.Arch
}

const systemInfoFactoryProbe = `
import { defineTool, Platform, Architecture } from "@alexgorbatchev/dotfiles";
` + describeSystemInfo + `
export default defineTool((install, ctx) =>
  install("manual", { binaryPath: "/probe/" + describe(ctx.systemInfo) }),
);`

// A tool factory's systemInfo describes the target the run was invoked for, in the
// Platform and Architecture members v1 tool files compare it against.
func TestToolFactorySystemInfoDescribesTheTarget(t *testing.T) {
	for _, tt := range systemInfoTargets {
		t.Run(targetName(tt.target), func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, systemInfoFactoryProbe, WithTarget(tt.target))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			if got := tool.InstallParams["binaryPath"]; got != "/probe/"+tt.want {
				t.Errorf("tool factory saw systemInfo %v, want %q", got, "/probe/"+tt.want)
			}
		})
	}
}

const systemInfoConfigProbe = `
import { defineConfig, Platform, Architecture } from "@alexgorbatchev/dotfiles";
` + describeSystemInfo + `
export default defineConfig((ctx) => ({
  paths: { dotfilesDir: ctx.configFileDir, targetDir: "/probe/" + describe(ctx.systemInfo) },
}));`

// The context a configuration factory receives carries the same systemInfo.
func TestConfigFactorySystemInfoDescribesTheTarget(t *testing.T) {
	for _, tt := range systemInfoTargets {
		t.Run(targetName(tt.target), func(t *testing.T) {
			projCfg, _, err := loadProjectSource(t, systemInfoConfigProbe, projectPathsProbeTool, WithTarget(tt.target))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			if got := projCfg.Paths.TargetDir; got != "/probe/"+tt.want {
				t.Errorf("configuration factory saw systemInfo %q, want %q", got, "/probe/"+tt.want)
			}
		})
	}
}

// A lifecycle hook runs during an installation for the run's target, and its systemInfo
// says so.
func TestHookSystemInfoDescribesTheTarget(t *testing.T) {
	tool := writeToolFile(t, `
		import { defineTool, Platform, Architecture } from "@alexgorbatchev/dotfiles";
		`+describeSystemInfo+`
		export default defineTool((install) =>
			install("manual").hook("after-install", async ({ fileSystem, systemInfo }) => {
				await fileSystem.writeFile("/captured", describe(systemInfo));
			}),
		);
	`, HookAfterInstall)

	for _, tt := range systemInfoTargets {
		t.Run(targetName(tt.target), func(t *testing.T) {
			got := runHookCapturingFileFor(t, tool, hookTestProjectConfig(t), HookAfterInstall, HookContext{}, tt.target)
			if got != tt.want {
				t.Errorf("hook saw systemInfo %q, want %q", got, tt.want)
			}
		})
	}
}

// platformConstants and architectureConstants are the Go constants systemInfo reports and
// .platform() blocks are matched with, by DSL member name.
var (
	platformConstants = map[string]int{
		"Linux":   config.PlatformLinux,
		"MacOS":   config.PlatformMacOS,
		"Windows": config.PlatformWindows,
		"All":     config.PlatformAll,
	}
	architectureConstants = map[string]int{
		"X86_64": config.ArchX86_64,
		"Arm64":  config.ArchArm64,
		"All":    config.ArchAll,
	}
)

const constantsProbeTool = `
import { defineTool, Platform, Architecture } from "@alexgorbatchev/dotfiles";
export default defineTool((install) =>
  install("manual", { binaryPath: JSON.stringify({ platform: Platform, architecture: Architecture }) }),
);`

// The Platform and Architecture objects a tool file compares systemInfo against are
// restated in loader-api.ts, so they have to hold exactly the Go constants systemInfo
// reports: a comparison such as systemInfo.platform === Platform.MacOS is only ever true
// when they do.
func TestPlatformAndArchitectureConstantsMatchGo(t *testing.T) {
	toolConfigs, err := loadToolSource(t, constantsProbeTool)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	tool, ok := toolConfigs["probe"]
	if !ok {
		t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
	}
	reported, _ := tool.InstallParams["binaryPath"].(string)
	var got struct {
		Platform     map[string]int `json:"platform"`
		Architecture map[string]int `json:"architecture"`
	}
	if err := json.Unmarshal([]byte(reported), &got); err != nil {
		t.Fatalf("probe reported %q, which is not JSON: %v", reported, err)
	}
	if !maps.Equal(got.Platform, platformConstants) {
		t.Errorf("runtime Platform = %v, Go provides %v", got.Platform, platformConstants)
	}
	if !maps.Equal(got.Architecture, architectureConstants) {
		t.Errorf("runtime Architecture = %v, Go provides %v", got.Architecture, architectureConstants)
	}
}

var (
	platformEnumBlockPattern     = regexp.MustCompile(`(?s)export enum Platform \{(.*?)\n\}`)
	architectureEnumBlockPattern = regexp.MustCompile(`(?s)export enum Architecture \{(.*?)\n\}`)
	numericEnumMemberPattern     = regexp.MustCompile(`(\w+) = (\d+),`)
)

// declaredNumericEnum reads the members of a numeric enum declared in dsl-types.ts.
func declaredNumericEnum(t *testing.T, source []byte, block *regexp.Regexp) map[string]int {
	t.Helper()
	match := block.FindSubmatch(source)
	if match == nil {
		t.Fatalf("no declaration matching %s found in dsl-types.ts", block)
	}
	members := make(map[string]int)
	for _, member := range numericEnumMemberPattern.FindAllStringSubmatch(string(match[1]), -1) {
		value, err := strconv.Atoi(member[2])
		if err != nil {
			t.Fatalf("enum member %s has value %q: %v", member[1], member[2], err)
		}
		members[member[1]] = value
	}
	return members
}

// The Platform and Architecture declarations a tool file type-checks against are
// hand-written, and systemInfo reports the Go constants, so the two have to be one set
// of values: a comparison such as systemInfo.platform === Platform.MacOS is only ever
// true when they are.
func TestPlatformAndArchitectureDeclarationsMatchConstants(t *testing.T) {
	source, err := os.ReadFile("dsl-types.ts")
	if err != nil {
		t.Fatalf("reading dsl-types.ts: %v", err)
	}

	tests := []struct {
		name  string
		block *regexp.Regexp
		want  map[string]int
	}{
		{name: "Platform", block: platformEnumBlockPattern, want: platformConstants},
		{name: "Architecture", block: architectureEnumBlockPattern, want: architectureConstants},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			declared := declaredNumericEnum(t, source, tt.block)
			if len(declared) != len(tt.want) {
				t.Fatalf("dsl-types.ts declares %s %v, Go provides %v", tt.name, declared, tt.want)
			}
			for member, want := range tt.want {
				if got, ok := declared[member]; !ok || got != want {
					t.Errorf("dsl-types.ts declares %s.%s = %d, want %d", tt.name, member, got, want)
				}
			}
		})
	}
}
