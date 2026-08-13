package arch

import (
	"os"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestGetOS(t *testing.T) {
	oldGOOS := goos
	t.Cleanup(func() { goos = oldGOOS })

	tests := []struct {
		override string
		want     string
	}{
		{"darwin", OSDarwin},
		{"linux", OSLinux},
		{"windows", OSUnknown},
		{"freebsd", OSUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.override, func(t *testing.T) {
			goos = tt.override
			if got := GetOS(); got != tt.want {
				t.Errorf("GetOS() with override %q = %q, want %q", tt.override, got, tt.want)
			}
		})
	}
}

func TestGetArch(t *testing.T) {
	oldGOARCH := goarch
	t.Cleanup(func() { goarch = oldGOARCH })

	tests := []struct {
		override string
		want     string
	}{
		{"amd64", ArchAMD64},
		{"arm64", ArchARM64},
		{"386", ArchUnknown},
		{"mips", ArchUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.override, func(t *testing.T) {
			goarch = tt.override
			if got := GetArch(); got != tt.want {
				t.Errorf("GetArch() with override %q = %q, want %q", tt.override, got, tt.want)
			}
		})
	}
}

func TestGetSystemInfo(t *testing.T) {
	sys := GetSystemInfo()
	if sys.OS == "" || sys.Arch == "" {
		t.Errorf("GetSystemInfo() returned empty OS or Arch: %+v", sys)
	}
}

func TestDetectLibc_NonLinux(t *testing.T) {
	oldGOOS := goos
	t.Cleanup(func() { goos = oldGOOS })

	goos = "darwin"
	got := DetectLibc(func(string) bool { return true })
	if got != LibcUnknown {
		t.Errorf("DetectLibc() on non-Linux returned %q, want %q", got, LibcUnknown)
	}
}

func TestFileExists(t *testing.T) {
	if FileExists("/this/file/does/not/exist/anywhere/1234") {
		t.Errorf("Expected FileExists to return false for non-existent file")
	}

	tmpDir := t.TempDir()
	filePath := tmpDir + "/test_file.txt"
	if err := os.WriteFile(filePath, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}

	if !FileExists(filePath) {
		t.Errorf("Expected FileExists to return true for existing file")
	}

	if FileExists(tmpDir) {
		t.Errorf("Expected FileExists to return false for a directory")
	}
}

func TestDetectLibc(t *testing.T) {
	tests := []struct {
		name          string
		osVal         string
		existingFiles map[string]bool
		want          string
	}{
		{
			"glibc system",
			OSLinux,
			map[string]bool{"/lib64/ld-linux-x86-64.so.2": true},
			LibcGlibc,
		},
		{
			"musl system",
			OSLinux,
			map[string]bool{"/lib/ld-musl-x86_64.so.1": true},
			LibcMusl,
		},
		{
			"ambiguous system (both loaders present)",
			OSLinux,
			map[string]bool{
				"/lib64/ld-linux-x86-64.so.2": true,
				"/lib/ld-musl-x86_64.so.1":    true,
			},
			LibcUnknown,
		},
		{
			"no loaders",
			OSLinux,
			map[string]bool{},
			LibcUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			existsMock := func(path string) bool {
				return tt.existingFiles[path]
			}

			got := DetectLibc(existsMock)
			if runtime.GOOS != "linux" {
				if got != LibcUnknown {
					t.Errorf("DetectLibc() on non-Linux = %q, want %q", got, LibcUnknown)
				}
			} else {
				if got != tt.want {
					t.Errorf("DetectLibc() = %q, want %q", got, tt.want)
				}
			}
		})
	}
}

