import type { YamlConfig } from '@modules/config';
import type { ToolConfig } from '@types';
import type { IFileSystem } from '@modules/file-system';

/**
 * Options for generating the shell initialization file.
 */
export interface GenerateShellInitOptions {
  /**
   * Optional path to write the generated init file.
   * If not provided, a default path will be derived from AppConfig.
   */
  outputPath?: string;
}

/**
 * Interface for a service that generates a consolidated shell initialization file.
 */
export interface IShellInitGenerator {
  /**
   * Generates the shell initialization file based on the provided tool configurations.
   *
   * @param toolConfigs - A record of tool configurations, where keys are tool names.
   * @param options - Optional parameters for generation, like dry-run.
   * @returns A promise that resolves with the path to the generated shell init file, or `null` if not generated (e.g., `dryRun` or error).
   * @throws Error if generation fails (e.g., due to file system issues, unless in dryRun mode and an unrecoverable error occurs).
   */
  generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShellInitOptions
  ): Promise<string | null>;
}

/**
 * Constructor signature for classes implementing IShellInitGenerator.
 * This allows for dependency injection of IFileSystem and AppConfig.
 */
export interface IShellInitGeneratorConstructor {
  new (fileSystem: IFileSystem, appConfig: YamlConfig): IShellInitGenerator;
}
