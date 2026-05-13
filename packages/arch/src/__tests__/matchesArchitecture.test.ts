import type { IArchitectureRegex } from "@dotfiles/arch";
import { getArchitectureRegex, matchesArchitecture } from "@dotfiles/arch";
import { Architecture, type ISystemInfo, Platform } from "@dotfiles/core";
import { describe, expect, it } from "bun:test";

describe("matchesArchitecture", () => {
  const macosArm64SystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: "/home/test",
    hostname: "test-host",
  };

  const linuxX64SystemInfo: ISystemInfo = {
    platform: Platform.Linux,
    arch: Architecture.X86_64,
    homeDir: "/home/test",
    hostname: "test-host",
  };

  const macosArm64Regex = getArchitectureRegex(macosArm64SystemInfo);
  const linuxX64Regex = getArchitectureRegex(linuxX64SystemInfo);

  it("should match asset with correct system and CPU for macOS ARM64", () => {
    expect(matchesArchitecture("myapp-darwin-arm64.tar.gz", macosArm64Regex)).toBe(true);
    expect(matchesArchitecture("myapp-macos-aarch64.zip", macosArm64Regex)).toBe(true);
    expect(matchesArchitecture("myapp-apple-arm64.dmg", macosArm64Regex)).toBe(true);
  });

  it("should match asset with correct system and CPU for Linux x64", () => {
    expect(matchesArchitecture("myapp-linux-amd64.tar.gz", linuxX64Regex)).toBe(true);
    expect(matchesArchitecture("myapp-linux-x86_64.zip", linuxX64Regex)).toBe(true);
    expect(matchesArchitecture("tool-linux-x64.tar.gz", linuxX64Regex)).toBe(true);
  });

  it("should not match .flatpak package files even when platform and CPU match", () => {
    expect(matchesArchitecture("goreleaser_2.15.4_linux_amd64.flatpak", linuxX64Regex)).toBe(false);
  });

  it("should not match Android-targeted Linux assets on desktop Linux", () => {
    expect(matchesArchitecture("bun-linux-x64-android-baseline.zip", linuxX64Regex)).toBe(false);
  });

  it("should not match asset with wrong system", () => {
    expect(matchesArchitecture("myapp-windows-arm64.zip", macosArm64Regex)).toBe(false);
    expect(matchesArchitecture("myapp-linux-arm64.tar.gz", macosArm64Regex)).toBe(false);
  });

  it("should not match asset with wrong CPU", () => {
    expect(matchesArchitecture("myapp-darwin-x86_64.tar.gz", macosArm64Regex)).toBe(false);
    expect(matchesArchitecture("myapp-macos-amd64.zip", macosArm64Regex)).toBe(false);
  });

  it("should be case insensitive", () => {
    expect(matchesArchitecture("MyApp-Darwin-ARM64.tar.gz", macosArm64Regex)).toBe(true);
    expect(matchesArchitecture("MYAPP-LINUX-AMD64.tar.gz", linuxX64Regex)).toBe(true);
  });

  it("should match when patterns are empty (match all)", () => {
    const emptyRegex: IArchitectureRegex = {
      systemPattern: "",
      cpuPattern: "",
      variantPattern: "",
    };

    expect(matchesArchitecture("any-file-name.tar.gz", emptyRegex)).toBe(true);
  });

  it("should match when only system pattern is present", () => {
    const systemOnlyRegex: IArchitectureRegex = {
      systemPattern: "(darwin)",
      cpuPattern: "",
      variantPattern: "",
    };

    expect(matchesArchitecture("myapp-darwin-unknown.tar.gz", systemOnlyRegex)).toBe(true);
    expect(matchesArchitecture("myapp-linux-unknown.tar.gz", systemOnlyRegex)).toBe(false);
  });

  it("should match when only CPU pattern is present", () => {
    const cpuOnlyRegex: IArchitectureRegex = {
      systemPattern: "",
      cpuPattern: "(arm64)",
      variantPattern: "",
    };

    expect(matchesArchitecture("myapp-unknown-arm64.tar.gz", cpuOnlyRegex)).toBe(true);
    expect(matchesArchitecture("myapp-unknown-x64.tar.gz", cpuOnlyRegex)).toBe(false);
  });
});

describe("matchesArchitecture with FZF release assets", () => {
  const assets: string[] = [
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
  ];

  function expectMatchingAssets(platform: Platform, arch: Architecture, expectedAssets: string[]): void {
    it(`should find correct file for ${platform}/${arch}`, () => {
      const systemInfo: ISystemInfo = {
        platform,
        arch,
        homeDir: "/home/test",
        hostname: "test-host",
      };
      const regex = getArchitectureRegex(systemInfo);
      const matchedAssets = assets.filter((asset) => matchesArchitecture(asset, regex));
      expect(matchedAssets).toEqual(expectedAssets);
    });
  }

  expectMatchingAssets(Platform.MacOS, Architecture.Arm64, ["fzf-0.66.0-darwin_arm64.tar.gz"]);
  expectMatchingAssets(Platform.MacOS, Architecture.X86_64, ["fzf-0.66.0-darwin_amd64.tar.gz"]);
  expectMatchingAssets(Platform.Linux, Architecture.X86_64, ["fzf-0.66.0-linux_amd64.tar.gz"]);
  expectMatchingAssets(Platform.Linux, Architecture.Arm64, ["fzf-0.66.0-linux_arm64.tar.gz"]);
  expectMatchingAssets(Platform.Windows, Architecture.X86_64, ["fzf-0.66.0-windows_amd64.zip"]);
  expectMatchingAssets(Platform.Windows, Architecture.Arm64, ["fzf-0.66.0-windows_arm64.zip"]);
});