func TestCreateArchitectureRegex(t *testing.T) {
	t.Run("creates proper regex patterns from architecture patterns", func(t *testing.T) {
		patterns := ArchitecturePatterns{
			System:   []string{"darwin", "macos"},
			CPU:      []string{"arm64", "aarch64"},
			Variants: []string{"darwin"},
		}
		regex := CreateArchitectureRegex(patterns)
		if regex.SystemPattern != "(darwin|macos)" {
			t.Errorf("SystemPattern = %q, want %q", regex.SystemPattern, "(darwin|macos)")
		}
		if regex.CPUPattern != "(arm64|aarch64)" {
			t.Errorf("CPUPattern = %q, want %q", regex.CPUPattern, "(arm64|aarch64)")
		}
		if regex.VariantPattern != "(darwin)" {
			t.Errorf("VariantPattern = %q, want %q", regex.VariantPattern, "(darwin)")
		}
	})

	t.Run("handles empty pattern arrays", func(t *testing.T) {
		patterns := ArchitecturePatterns{}
		regex := CreateArchitectureRegex(patterns)
		if regex.SystemPattern != "" || regex.CPUPattern != "" || regex.VariantPattern != "" {
			t.Errorf("Expected empty patterns, got %+v", regex)
		}
	})

	t.Run("escapes special regex characters", func(t *testing.T) {
		patterns := ArchitecturePatterns{
			System:   []string{"x86-64", "pc-windows-gnu"},
			CPU:      []string{"amd64"},
			Variants: []string{"gnu"},
		}
		regex := CreateArchitectureRegex(patterns)
		if regex.SystemPattern != "(x86-64|pc-windows-gnu)" {
			t.Errorf("SystemPattern = %q", regex.SystemPattern)
		}
	})

	t.Run("escapes patterns with regex special characters", func(t *testing.T) {
		patterns := ArchitecturePatterns{
			System:   []string{"test.system", "test+system"},
			CPU:      []string{"test*cpu"},
			Variants: []string{"test(variant)"},
		}
		regex := CreateArchitectureRegex(patterns)
		if regex.SystemPattern != `(test\.system|test\+system)` {
			t.Errorf("SystemPattern = %q, want %q", regex.SystemPattern, `(test\.system|test\+system)`)
		}
		if regex.CPUPattern != `(test\*cpu)` {
			t.Errorf("CPUPattern = %q, want %q", regex.CPUPattern, `(test\*cpu)`)
		}
		if regex.VariantPattern != `(test\(variant\))` {
			t.Errorf("VariantPattern = %q, want %q", regex.VariantPattern, `(test\(variant\))`)
		}
	})
}

