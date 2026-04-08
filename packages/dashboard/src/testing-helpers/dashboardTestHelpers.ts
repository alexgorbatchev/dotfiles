import type { IConfigService } from "@dotfiles/config";
import type { ISystemInfo, ProjectConfig, ToolConfig } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import type { MockedInterface } from "@dotfiles/testing-helpers";
import { type IVersionChecker, VersionComparisonStatus } from "@dotfiles/version-checker";
import { mock } from "bun:test";

type MockToolConfigInput = Partial<ToolConfig> & {
  name: string;
};

/**
 * Creates a mock ProjectConfig with standard test paths.
 * Uses a simple object mock since dashboard tests only need path configuration.
 */
export function createMockProjectConfig(): ProjectConfig {
  return {
    paths: {
      dotfilesDir: "/home/user/.dotfiles",
      generatedDir: "/home/user/.dotfiles/.generated",
      binariesDir: "/home/user/.dotfiles/.generated/binaries",
      targetDir: "/home/user/.dotfiles/.generated/bin-default",
      toolConfigsDir: "/home/user/.dotfiles/tools",
      homeDir: "/home/user",
      shellScriptsDir: "/home/user/.dotfiles/.generated/shell-scripts",
    },
  } as ProjectConfig;
}

/**
 * Creates a mock IVersionChecker with standard test behavior.
 */
export function createMockVersionChecker(): MockedInterface<IVersionChecker> {
  return {
    getLatestToolVersion: mock(async (_owner: string, _repo: string) => "1.0.0"),
    checkVersionStatus: mock(
      async (_currentVersion: string, _latestVersion: string) => VersionComparisonStatus.UP_TO_DATE,
    ),
  };
}

/**
 * Creates a mock ISystemInfo for testing.
 */
export function createMockSystemInfo(): ISystemInfo {
  return {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: "/home/user",
    hostname: "test-host",
  };
}

/**
 * Creates a mock IConfigService that returns the provided tool configs.
 */
export function createMockConfigService(toolConfigs: Record<string, ToolConfig>): IConfigService {
  return {
    loadSingleToolConfig: mock(async () => undefined),
    loadToolConfigByBinary: mock(async () => undefined),
    loadToolConfigs: mock(async () => toolConfigs),
  };
}

/**
 * Creates a minimal mock ToolConfig for testing.
 */
export function createMockToolConfig(overrides: MockToolConfigInput): ToolConfig {
  const { name, version, installationMethod, installParams, binaries, ...rest } = overrides;
  return {
    name,
    version: version ?? "latest",
    installationMethod: installationMethod ?? "github-release",
    installParams: installParams ?? { repo: "test/repo" },
    binaries: binaries ?? [name],
    ...rest,
  } as ToolConfig;
}
