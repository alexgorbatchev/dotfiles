import type { ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import { describe, expect, test } from "bun:test";

import { architectureBitmaskToNames, platformBitmaskToNames, serializeToolConfig } from "../types";

describe("platformBitmaskToNames", () => {
  test("returns empty array for Platform.None", () => {
    const result = platformBitmaskToNames(Platform.None);
    expect(result).toEqual([]);
  });

  test("returns Linux for Platform.Linux", () => {
    const result = platformBitmaskToNames(Platform.Linux);
    expect(result).toEqual(["Linux"]);
  });

  test("returns macOS for Platform.MacOS", () => {
    const result = platformBitmaskToNames(Platform.MacOS);
    expect(result).toEqual(["macOS"]);
  });

  test("returns Windows for Platform.Windows", () => {
    const result = platformBitmaskToNames(Platform.Windows);
    expect(result).toEqual(["Windows"]);
  });

  test("returns Linux and macOS for Platform.Unix", () => {
    const result = platformBitmaskToNames(Platform.Unix);
    expect(result).toEqual(["Linux", "macOS"]);
  });

  test("returns all platforms for Platform.All", () => {
    const result = platformBitmaskToNames(Platform.All);
    expect(result).toEqual(["Linux", "macOS", "Windows"]);
  });

  test("returns correct names for custom combination", () => {
    const result = platformBitmaskToNames(Platform.Linux | Platform.Windows);
    expect(result).toEqual(["Linux", "Windows"]);
  });
});

describe("architectureBitmaskToNames", () => {
  test("returns empty array for Architecture.None", () => {
    const result = architectureBitmaskToNames(Architecture.None);
    expect(result).toEqual([]);
  });

  test("returns x86_64 for Architecture.X86_64", () => {
    const result = architectureBitmaskToNames(Architecture.X86_64);
    expect(result).toEqual(["x86_64"]);
  });

  test("returns arm64 for Architecture.Arm64", () => {
    const result = architectureBitmaskToNames(Architecture.Arm64);
    expect(result).toEqual(["arm64"]);
  });

  test("returns all architectures for Architecture.All", () => {
    const result = architectureBitmaskToNames(Architecture.All);
    expect(result).toEqual(["x86_64", "arm64"]);
  });
});

describe("serializeToolConfig", () => {
  test("serializes basic tool config without platformConfigs", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo", assetPattern: "test-*" },
      binaries: ["test-bin"],
    };

    const result = serializeToolConfig(config);

    expect(result.name).toBe("test-tool");
    expect(result.version).toBe("latest");
    expect(result.installationMethod).toBe("github-release");
    expect(result.installParams.repo).toBe("owner/repo");
    expect(result.installParams.assetPattern).toBe("test-*");
    expect(result.binaries).toEqual(["test-bin"]);
    expect(result.platformConfigs).toBeUndefined();
  });

  test("serializes tool config with single platform config", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
      binaries: ["test-bin"],
      platformConfigs: [
        {
          platforms: Platform.MacOS,
          config: {
            installationMethod: "brew",
            installParams: { formula: "test-formula" },
          },
        },
      ],
    };

    const result = serializeToolConfig(config);

    expect(result.platformConfigs).toBeDefined();
    expect(result.platformConfigs).toHaveLength(1);
    expect(result.platformConfigs![0]!.platforms).toEqual(["macOS"]);
    expect(result.platformConfigs![0]!.installationMethod).toBe("brew");
    expect(result.platformConfigs![0]!.installParams?.formula).toBe("test-formula");
  });

  test("serializes tool config with multiple platform configs", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
      binaries: ["test-bin"],
      platformConfigs: [
        {
          platforms: Platform.MacOS,
          config: {
            installationMethod: "brew",
            installParams: { formula: "mac-formula" },
          },
        },
        {
          platforms: Platform.Linux,
          architectures: Architecture.X86_64,
          config: {
            binaries: ["linux-binary"],
          },
        },
      ],
    };

    const result = serializeToolConfig(config);

    expect(result.platformConfigs).toHaveLength(2);

    const macConfig = result.platformConfigs![0];
    expect(macConfig!.platforms).toEqual(["macOS"]);
    expect(macConfig!.architectures).toBeUndefined();
    expect(macConfig!.installationMethod).toBe("brew");

    const linuxConfig = result.platformConfigs![1];
    expect(linuxConfig!.platforms).toEqual(["Linux"]);
    expect(linuxConfig!.architectures).toEqual(["x86_64"]);
    expect(linuxConfig!.binaries).toEqual(["linux-binary"]);
  });

  test("serializes platform config with Unix (combined platforms)", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
      binaries: ["test-bin"],
      platformConfigs: [
        {
          platforms: Platform.Unix,
          config: {
            symlinks: [{ source: "./config", target: "~/.config" }],
          },
        },
      ],
    };

    const result = serializeToolConfig(config);

    expect(result.platformConfigs).toHaveLength(1);
    expect(result.platformConfigs![0]!.platforms).toEqual(["Linux", "macOS"]);
    expect(result.platformConfigs![0]!.symlinks).toEqual([{ source: "./config", target: "~/.config" }]);
  });

  test("serializes platform config with all architectures", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
      binaries: ["test-bin"],
      platformConfigs: [
        {
          platforms: Platform.Linux,
          architectures: Architecture.All,
          config: {
            binaries: ["linux-bin"],
          },
        },
      ],
    };

    const result = serializeToolConfig(config);

    expect(result.platformConfigs![0]!.architectures).toEqual(["x86_64", "arm64"]);
  });

  test("serializes cargo install params", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "cargo",
      installParams: { crateName: "test-crate" },
      binaries: ["test-bin"],
    };

    const result = serializeToolConfig(config);

    expect(result.installParams.crate).toBe("test-crate");
  });

  test("serializes brew install params", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "brew",
      installParams: { formula: "test-formula" },
      binaries: ["test-bin"],
    };

    const result = serializeToolConfig(config);

    expect(result.installParams.formula).toBe("test-formula");
  });

  test("serializes curl-tar install params", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "curl-tar",
      installParams: { url: "https://example.com/tool.tar.gz" },
      binaries: ["test-bin"],
    };

    const result = serializeToolConfig(config);

    expect(result.installParams.url).toBe("https://example.com/tool.tar.gz");
  });

  test("serializes ghCli option", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo", ghCli: true },
      binaries: ["test-bin"],
    };

    const result = serializeToolConfig(config);

    expect(result.installParams.ghCli).toBe(true);
  });

  test("handles empty platformConfigs array", () => {
    const config: ToolConfig = {
      name: "test-tool",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
      binaries: ["test-bin"],
      platformConfigs: [],
    };

    const result = serializeToolConfig(config);

    expect(result.platformConfigs).toBeUndefined();
  });
});