func TestGetArchitecturePatterns(t *testing.T) {
	t.Run("macOS ARM64", func(t *testing.T) {
		sys := SystemInfo{OS: OSDarwin, Arch: ArchARM64}
		patterns := GetArchitecturePatterns(sys)
		expectedSystem := []string{"apple", "darwin", "apple-darwin", "dmg", "mac", "macos", "mac-os", "osx", "os-x", "os64x"}
		if !reflect.DeepEqual(patterns.System, expectedSystem) {
			t.Errorf("System = %v, want %v", patterns.System, expectedSystem)
		}
		expectedCPU := []string{"arm64", "aarch64", "aarch"}
		if !reflect.DeepEqual(patterns.CPU, expectedCPU) {
			t.Errorf("CPU = %v, want %v", patterns.CPU, expectedCPU)
		}
		expectedVariants := []string{"darwin"}
		if !reflect.DeepEqual(patterns.Variants, expectedVariants) {
			t.Errorf("Variants = %v, want %v", patterns.Variants, expectedVariants)
		}
	})

	t.Run("macOS x86_64", func(t *testing.T) {
		sys := SystemInfo{OS: OSDarwin, Arch: ArchAMD64}
		patterns := GetArchitecturePatterns(sys)
		expectedCPU := []string{"amd64", "x86_64", "x64", "x86-64"}
		if !reflect.DeepEqual(patterns.CPU, expectedCPU) {
			t.Errorf("CPU = %v, want %v", patterns.CPU, expectedCPU)
		}
	})

	t.Run("Linux x86_64 glibc", func(t *testing.T) {
		sys := SystemInfo{OS: OSLinux, Arch: ArchAMD64, Libc: LibcGlibc}
		patterns := GetArchitecturePatterns(sys)
		if !reflect.DeepEqual(patterns.System, []string{"linux"}) {
			t.Errorf("System = %v", patterns.System)
		}
		if !reflect.DeepEqual(patterns.Variants, []string{"gnu", "musl", "unknown-linux"}) {
			t.Errorf("Variants = %v", patterns.Variants)
		}
	})

	t.Run("Linux ARM64 musl", func(t *testing.T) {
		sys := SystemInfo{OS: OSLinux, Arch: ArchARM64, Libc: LibcMusl}
		patterns := GetArchitecturePatterns(sys)
		if !reflect.DeepEqual(patterns.Variants, []string{"musl", "gnu", "unknown-linux"}) {
			t.Errorf("Variants = %v", patterns.Variants)
		}
	})

	t.Run("Windows x64", func(t *testing.T) {
		sys := SystemInfo{OS: "windows", Arch: ArchAMD64}
		patterns := GetArchitecturePatterns(sys)
		if !reflect.DeepEqual(patterns.System, []string{"windows", "win32", "win64", "pc-windows-gnu"}) {
			t.Errorf("System = %v", patterns.System)
		}
		if !reflect.DeepEqual(patterns.Variants, []string{"mingw", "msys", "cygwin", "pc-windows"}) {
			t.Errorf("Variants = %v", patterns.Variants)
		}
	})

	t.Run("unknown platform and architecture", func(t *testing.T) {
		sys := SystemInfo{OS: "unknown", Arch: "unknown"}
		patterns := GetArchitecturePatterns(sys)
		if patterns.System != nil || patterns.CPU != nil || patterns.Variants != nil {
			t.Errorf("Expected nil slices for unknown sys, got %+v", patterns)
		}
	})
}

func TestGetArchitectureRegex(t *testing.T) {
	t.Run("macOS ARM64", func(t *testing.T) {
		sys := SystemInfo{OS: OSDarwin, Arch: ArchARM64}
		regex := GetArchitectureRegex(sys)
		if !strings.Contains(regex.SystemPattern, "apple") || !strings.Contains(regex.SystemPattern, "darwin") {
			t.Errorf("SystemPattern = %q", regex.SystemPattern)
		}
		if !strings.Contains(regex.CPUPattern, "arm64") || !strings.Contains(regex.CPUPattern, "aarch64") {
			t.Errorf("CPUPattern = %q", regex.CPUPattern)
		}
	})

	t.Run("Linux x86_64", func(t *testing.T) {
		sys := SystemInfo{OS: OSLinux, Arch: ArchAMD64}
		regex := GetArchitectureRegex(sys)
		if !strings.Contains(regex.SystemPattern, "linux") {
			t.Errorf("SystemPattern = %q", regex.SystemPattern)
		}
		if !strings.Contains(regex.CPUPattern, "amd64") || !strings.Contains(regex.CPUPattern, "x86_64") {
			t.Errorf("CPUPattern = %q", regex.CPUPattern)
		}
	})
}

func TestIsNonBinaryAsset(t *testing.T) {
	nonBinaries := []string{
		"tool-1.0.0.sha256",
		"tool-1.0.0.sha256sum",
		"tool-1.0.0.md5",
		"tool-1.0.0.md5sum",
		"tool-1.0.0.sum",
		"tool-1.0.0.asc",
		"tool-1.0.0.sig",
		"tool-1.0.0.pem",
		"tool-1.0.0.json",
		"tool-1.0.0.txt",
		"tool-1.0.0.sbom",
		"README.md",
		"LICENSE.txt",
		"shasums.txt",
		"package.deb",
		"package.rpm",
		"package.apk",
		"package.flatpak",
		"package.pkg",
		"buildable-artifact.tar.gz",
		"extension.vsix",
		"hash.b3",
		"archive.zst",
	}
	for _, name := range nonBinaries {
		if !IsNonBinaryAsset(name) {
			t.Errorf("IsNonBinaryAsset(%q) = false, want true", name)
		}
	}

	binaries := []string{
		"tool-linux-amd64.tar.gz",
		"tool-darwin-arm64.zip",
		"mytool",
	}
	for _, name := range binaries {
		if IsNonBinaryAsset(name) {
			t.Errorf("IsNonBinaryAsset(%q) = true, want false", name)
		}
	}
}

