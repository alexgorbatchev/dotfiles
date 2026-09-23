package config

// Platform and architecture bits, mirroring the Platform and Architecture constants in
// pkg/vm/loader-api.ts. They are the single definition of the wire values, so callers
// never spell 1, 2 or 4 out themselves.
const (
	PlatformLinux   = 1
	PlatformMacOS   = 2
	PlatformWindows = 4
	// PlatformAll is every platform bit set, and so the largest valid platform bitmask.
	PlatformAll = PlatformLinux | PlatformMacOS | PlatformWindows

	ArchX86_64 = 1
	ArchArm64  = 2
	// ArchAll is every architecture bit set, and so the largest valid bitmask.
	ArchAll = ArchX86_64 | ArchArm64
)

// PlatformNames renders a platform bitmask as display names, in bit order.
func PlatformNames(platforms int) []string {
	names := []string{}
	if platforms&PlatformLinux != 0 {
		names = append(names, "Linux")
	}
	if platforms&PlatformMacOS != 0 {
		names = append(names, "macOS")
	}
	if platforms&PlatformWindows != 0 {
		names = append(names, "Windows")
	}
	return names
}

// ArchitectureNames renders an architecture bitmask as display names, in bit order.
func ArchitectureNames(architectures int) []string {
	names := []string{}
	if architectures&ArchX86_64 != 0 {
		names = append(names, "x86_64")
	}
	if architectures&ArchArm64 != 0 {
		names = append(names, "arm64")
	}
	return names
}

// PlatformOf returns the Platform member for an OS name ("linux", "darwin", "windows"),
// the value systemInfo.platform reports. It is the one mapping from the Go spelling to
// the bit, so what a configuration compares against and what .platform() blocks match
// cannot disagree. An OS with no member is 0, which v1 called Platform.None
// (platformFromNodeJS in packages/core/src/common/platform.types.ts) and which equals no
// member and selects nothing.
func PlatformOf(osName string) int {
	switch osName {
	case "linux":
		return PlatformLinux
	case "darwin":
		return PlatformMacOS
	case "windows":
		return PlatformWindows
	default:
		return 0
	}
}

// ArchitectureOf returns the Architecture member for an arch name ("amd64", "x86_64",
// "arm64"), the value systemInfo.arch reports. It mirrors PlatformOf: an architecture
// with no member is 0, v1's Architecture.None.
func ArchitectureOf(archName string) int {
	switch archName {
	case "amd64", "x86_64":
		return ArchX86_64
	case "arm64":
		return ArchArm64
	default:
		return 0
	}
}

// MatchesPlatform reports whether a platform bitmask selects the given OS name
// ("linux", "darwin", "windows"). An empty bitmask selects nothing; callers express
// "unconstrained" with a nil *int rather than with zero.
func MatchesPlatform(platforms int, osName string) bool {
	return platforms&PlatformOf(osName) != 0
}

// MatchesArch reports whether an architecture bitmask selects the given arch name
// ("amd64", "x86_64", "arm64"). It mirrors MatchesPlatform: an empty bitmask selects
// nothing, and "unconstrained" is expressed with a nil *int.
func MatchesArch(architectures int, archName string) bool {
	return architectures&ArchitectureOf(archName) != 0
}
