package arch

import (
	"os"
	"regexp"
	"runtime"
	"strings"
)

// Package-level variables allowing tests to override GOOS and GOARCH for full coverage.
var (
	goos   = runtime.GOOS
	goarch = runtime.GOARCH
)

const (
	OSDarwin  = "darwin"
	OSLinux   = "linux"
	OSUnknown = "unknown"

	ArchAMD64   = "amd64"
	ArchARM64   = "arm64"
	ArchUnknown = "unknown"

	LibcGlibc   = "glibc"
	LibcMusl    = "musl"
	LibcUnknown = "unknown"
)

var gnuLoaderPaths = []string{
	"/lib64/ld-linux-x86-64.so.2",
	"/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
	"/lib/ld-linux-x86-64.so.2",
	"/lib/ld-linux-aarch64.so.1",
	"/lib64/ld-linux-aarch64.so.1",
	"/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1",
}

var muslLoaderPaths = []string{
	"/lib/ld-musl-x86_64.so.1",
	"/usr/lib/ld-musl-x86_64.so.1",
	"/lib/ld-musl-aarch64.so.1",
	"/usr/lib/ld-musl-aarch64.so.1",
}

// GetOS returns the current operating system name ("darwin", "linux", or "unknown").
func GetOS() string {
	switch goos {
	case "darwin":
		return OSDarwin
	case "linux":
		return OSLinux
	default:
		return OSUnknown
	}
}

// GetArch returns the current CPU architecture name ("amd64", "arm64", or "unknown").
func GetArch() string {
	switch goarch {
	case "amd64":
		return ArchAMD64
	case "arm64":
		return ArchARM64
	default:
		return ArchUnknown
	}
}

// FileExists is the default function used to check if a file loader exists on disk.
func FileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// DetectLibc evaluates the host's Linux C library (glibc or musl).
// Allows injecting a custom existence checker for isolated unit testing.
func DetectLibc(exists func(string) bool) string {
	if GetOS() != OSLinux {
		return LibcUnknown
	}

	hasGnu := false
	for _, p := range gnuLoaderPaths {
		if exists(p) {
			hasGnu = true
			break
		}
	}

	hasMusl := false
	for _, p := range muslLoaderPaths {
		if exists(p) {
			hasMusl = true
			break
		}
	}

	if hasGnu == hasMusl {
		return LibcUnknown
	}
	if hasGnu {
		return LibcGlibc
	}
	return LibcMusl
}

type SystemInfo struct {
	OS   string
	Arch string
	Libc string
}

func GetSystemInfo() SystemInfo {
	return SystemInfo{
		OS:   GetOS(),
		Arch: GetArch(),
		Libc: DetectLibc(FileExists),
	}
}

type ArchitecturePatterns struct {
	System   []string
	CPU      []string
	Variants []string
}

type ArchitectureRegex struct {
	SystemPattern  string
	CPUPattern     string
	VariantPattern string
}

func GetArchitecturePatterns(sys SystemInfo) ArchitecturePatterns {
	var patterns ArchitecturePatterns

	switch sys.OS {
	case OSDarwin:
		patterns.System = []string{"apple", "darwin", "apple-darwin", "dmg", "mac", "macos", "mac-os", "osx", "os-x", "os64x"}
		patterns.Variants = []string{"darwin"}
	case OSLinux:
		patterns.System = []string{"linux"}
		patterns.Variants = getLinuxVariants(sys.Libc)
	case "windows":
		patterns.System = []string{"windows", "win32", "win64", "pc-windows-gnu"}
		patterns.Variants = []string{"mingw", "msys", "cygwin", "pc-windows"}
	default:
		patterns.System = nil
		patterns.Variants = nil
	}

	switch sys.Arch {
	case ArchARM64:
		patterns.CPU = []string{"arm64", "aarch64", "aarch"}
	case ArchAMD64:
		patterns.CPU = []string{"amd64", "x86_64", "x64", "x86-64"}
	default:
		patterns.CPU = nil
	}

	return patterns
}

