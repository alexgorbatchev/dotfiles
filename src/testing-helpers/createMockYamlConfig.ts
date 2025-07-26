import type { YamlConfig } from '@modules/config';
import { createYamlConfigFromObject } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { SystemInfo } from '@types';
import { stringify } from 'yaml';

/**
 * Represents a deep partial version of `YamlConfig`, where all properties and sub-properties are optional.
 * This is useful for representing user-provided configuration fragments that will be merged with a default configuration.
 */
export type PartialYamlConfig = {
  [P in keyof YamlConfig]?: YamlConfig[P] extends unknown[]
    ? PartialYamlConfig[]
    : YamlConfig[P] extends object
    ? Partial<YamlConfig[P]>
    : YamlConfig[P];
};

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
 * This function is a utility for creating mock YAML configuration files in tests.
 * It simplifies the process of generating valid YAML content from a partial
 * config object and writing it to a mock file system, making it easier to
 * set up test preconditions for modules that consume these configuration files.
 */
export async function createMockYamlConfig({
  config,
  filePath,
  fileSystem,
  systemInfo,
  env,
}: CreateMockYamlConfigOptions): Promise<YamlConfig> {
  const fullConfig = await createYamlConfigFromObject(fileSystem, config, systemInfo, env);
  const yamlString = stringify(fullConfig);
  await fileSystem.writeFile(filePath, yamlString, 'utf8');
  return fullConfig;
}