func TestMatchesArchitecture(t *testing.T) {
	macosArm64Regex := GetArchitectureRegex(SystemInfo{OS: OSDarwin, Arch: ArchARM64})
	linuxX64Regex := GetArchitectureRegex(SystemInfo{OS: OSLinux, Arch: ArchAMD64})

	t.Run("matches macOS ARM64 assets", func(t *testing.T) {
		if !MatchesArchitecture("myapp-darwin-arm64.tar.gz", macosArm64Regex) {
			t.Errorf("Expected match for myapp-darwin-arm64.tar.gz")
		}
		if !MatchesArchitecture("myapp-macos-aarch64.zip", macosArm64Regex) {
			t.Errorf("Expected match for myapp-macos-aarch64.zip")
		}
		if !MatchesArchitecture("myapp-apple-arm64.dmg", macosArm64Regex) {
			t.Errorf("Expected match for myapp-apple-arm64.dmg")
		}
	})

	t.Run("matches Linux x64 assets", func(t *testing.T) {
		if !MatchesArchitecture("myapp-linux-amd64.tar.gz", linuxX64Regex) {
			t.Errorf("Expected match for myapp-linux-amd64.tar.gz")
		}
		if !MatchesArchitecture("myapp-linux-x86_64.zip", linuxX64Regex) {
			t.Errorf("Expected match for myapp-linux-x86_64.zip")
		}
	})

	t.Run("does not match .flatpak package files", func(t *testing.T) {
		if MatchesArchitecture("goreleaser_2.15.4_linux_amd64.flatpak", linuxX64Regex) {
			t.Errorf("Should not match .flatpak file")
		}
	})

	t.Run("does not match Android-targeted Linux assets", func(t *testing.T) {
		if MatchesArchitecture("bun-linux-x64-android-baseline.zip", linuxX64Regex) {
			t.Errorf("Should not match Android targeted asset on Linux")
		}
	})

	t.Run("does not match wrong system or wrong cpu", func(t *testing.T) {
		if MatchesArchitecture("myapp-windows-arm64.zip", macosArm64Regex) {
			t.Errorf("Should not match wrong OS")
		}
		if MatchesArchitecture("myapp-darwin-x86_64.tar.gz", macosArm64Regex) {
			t.Errorf("Should not match wrong CPU")
		}
	})

	t.Run("case insensitive", func(t *testing.T) {
		if !MatchesArchitecture("MyApp-Darwin-ARM64.tar.gz", macosArm64Regex) {
			t.Errorf("Case insensitive match failed")
		}
	})

	t.Run("empty patterns match all binary assets", func(t *testing.T) {
		emptyRegex := ArchitectureRegex{}
		if !MatchesArchitecture("any-file-name.tar.gz", emptyRegex) {
			t.Errorf("Empty regex should match any binary asset")
		}
	})

	t.Run("system pattern only or CPU pattern only", func(t *testing.T) {
		systemOnly := ArchitectureRegex{SystemPattern: "(darwin)"}
		if !MatchesArchitecture("myapp-darwin-unknown.tar.gz", systemOnly) {
			t.Errorf("Expected systemOnly match")
		}
		if MatchesArchitecture("myapp-linux-unknown.tar.gz", systemOnly) {
			t.Errorf("Expected systemOnly non-match")
		}

		cpuOnly := ArchitectureRegex{CPUPattern: "(arm64)"}
		if !MatchesArchitecture("myapp-unknown-arm64.tar.gz", cpuOnly) {
			t.Errorf("Expected cpuOnly match")
		}
		if MatchesArchitecture("myapp-unknown-x64.tar.gz", cpuOnly) {
			t.Errorf("Expected cpuOnly non-match")
		}
	})
}

