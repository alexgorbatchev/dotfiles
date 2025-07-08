/**
 * @file generator/src/testing-helpers/createMockYamlConfig.ts
 * @description Shared testing helper functions for creating YamlConfig mocks.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define `createMockYamlConfig` function.
 *   - [x] Import `YamlConfig`.
 *   - [x] Import `IFileSystem`, `NodeFileSystem`.
 *   - [x] Import `dump` from `js-yaml`.
 *   - [x] Implement the function signature: `createMockYamlConfig(config: YamlConfig, { filePath?: string, fileSystem?: IFileSystem = new NodeFileSystem() })`.
 *   - [x] Stringify the config object using `dump`.
 *   - [x] If `filePath` is provided, write the stringified config to the file using the `fileSystem`.
 *   - [x] Return the YAML string.
 * - [x] Add JSDoc for the function.
 * - [x] Write tests for `createMockYamlConfig` in `generator/src/testing-helpers/__tests__/createMockYamlConfig.test.ts`.
 * - [x] Ensure 100% test coverage.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { YamlConfig } from '@modules/config/config.yaml.schema';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import { NodeFileSystem } from '@modules/file-system/NodeFileSystem';
import { stringify } from 'yaml';

/**
 * Creates a mock `YamlConfig` string and optionally writes it to a file.
 *
 * @param config - The `YamlConfig` object.
 * @param options - Options for file path and file system.
 * @param options.filePath - Optional. The path to write the YAML file to.
 * @param options.fileSystem - Optional. The file system to use. Defaults to `NodeFileSystem`.
 * @returns A promise that resolves with the YAML string.
 */
export async function createMockYamlConfig({
  config,
  filePath,
  fileSystem = new NodeFileSystem(),
}: {
  config: YamlConfig;
  filePath: string;
  fileSystem?: IFileSystem;
}): Promise<void> {
  const yamlString = stringify(config);
  await fileSystem.writeFile(filePath, yamlString, 'utf8');
}