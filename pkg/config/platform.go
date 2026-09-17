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

// MatchesPlatform reports whether a platform bitmask selects the given OS name
// ("linux", "darwin", "windows"). An empty bitmask selects nothing; callers express
// "unconstrained" with a nil *int rather than with zero.
func MatchesPlatform(platforms int, osName string) bool {
	var mask int
	switch osName {
	case "linux":
		mask = PlatformLinux
	case "darwin":
		mask = PlatformMacOS
	case "windows":
		mask = PlatformWindows
	default:
		return false
	}
	return platforms&mask != 0
}

// MatchesArch reports whether an architecture bitmask selects the given arch name
// ("amd64", "x86_64", "arm64"). It mirrors MatchesPlatform: an empty bitmask selects
// nothing, and "unconstrained" is expressed with a nil *int.
func MatchesArch(architectures int, archName string) bool {
	var mask int
	switch archName {
	case "amd64", "x86_64":
		mask = ArchX86_64
	case "arm64":
		mask = ArchArm64
	default:
		return false
	}
	return architectures&mask != 0
}