func TestMatchesArchitecture_FZFAssets(t *testing.T) {
	assets := []string{
		"fzf-0.66.0-android_arm64.tar.gz",
		"fzf-0.66.0-darwin_amd64.tar.gz",
		"fzf-0.66.0-darwin_arm64.tar.gz",
		"fzf-0.66.0-freebsd_amd64.tar.gz",
		"fzf-0.66.0-linux_amd64.tar.gz",
		"fzf-0.66.0-linux_arm64.tar.gz",
		"fzf-0.66.0-linux_armv5.tar.gz",
		"fzf-0.66.0-linux_armv6.tar.gz",
		"fzf-0.66.0-linux_armv7.tar.gz",
		"fzf-0.66.0-linux_loong64.tar.gz",
		"fzf-0.66.0-linux_ppc64le.tar.gz",
		"fzf-0.66.0-linux_s390x.tar.gz",
		"fzf-0.66.0-openbsd_amd64.tar.gz",
		"fzf-0.66.0-windows_amd64.zip",
		"fzf-0.66.0-windows_arm64.zip",
		"fzf-0.66.0-windows_armv5.zip",
		"fzf-0.66.0-windows_armv6.zip",
		"fzf-0.66.0-windows_armv7.zip",
		"fzf_0.66.0_checksums.txt",
	}

	tests := []struct {
		os       string
		arch     string
		expected []string
	}{
		{OSDarwin, ArchARM64, []string{"fzf-0.66.0-darwin_arm64.tar.gz"}},
		{OSDarwin, ArchAMD64, []string{"fzf-0.66.0-darwin_amd64.tar.gz"}},
		{OSLinux, ArchAMD64, []string{"fzf-0.66.0-linux_amd64.tar.gz"}},
		{OSLinux, ArchARM64, []string{"fzf-0.66.0-linux_arm64.tar.gz"}},
		{"windows", ArchAMD64, []string{"fzf-0.66.0-windows_amd64.zip"}},
		{"windows", ArchARM64, []string{"fzf-0.66.0-windows_arm64.zip"}},
	}

	for _, tt := range tests {
		t.Run(tt.os+"_"+tt.arch, func(t *testing.T) {
			regex := GetArchitectureRegex(SystemInfo{OS: tt.os, Arch: tt.arch})
			var matched []string
			for _, asset := range assets {
				if MatchesArchitecture(asset, regex) {
					matched = append(matched, asset)
				}
			}
			if !reflect.DeepEqual(matched, tt.expected) {
				t.Errorf("Matches = %v, want %v", matched, tt.expected)
			}
		})
	}
}

