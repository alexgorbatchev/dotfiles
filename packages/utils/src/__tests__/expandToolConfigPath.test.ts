import type { ProjectConfig } from "@dotfiles/config";
import type { ISystemInfo } from "@dotfiles/core";
import { Architecture, Platform } from "@dotfiles/core";
import { createMemFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createMockProjectConfig } from "@dotfiles/testing-helpers";
import { beforeEach, describe, expect, it } from "bun:test";
import { expandToolConfigPath } from "../expandToolConfigPath";

describe("expandToolConfigPath", () => {
  let mockProjectConfig: ProjectConfig;

  const mockSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: "/Users/testuser",
    hostname: "test-host",
  };

  const toolConfigPath = "/Users/testuser/.dotfiles/configs/tools/lazygit.tool.ts";

  beforeEach(async () => {
    const logger = new TestLogger();
    const memFs = await createMemFileSystem();

    // Ensure /test directory exists in the memory filesystem
    await memFs.fs.ensureDir("/test");

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: {
          homeDir: "/Users/testuser",
          dotfilesDir: "/Users/testuser/.dotfiles",
          generatedDir: "/Users/testuser/.dotfiles/.generated",
          targetDir: "/Users/testuser/.dotfiles/.generated/usr-local-bin",
          binariesDir: "/Users/testuser/.dotfiles/.generated/binaries",
          toolConfigsDir: "/Users/testuser/.dotfiles/configs/tools",
        },
      },
      filePath: "/test/config.ts",
      fileSystem: memFs.fs,
      logger,
      systemInfo: mockSystemInfo,
      env: {},
    });
  });

  it("should handle absolute paths by returning them unchanged", () => {
    const result = expandToolConfigPath(toolConfigPath, "/usr/local/bin/lazygit", mockProjectConfig, mockSystemInfo);

    expect(result).toBe("/usr/local/bin/lazygit");
  });

  it("should expand home directory paths", () => {
    const result = expandToolConfigPath(
      toolConfigPath,
      "~/.config/lazygit/config.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/.config/lazygit/config.yml");
  });

  it("should resolve relative paths relative to tool config file directory", () => {
    const result = expandToolConfigPath(toolConfigPath, "./config.yml", mockProjectConfig, mockSystemInfo);

    expect(result).toBe("/Users/testuser/.dotfiles/configs/tools/config.yml");
  });

  it("should resolve relative paths without ./ prefix", () => {
    const result = expandToolConfigPath(toolConfigPath, "config.yml", mockProjectConfig, mockSystemInfo);

    expect(result).toBe("/Users/testuser/.dotfiles/configs/tools/config.yml");
  });

  it("should expand variables from yaml config paths", () => {
    const result = expandToolConfigPath(
      toolConfigPath,
      "{paths.homeDir}/.config/lazygit/config.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/.config/lazygit/config.yml");
  });

  it("should expand nested variables", () => {
    const result = expandToolConfigPath(
      toolConfigPath,
      "{paths.dotfilesDir}/configs/lazygit/config.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/.dotfiles/configs/lazygit/config.yml");
  });

  it("should handle combination of variables and relative paths", () => {
    const result = expandToolConfigPath(
      toolConfigPath,
      "{paths.binariesDir}/lazygit/lazygit",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/.dotfiles/.generated/binaries/lazygit/lazygit");
  });

  it("should expand variables then resolve relative paths", () => {
    // Test with dotfilesDir which should be an absolute path
    const result = expandToolConfigPath(
      toolConfigPath,
      "{paths.dotfilesDir}/some/relative/path.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/.dotfiles/some/relative/path.yml");
  });

  it("should expand home directory after variables", () => {
    // Use homeDir which is already a ~-expanded path
    const result = expandToolConfigPath(
      toolConfigPath,
      "{paths.homeDir}/.config/lazygit/config.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/.config/lazygit/config.yml");
  });

  it("should leave unknown variables unchanged", () => {
    const result = expandToolConfigPath(
      toolConfigPath,
      "{unknownVariable}/config.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    // Should resolve relative to config file since variable expansion failed
    expect(result).toBe("/Users/testuser/.dotfiles/configs/tools/{unknownVariable}/config.yml");
  });

  it("should handle complex nested relative paths", () => {
    const result = expandToolConfigPath(
      toolConfigPath,
      "../../../some/deep/path/config.yml",
      mockProjectConfig,
      mockSystemInfo,
    );

    expect(result).toBe("/Users/testuser/some/deep/path/config.yml");
  });
});
