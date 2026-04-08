import { describe, expect, test } from "bun:test";

import type { ISerializableToolConfig, IToolDetail } from "../../../shared/types";
import {
  buildBinaryToToolMap,
  findDependentTools,
  getBinaryName,
  getReadmeRepo,
  getSourceInfo,
} from "../tool-detail-utils";

type ToolDetailStub = Partial<ISerializableToolConfig> & {
  name: string;
};

function createMockToolDetail(overrides: ToolDetailStub): IToolDetail {
  return {
    config: {
      name: overrides.name,
      version: overrides.version ?? "latest",
      installationMethod: overrides.installationMethod ?? "github-release",
      installParams: overrides.installParams ?? { repo: "test/repo" },
      binaries: "binaries" in overrides ? overrides.binaries : [overrides.name],
      dependencies: overrides.dependencies,
      symlinks: overrides.symlinks,
      disabled: overrides.disabled,
      configFilePath: overrides.configFilePath,
    },
    runtime: {
      status: "installed",
      installedVersion: "1.0.0",
      installedAt: "2026-01-01T00:00:00Z",
      installPath: "/path/to/tool",
      binaryPaths: [],
      hasUpdate: false,
    },
    files: [],
    binaryDiskSize: 0,
    usage: {
      totalCount: 0,
      binaries: [],
    },
  };
}

describe("getBinaryName", () => {
  test("returns string binary as-is", () => {
    expect(getBinaryName("foo")).toBe("foo");
  });

  test("returns name from binary config object", () => {
    expect(getBinaryName({ name: "bar", pattern: "**/*" })).toBe("bar");
  });
});

describe("buildBinaryToToolMap", () => {
  test("creates map from string binaries", () => {
    const tools = [
      createMockToolDetail({ name: "tool-a", binaries: ["bin-a", "bin-a2"] }),
      createMockToolDetail({ name: "tool-b", binaries: ["bin-b"] }),
    ];

    const map = buildBinaryToToolMap(tools);

    expect(map.get("bin-a")).toBe("tool-a");
    expect(map.get("bin-a2")).toBe("tool-a");
    expect(map.get("bin-b")).toBe("tool-b");
  });

  test("creates map from binary config objects", () => {
    const tools = [
      createMockToolDetail({
        name: "tool-c",
        binaries: [{ name: "bin-c", pattern: "**/*" }],
      }),
    ];

    const map = buildBinaryToToolMap(tools);

    expect(map.get("bin-c")).toBe("tool-c");
  });

  test("handles tools without binaries", () => {
    const tools = [createMockToolDetail({ name: "tool-d", binaries: undefined })];

    const map = buildBinaryToToolMap(tools);

    expect(map.size).toBe(0);
  });

  test("returns empty map for empty tools array", () => {
    const map = buildBinaryToToolMap([]);

    expect(map.size).toBe(0);
  });
});

describe("findDependentTools", () => {
  test("finds tools that depend on specified binaries", () => {
    const tools = [
      createMockToolDetail({ name: "tool-a", binaries: ["bin-a"], dependencies: ["bin-b"] }),
      createMockToolDetail({ name: "tool-b", binaries: ["bin-b"] }),
      createMockToolDetail({ name: "tool-c", binaries: ["bin-c"], dependencies: ["bin-a"] }),
    ];

    const dependents = findDependentTools(tools, ["bin-b"]);

    expect(dependents).toHaveLength(1);
    const firstDependent = dependents[0];
    expect(firstDependent).toBeDefined();
    expect(firstDependent?.config.name).toBe("tool-a");
  });

  test("returns empty array when no tools depend on binaries", () => {
    const tools = [
      createMockToolDetail({ name: "tool-a", binaries: ["bin-a"] }),
      createMockToolDetail({ name: "tool-b", binaries: ["bin-b"] }),
    ];

    const dependents = findDependentTools(tools, ["bin-x"]);

    expect(dependents).toHaveLength(0);
  });

  test("handles tools without dependencies", () => {
    const tools = [createMockToolDetail({ name: "tool-a", binaries: ["bin-a"], dependencies: undefined })];

    const dependents = findDependentTools(tools, ["bin-a"]);

    expect(dependents).toHaveLength(0);
  });

  test("finds multiple dependent tools", () => {
    const tools = [
      createMockToolDetail({ name: "tool-a", dependencies: ["fnm"] }),
      createMockToolDetail({ name: "tool-b", dependencies: ["fnm", "node"] }),
      createMockToolDetail({ name: "tool-c", dependencies: ["node"] }),
    ];

    const dependents = findDependentTools(tools, ["fnm"]);

    expect(dependents).toHaveLength(2);
    expect(dependents.map((t) => t.config.name).toSorted()).toEqual(["tool-a", "tool-b"]);
  });
});

describe("getReadmeRepo", () => {
  test("returns top-level repo when available", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
    };

    const result = getReadmeRepo(config);

    expect(result).toBe("owner/repo");
  });

  test("falls back to platform-specific repo when top-level repo is missing", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
      platformConfigs: [
        {
          platforms: ["Linux"],
          installationMethod: "github-release",
          installParams: { repo: "owner/platform-repo" },
        },
      ],
    };

    const result = getReadmeRepo(config);

    expect(result).toBe("owner/platform-repo");
  });

  test("returns null when no repo is configured", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
    };

    const result = getReadmeRepo(config);

    expect(result).toBeNull();
  });
});

describe("getSourceInfo", () => {
  test("returns GitHub URL for github-release", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "owner/repo" },
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "owner/repo",
      url: "https://github.com/owner/repo",
    });
  });

  test("returns crates.io URL for cargo", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "cargo",
      installParams: { crate: "my-crate" },
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "my-crate",
      url: "https://crates.io/crates/my-crate",
    });
  });

  test("returns formulae.brew.sh URL for brew", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "brew",
      installParams: { formula: "my-formula" },
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "my-formula",
      url: "https://formulae.brew.sh/formula/my-formula",
    });
  });

  test("returns GitHub URL for zsh-plugin", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "zsh-plugin",
      installParams: { repo: "user/plugin" },
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "user/plugin",
      url: "https://github.com/user/plugin",
    });
  });

  test("returns URL as-is for curl-script", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "curl-script",
      installParams: { url: "https://example.com/install.sh" },
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "https://example.com/install.sh",
      url: "https://example.com/install.sh",
    });
  });

  test("returns URL as-is for curl-tar", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "curl-tar",
      installParams: { url: "https://example.com/archive.tar.gz" },
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "https://example.com/archive.tar.gz",
      url: "https://example.com/archive.tar.gz",
    });
  });

  test("returns source info from platform config when top-level config has no source", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
      platformConfigs: [
        {
          platforms: ["Linux"],
          installationMethod: "github-release",
          installParams: { repo: "owner/repo" },
        },
      ],
    };

    const result = getSourceInfo(config);

    expect(result).toEqual({
      value: "owner/repo",
      url: "https://github.com/owner/repo",
    });
  });

  test("returns null for manual installer", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "manual",
      installParams: {},
    };

    const result = getSourceInfo(config);

    expect(result).toBeNull();
  });

  test("returns null for unknown installer", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "unknown",
      installParams: {},
    };

    const result = getSourceInfo(config);

    expect(result).toBeNull();
  });

  test("returns null when required param is missing", () => {
    const config: ISerializableToolConfig = {
      name: "test",
      version: "latest",
      installationMethod: "github-release",
      installParams: {},
    };

    const result = getSourceInfo(config);

    expect(result).toBeNull();
  });
});