func TestSelectBestMatch(t *testing.T) {
	t.Run("returns empty string when no assets match", func(t *testing.T) {
		sys := SystemInfo{OS: OSDarwin, Arch: ArchARM64}
		got := SelectBestMatch([]string{"tool-windows-x64.exe", "tool-linux-amd64.tar.gz"}, sys)
		if got != "" {
			t.Errorf("SelectBestMatch = %q, want empty string", got)
		}
	})

	t.Run("returns only matching asset", func(t *testing.T) {
		sys := SystemInfo{OS: OSDarwin, Arch: ArchARM64}
		assets := []string{"tool-darwin-arm64.tar.gz", "tool-linux-amd64.tar.gz", "tool-windows-x64.exe"}
		got := SelectBestMatch(assets, sys)
		if got != "tool-darwin-arm64.tar.gz" {
			t.Errorf("SelectBestMatch = %q, want tool-darwin-arm64.tar.gz", got)
		}
	})

	t.Run("macOS universal binary vs specific", func(t *testing.T) {
		sys := SystemInfo{OS: OSDarwin, Arch: ArchARM64}
		assets := []string{
			"onefetch-linux.tar.gz",
			"onefetch-mac.tar.gz",
			"onefetch-win.tar.gz",
			"onefetch.sha256",
		}
		got := SelectBestMatch(assets, sys)
		if got != "onefetch-mac.tar.gz" {
			t.Errorf("SelectBestMatch = %q, want %q", got, "onefetch-mac.tar.gz")
		}
	})

	t.Run("Linux glibc vs musl ranking", func(t *testing.T) {
		sysGlibc := SystemInfo{OS: OSLinux, Arch: ArchAMD64, Libc: LibcGlibc}
		assets := []string{
			"tool-linux-amd64-musl.tar.gz",
			"tool-linux-amd64-gnu.tar.gz",
			"tool-linux-amd64.tar.gz",
		}
		gotGlibc := SelectBestMatch(assets, sysGlibc)
		if gotGlibc != "tool-linux-amd64-gnu.tar.gz" {
			t.Errorf("SelectBestMatch for glibc = %q, want %q", gotGlibc, "tool-linux-amd64-gnu.tar.gz")
		}

		sysMusl := SystemInfo{OS: OSLinux, Arch: ArchAMD64, Libc: LibcMusl}
		gotMusl := SelectBestMatch(assets, sysMusl)
		if gotMusl != "tool-linux-amd64-musl.tar.gz" {
			t.Errorf("SelectBestMatch for musl = %q, want %q", gotMusl, "tool-linux-amd64-musl.tar.gz")
		}
	})

	t.Run("prefer generic Linux asset over musl when libc is gnu", func(t *testing.T) {
		sys := SystemInfo{OS: OSLinux, Arch: ArchAMD64, Libc: LibcGlibc}
		assets := []string{"bun-linux-x64-musl-baseline.zip", "bun-linux-x64-baseline.zip", "bun-darwin-aarch64.zip"}
		got := SelectBestMatch(assets, sys)
		if got != "bun-linux-x64-baseline.zip" {
			t.Errorf("SelectBestMatch = %q, want bun-linux-x64-baseline.zip", got)
		}
	})

	t.Run("ignore Android-targeted Linux assets", func(t *testing.T) {
		sys := SystemInfo{OS: OSLinux, Arch: ArchAMD64, Libc: LibcGlibc}
		assets := []string{"bun-linux-x64-android-baseline.zip", "bun-linux-x64-baseline.zip", "bun-darwin-aarch64.zip"}
		got := SelectBestMatch(assets, sys)
		if got != "bun-linux-x64-baseline.zip" {
			t.Errorf("SelectBestMatch = %q, want bun-linux-x64-baseline.zip", got)
		}
	})

	t.Run("prefer mingw variant for Windows", func(t *testing.T) {
		sys := SystemInfo{OS: "windows", Arch: ArchAMD64}
		assets := []string{"tool-windows-x64-msys.zip", "tool-windows-x64-mingw.zip", "tool-linux-amd64.tar.gz"}
		got := SelectBestMatch(assets, sys)
		if got != "tool-windows-x64-mingw.zip" {
			t.Errorf("SelectBestMatch = %q, want tool-windows-x64-mingw.zip", got)
		}
	})

	t.Run("exclude non-binary files", func(t *testing.T) {
		sys := SystemInfo{OS: OSLinux, Arch: ArchAMD64, Libc: LibcGlibc}
		assets := []string{
			"tool-linux-amd64.tar.gz.sha256",
			"tool-linux-amd64.tar.gz.sig",
			"tool-linux-amd64.tar.gz.sbom",
			"tool-linux-amd64.pem",
			"SHASUMS256.txt",
			"caddy_2.9.1_buildable-artifact.tar.gz",
			"tool-linux-amd64.flatpak",
			"tool-linux-amd64.tar.gz",
		}
		got := SelectBestMatch(assets, sys)
		if got != "tool-linux-amd64.tar.gz" {
			t.Errorf("SelectBestMatch = %q, want tool-linux-amd64.tar.gz", got)
		}
	})
}
