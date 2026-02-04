import type { ProjectConfig } from '@dotfiles/config';
import { createProjectConfigFromObject } from '@dotfiles/config';
import type { ISystemInfo, PartialDeep } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';

/**
 * Represents a deep partial version of `ProjectConfig`, where all properties and sub-properties are optional.
 * This is useful for representing user-provided configuration fragments that will be merged with a default configuration.
 */
export type PartialProjectConfig = PartialDeep<ProjectConfig>;

/**
 * Options for {@link createMockProjectConfig}.
 */
export type CreateMockProjectConfigOptions = {
  /**
   * The partial project configuration.
   */
  config: PartialProjectConfig;
  /**
   * The path to write the config file to.
   */
  filePath: string;
  /**
   * The file system to use.
   */
  fileSystem: IFileSystem;
  /**
   * The logger to use.
   */
  logger: TsLogger;
  /**
   * System information.
   */
  systemInfo: ISystemInfo;
  /**
   * Environment variables.
   */
  env: Record<string, string | undefined>;
};

/**
 * Creates a mock `ProjectConfig` for testing purposes.
 *
 * @param options - Options for creating the mock project config.
 * @returns A promise that resolves with the `ProjectConfig` object.
 *
 * This function is a utility for creating mock project configurations in tests. It simplifies the process of
 * generating a valid config from a partial config object, making it easier to set up test preconditions
 * for modules that consume configuration.
 *
 * Most commonly used together with `createTestingDirectories` and `createMemFileSystems`.
 */
export async function createMockProjectConfig({
  config,
  filePath,
  fileSystem,
  logger,
  systemInfo,
  env,
}: CreateMockProjectConfigOptions): Promise<ProjectConfig> {
  const fullConfig = await createProjectConfigFromObject(logger, fileSystem, config, systemInfo, env, {
    userConfigPath: filePath,
  });
  return fullConfig;
}
