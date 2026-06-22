package arch

import (
	"os"
	"runtime"
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