func getLinuxVariants(libc string) []string {
	switch libc {
	case LibcGlibc:
		return []string{"gnu", "musl", "unknown-linux"}
	case LibcMusl:
		return []string{"musl", "gnu", "unknown-linux"}
	default:
		return []string{"unknown-linux", "gnu", "musl"}
	}
}

// CreateArchitectureRegex creates a set of combined regular expression patterns from architecture patterns.
func CreateArchitectureRegex(patterns ArchitecturePatterns) ArchitectureRegex {
	return ArchitectureRegex{
		SystemPattern:  makePatternGroup(patterns.System),
		CPUPattern:     makePatternGroup(patterns.CPU),
		VariantPattern: makePatternGroup(patterns.Variants),
	}
}

func GetArchitectureRegex(sys SystemInfo) ArchitectureRegex {
	patterns := GetArchitecturePatterns(sys)
	return CreateArchitectureRegex(patterns)
}

func makePatternGroup(patterns []string) string {
	if len(patterns) == 0 {
		return ""
	}
	escaped := make([]string, len(patterns))
	for i, p := range patterns {
		escaped[i] = regexp.QuoteMeta(p)
	}
	return "(" + strings.Join(escaped, "|") + ")"
}

var nonBinaryPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\.sha\d+(sum)?$`),
	regexp.MustCompile(`(?i)\.md5(sum)?$`),
	regexp.MustCompile(`(?i)\.sum$`),
	regexp.MustCompile(`(?i)^shasums`),
	regexp.MustCompile(`(?i)\.sig$`),
	regexp.MustCompile(`(?i)\.asc$`),
	regexp.MustCompile(`(?i)\.pem$`),
	regexp.MustCompile(`(?i)\.json$`),
	regexp.MustCompile(`(?i)\.txt$`),
	regexp.MustCompile(`(?i)\.sbom$`),
	regexp.MustCompile(`(?i)\.deb$`),
	regexp.MustCompile(`(?i)\.rpm$`),
	regexp.MustCompile(`(?i)\.apk$`),
	regexp.MustCompile(`(?i)\.flatpak$`),
	regexp.MustCompile(`(?i)\.pkg$`),
	regexp.MustCompile(`(?i)buildable-artifact`),
	regexp.MustCompile(`(?i)\.vsix$`),
	regexp.MustCompile(`(?i)\.b3$`),
	regexp.MustCompile(`(?i)\.zst$`),
	regexp.MustCompile(`(?i)\.md$`),
}

func IsNonBinaryAsset(assetName string) bool {
	for _, re := range nonBinaryPatterns {
		if re.MatchString(assetName) {
			return true
		}
	}
	return false
}

var androidVariantPattern = regexp.MustCompile(`(?i)(^|[^a-z0-9])android([^a-z0-9]|$)`)

func IsAndroidTargetedLinuxAsset(assetName string) bool {
	return androidVariantPattern.MatchString(assetName)
}

var linuxPattern = regexp.MustCompile(`(?i)linux`)

// MatchesArchitecture checks if a given asset name matches the specified architecture patterns.
func MatchesArchitecture(assetName string, architectureRegex ArchitectureRegex) bool {
	lowerAssetName := strings.ToLower(assetName)

	if IsNonBinaryAsset(lowerAssetName) {
		return false
	}

	if architectureRegex.SystemPattern != "" && linuxPattern.MatchString(architectureRegex.SystemPattern) && IsAndroidTargetedLinuxAsset(lowerAssetName) {
		return false
	}

	systemMatch := true
	if architectureRegex.SystemPattern != "" {
		re, err := regexp.Compile("(?i)" + architectureRegex.SystemPattern)
		if err == nil {
			systemMatch = re.MatchString(lowerAssetName)
		}
	}

	cpuMatch := true
	if architectureRegex.CPUPattern != "" {
		re, err := regexp.Compile("(?i)" + architectureRegex.CPUPattern)
		if err == nil {
			cpuMatch = re.MatchString(lowerAssetName)
		}
	}

	return systemMatch && cpuMatch
}

func filterNonBinaryAssets(assetNames []string) []string {
	var filtered []string
	for _, name := range assetNames {
		if !IsNonBinaryAsset(name) {
			filtered = append(filtered, name)
		}
	}
	if len(filtered) > 0 {
		return filtered
	}
	return assetNames
}

func filterLinuxIncompatibleAssets(assetNames []string, sys SystemInfo) []string {
	if sys.OS != OSLinux {
		return assetNames
	}
	var filtered []string
	for _, name := range assetNames {
		if !IsAndroidTargetedLinuxAsset(name) {
			filtered = append(filtered, name)
		}
	}
	return filtered
}

func applySoftFilter(candidates []string, pattern string) []string {
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		return candidates
	}
	var filtered []string
	for _, name := range candidates {
		if re.MatchString(name) {
			filtered = append(filtered, name)
		}
	}
	if len(filtered) > 0 {
		return filtered
	}
	return candidates
}

var (
	gnuVariantPattern  = regexp.MustCompile(`(?i)(^|[^a-z0-9])(gnu|glibc)([^a-z0-9]|$)`)
	muslVariantPattern = regexp.MustCompile(`(?i)(^|[^a-z0-9])musl([^a-z0-9]|$)`)
)

type linuxVariant string

const (
	variantGeneric linuxVariant = "generic"
	variantGnu     linuxVariant = "gnu"
	variantMusl    linuxVariant = "musl"
)

func classifyLinuxVariant(assetName string) linuxVariant {
	if muslVariantPattern.MatchString(assetName) {
		return variantMusl
	}
	if gnuVariantPattern.MatchString(assetName) {
		return variantGnu
	}
	return variantGeneric
}

func rankLinuxVariant(variant linuxVariant, libc string) int {
	switch libc {
	case LibcGlibc:
		switch variant {
		case variantGnu:
			return 0
		case variantGeneric:
			return 1
		default:
			return 2
		}
	case LibcMusl:
		switch variant {
		case variantMusl:
			return 0
		case variantGeneric:
			return 1
		default:
			return 2
		}
	default:
		switch variant {
		case variantGeneric:
			return 0
		case variantGnu:
			return 1
		default:
			return 2
		}
	}
}

func selectBestLinuxMatch(assetNames []string, libc string) string {
	if len(assetNames) == 0 {
		return ""
	}
	bestAssetName := assetNames[0]
	bestRank := 999

	for _, name := range assetNames {
		v := classifyLinuxVariant(name)
		rank := rankLinuxVariant(v, libc)
		if rank < bestRank {
			bestAssetName = name
			bestRank = rank
		}
	}
	return bestAssetName
}

func SelectBestMatch(assetNames []string, sys SystemInfo) string {
	if len(assetNames) == 0 {
		return ""
	}

	architectureRegex := GetArchitectureRegex(sys)
	patterns := GetArchitecturePatterns(sys)

	binaryAssets := filterNonBinaryAssets(assetNames)
	compatibleAssets := filterLinuxIncompatibleAssets(binaryAssets, sys)

	var matches []string
	if architectureRegex.SystemPattern != "" {
		re := regexp.MustCompile("(?i)" + architectureRegex.SystemPattern)
		for _, name := range compatibleAssets {
			if re.MatchString(name) {
				matches = append(matches, name)
			}
		}
	} else {
		matches = append(matches, compatibleAssets...)
	}

	if len(matches) == 0 {
		return ""
	}

	if architectureRegex.CPUPattern != "" && len(matches) > 1 {
		matches = applySoftFilter(matches, architectureRegex.CPUPattern)
	}

	if len(matches) <= 1 {
		return matches[0]
	}

	if sys.OS == OSLinux {
		return selectBestLinuxMatch(matches, sys.Libc)
	}

	for _, filter := range patterns.Variants {
		if len(matches) <= 1 {
			break
		}
		matches = applySoftFilter(matches, filter)
	}

	return matches[0]
}
