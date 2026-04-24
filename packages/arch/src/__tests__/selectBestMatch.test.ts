import { Architecture, Libc, type ISystemInfo, Platform } from "@dotfiles/core";
import { describe, expect, it } from "bun:test";
import { selectBestMatch } from "../selectBestMatch";

describe("selectBestMatch", () => {
  it("should return undefined when no assets match", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: "/home/test",
      hostname: "test-host",
    };

    const result = selectBestMatch(["tool-windows-x64.exe", "tool-linux-amd64.tar.gz"], systemInfo);

    expect(result).toBeUndefined();
  });

  it("should return the only matching asset", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: "/home/test",
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["tool-darwin-arm64.tar.gz", "tool-linux-amd64.tar.gz", "tool-windows-x64.exe"],
      systemInfo,
    );

    expect(result).toBe("tool-darwin-arm64.tar.gz");
  });

  it("should prefer gnu variant when libc is gnu and both gnu and musl assets exist", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      libc: Libc.Gnu,
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["tool-linux-x86_64-gnu.tar.gz", "tool-linux-x86_64-musl.tar.gz", "tool-darwin-arm64.tar.gz"],
      systemInfo,
    );

    expect(result).toBe("tool-linux-x86_64-gnu.tar.gz");
  });

  it("should prefer a generic Linux asset over musl when libc is gnu", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      libc: Libc.Gnu,
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["bun-linux-x64-musl-baseline.zip", "bun-linux-x64-baseline.zip", "bun-darwin-aarch64.zip"],
      systemInfo,
    );

    expect(result).toBe("bun-linux-x64-baseline.zip");
  });

  it("should prefer musl variant when libc is musl and both generic and musl assets exist", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      libc: Libc.Musl,
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["bun-linux-x64-baseline.zip", "bun-linux-x64-musl-baseline.zip", "bun-darwin-aarch64.zip"],
      systemInfo,
    );

    expect(result).toBe("bun-linux-x64-musl-baseline.zip");
  });

  it("should accept gnu variant if musl is not available", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      libc: Libc.Gnu,
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["tool-linux-x86_64-gnu.tar.gz", "tool-darwin-arm64.tar.gz", "tool-windows-x64.exe"],
      systemInfo,
    );

    expect(result).toBe("tool-linux-x86_64-gnu.tar.gz");
  });

  it("should work with assets that have no variant info (most common case)", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["fzf-0.66.0-linux_amd64.tar.gz", "fzf-0.66.0-darwin_arm64.tar.gz", "fzf-0.66.0-windows_amd64.zip"],
      systemInfo,
    );

    expect(result).toBe("fzf-0.66.0-linux_amd64.tar.gz");
  });

  it("should return first match when multiple assets match without variants", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      hostname: "test-host",
    };

    // If somehow there are multiple matches with no variant differentiation,
    // return the first one (zinit behavior)
    const result = selectBestMatch(
      ["tool-linux-amd64.tar.gz", "tool-linux-x86_64.tar.gz", "tool-darwin-arm64.tar.gz"],
      systemInfo,
    );

    expect(result).toBe("tool-linux-amd64.tar.gz");
  });

  it("should prefer mingw variant for Windows when multiple Windows variants exist", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Windows,
      arch: Architecture.X86_64,
      homeDir: "/home/test",
      hostname: "test-host",
    };

    const result = selectBestMatch(
      [
        "tool-windows-x64-msys.zip",
        "tool-windows-x64-mingw.zip", // mingw comes first in Windows variants
        "tool-linux-amd64.tar.gz",
      ],
      systemInfo,
    );

    // Should prefer mingw (first in Windows variants: ['mingw', 'msys', 'cygwin', 'pc-windows'])
    expect(result).toBe("tool-windows-x64-mingw.zip");
  });

  it("should handle ARM eabihf variant correctly", () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.None,
      homeDir: "/home/test",
      hostname: "test-host",
    };

    const result = selectBestMatch(
      ["tool-linux-armv7-eabihf.tar.gz", "tool-linux-armv7.tar.gz", "tool-linux-amd64.tar.gz"],
      systemInfo,
    );

    // Should prefer eabihf variant for armv7l
    expect(result).toBe("tool-linux-armv7-eabihf.tar.gz");
  });

  describe("architecture-agnostic assets", () => {
    it("should match asset with no CPU identifier (universal binary)", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        [
          "onefetch-linux.tar.gz",
          "onefetch-mac.tar.gz",
          "onefetch-setup.exe",
          "onefetch-win.tar.gz",
          "onefetch_amd64.deb",
        ],
        systemInfo,
      );

      expect(result).toBe("onefetch-mac.tar.gz");
    });

    it("should prefer architecture-specific asset over universal when both exist", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        ["tool-linux.tar.gz", "tool-linux-amd64.tar.gz", "tool-darwin-arm64.tar.gz"],
        systemInfo,
      );

      expect(result).toBe("tool-linux-amd64.tar.gz");
    });
  });

  describe("non-binary pattern exclusion", () => {
    it("should exclude .flatpak package files", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        ["goreleaser_2.15.4_linux_amd64.flatpak", "goreleaser_Linux_x86_64.tar.gz"],
        systemInfo,
      );

      expect(result).toBe("goreleaser_Linux_x86_64.tar.gz");
    });

    it("should exclude .sha256sum checksum files", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        [
          "zellij-aarch64-apple-darwin.tar.gz.sha256sum",
          "zellij-aarch64-apple-darwin.tar.gz",
          "zellij-x86_64-apple-darwin.tar.gz",
        ],
        systemInfo,
      );

      expect(result).toBe("zellij-aarch64-apple-darwin.tar.gz");
    });

    it("should exclude .sig signature files", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        ["tool-linux-amd64.tar.gz.sig", "tool-linux-amd64.tar.gz.asc", "tool-linux-amd64.tar.gz"],
        systemInfo,
      );

      expect(result).toBe("tool-linux-amd64.tar.gz");
    });

    it("should exclude buildable-artifact source archives", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        ["caddy_2.9.1_buildable-artifact.tar.gz", "caddy_2.9.1_mac_arm64.tar.gz", "caddy_2.9.1_linux_amd64.tar.gz"],
        systemInfo,
      );

      expect(result).toBe("caddy_2.9.1_mac_arm64.tar.gz");
    });

    it("should exclude SHASUMS files", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(
        ["SHASUMS256.txt", "tool-darwin-arm64.tar.gz", "tool-linux-amd64.tar.gz"],
        systemInfo,
      );

      expect(result).toBe("tool-darwin-arm64.tar.gz");
    });

    it("should exclude .sbom SBOM files", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(["tool-linux-amd64.tar.gz.sbom", "tool-linux-amd64.tar.gz"], systemInfo);

      expect(result).toBe("tool-linux-amd64.tar.gz");
    });

    it("should exclude .pem certificate files", () => {
      const systemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: "/home/test",
        hostname: "test-host",
      };

      const result = selectBestMatch(["tool-linux-amd64.pem", "tool-linux-amd64.tar.gz"], systemInfo);

      expect(result).toBe("tool-linux-amd64.tar.gz");
    });
  });
});
