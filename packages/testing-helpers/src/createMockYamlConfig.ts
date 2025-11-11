import type { YamlConfig } from '@dotfiles/config';
import { createYamlConfigFromObject } from '@dotfiles/config';
import type { PartialDeep, SystemInfo } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';

/**
 * Represents a deep partial version of `YamlConfig`, where all properties and sub-properties are optional.
 * This is useful for representing user-provided configuration fragments that will be merged with a default configuration.
 */
export type PartialYamlConfig = PartialDeep<YamlConfig>;

/**
 * Options for {@link createMockYamlConfig}.
 */
export type CreateMockYamlConfigOptions = {
  /**
   * The partial YAML configuration.
   */
  config: PartialYamlConfig;
  /**
   * The path to write the YAML file to.
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
  systemInfo: SystemInfo;
  /**
   * Environment variables.
   */
  env: Record<string, string | undefined>;
};

/**
 * Creates a mock `YamlConfig` string and optionally writes it to a file.
 *
 * @param options - Options for creating the mock YAML config.
 * @returns A promise that resolves with the `YamlConfig` object.
 *
 * @testing
 * This function is a utility for creating mock YAML configuration files in tests.  It simplifies the process of
 * generating valid YAML content from a partial config object and writing it to a mock file system, making it easier to
 * set up test preconditions for modules that consume these configuration files.
 *
 * Most commonly used together with `createTestingDirectories` and `createMemFileSystems`.
 */
export async function createMockYamlConfig({
  config,
  filePath,
  fileSystem,
  logger,
  systemInfo,
  env,
}: CreateMockYamlConfigOptions): Promise<YamlConfig> {
  const fullConfig = await createYamlConfigFromObject(logger, fileSystem, config, systemInfo, env);
  const yamlString = Bun.YAML.stringify(fullConfig);
  await fileSystem.writeFile(filePath, yamlString, 'utf8');
  return fullConfig;
}
