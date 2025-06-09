/**
 * @file generator/src/modules/config-loader/toolConfigLoader.ts
 * @description Loads, parses, and validates tool configurations from *.tool.ts files.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `generator/src/types.ts` (for AppConfig, ToolConfig interfaces)
 * - `generator/src/modules/config/toolConfigSchema.ts` (for ToolConfigSchema)
 * - `generator/src/modules/file-system/IFileSystem.ts`
 * - `.clinerules`
 *
 * ### Tasks:
 * - [x] Define `loadToolConfigs` async function.
 *   - [x] Accept `appConfig: AppConfig` and `fs: IFileSystem` as parameters.
 *   - [x] Return `Promise<Record<string, ToolConfig>>`.
 *   - [x] Get `toolConfigsDir` from `appConfig`.
 *   - [x] Use `fs.readdir` to list files in `toolConfigsDir`.
 *   - [x] Filter for files ending with `.tool.ts`.
 *   - [x] For each matching file:
 *     - [x] Construct absolute file path.
 *     - [x] Dynamically `import()` the module.
 *     - [x] Get the `default` export.
 *     - [x] Check if the `defaultExport` is a function (assumed `AsyncConfigureTool`).
 *       - [x] If it is a function:
 *         - [x] Instantiate `ToolConfigBuilder`.
 *         - [x] Call the exported function with the builder and `appConfig`.
 *         - [x] `await` the result to get the `ToolConfig` object.
 *       - [x] If the `defaultExport` is an object, use it directly.
 *     - [x] Validate the resolved `ToolConfig` object against `ToolConfigSchema.safeParse()`.
 *     - [x] If valid, add to result using `ToolConfig.name` as key.
 *     - [x] Log errors for file reading, import, or validation issues and skip invalid configs.
 * - [x] Export `loadToolConfigs`.
 * - [x] Add `createLogger` for logging.
 * - [ ] Write tests for the module.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { resolve as resolvePath } from 'path'; // Removed unused join, basename, extname
import type { AppConfig, ToolConfig } from '@types';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import { ToolConfigSchema } from '../config/toolConfigSchema';
import { ToolConfigBuilder } from '../tool-config-builder/toolConfigBuilder';
import { createLogger } from '@modules/logger';

const log = createLogger('toolConfigLoader');

/**
 * Loads, parses, and validates all tool configurations from *.tool.ts files
 * found in the specified directory.
 *
 * @param appConfig The application configuration.
 * @param fs The file system interface to use.
 * @returns A promise that resolves to a record of tool configurations,
 *          where keys are tool names and values are valid ToolConfig objects.
 */
export async function loadToolConfigs(
  appConfig: AppConfig,
  fs: IFileSystem
): Promise<Record<string, ToolConfig>> {
  log('loadToolConfigs: Starting to load tool configurations.');
  const toolConfigs: Record<string, ToolConfig> = {};
  const { toolConfigsDir } = appConfig;

  let filesInDir: string[];
  try {
    filesInDir = await fs.readdir(toolConfigsDir);
    log(
      'loadToolConfigs: Successfully read directory: %s, files found: %d',
      toolConfigsDir,
      filesInDir.length
    );
  } catch (error) {
    log('loadToolConfigs: Error reading tool configs directory %s: %O', toolConfigsDir, error);
    // If the directory doesn't exist or is unreadable, return empty.
    // This is a common scenario if no custom tools are defined.
    return {};
  }

  const toolFiles = filesInDir.filter((file) => file.endsWith('.tool.ts'));
  log('loadToolConfigs: Filtered for .tool.ts files, found: %d', toolFiles.length);

  if (toolFiles.length === 0) {
    log('loadToolConfigs: No .tool.ts files found in %s.', toolConfigsDir);
  }

  for (const fileName of toolFiles) {
    const filePath = resolvePath(toolConfigsDir, fileName); // Ensure absolute path for dynamic import
    log('loadToolConfigs: Processing tool file: %s', filePath);

    try {
      // Dynamically import the TypeScript module.
      // Note: Dynamic import paths are relative to the current file if not absolute.
      // Or, they can be absolute paths. Here, we construct an absolute path.
      const module = await import(filePath);

      // Get the default export.
      const defaultExport = module.default;

      if (!defaultExport) {
        log('loadToolConfigs: File %s does not have a default export. Skipping.', filePath);
        continue;
      }

      let resolvedConfig: ToolConfig | undefined;

      if (typeof defaultExport === 'function') {
        log('loadToolConfigs: File %s exports a function. Assuming AsyncConfigureTool.', filePath);
        try {
          const toolName = fileName.replace(/\.tool\.ts$/, '');
          const builder = new ToolConfigBuilder(toolName);
          // The defaultExport is an AsyncConfigureTool, which is (builder: ToolConfigBuilder, appConfig?: AppConfig) => Promise<void>
          // It configures the builder. We then call build() on the builder.
          await defaultExport(builder, appConfig); // This populates the builder
          resolvedConfig = builder.build(); // Now get the config from the builder
          log('loadToolConfigs: Successfully executed AsyncConfigureTool from %s.', filePath);
        } catch (funcError) {
          log(
            'loadToolConfigs: Error executing AsyncConfigureTool function from file %s: %O. Skipping.',
            filePath,
            funcError
          );
          continue;
        }
      } else {
        log('loadToolConfigs: File %s exports an object. Using directly.', filePath);
        resolvedConfig = defaultExport as ToolConfig; // Cast, will be validated next
      }

      if (!resolvedConfig) {
        log('loadToolConfigs: Could not resolve a config from %s. Skipping.', filePath);
        continue;
      }

      // Validate the resolved config object against the Zod schema.
      const validationResult = ToolConfigSchema.safeParse(resolvedConfig);

      if (validationResult.success) {
        const validConfig = validationResult.data;
        if (toolConfigs[validConfig.name]) {
          log(
            'loadToolConfigs: Duplicate tool name "%s" found from file %s. It will overwrite the previous one from file %s.',
            validConfig.name,
            filePath,
            // We don't store the original file path, so this part of the log is a bit tricky.
            // For now, just indicate an overwrite.
            toolConfigs[validConfig.name] ? 'another file' : 'unknown source'
          );
        }
        toolConfigs[validConfig.name] = validConfig;
        log(
          'loadToolConfigs: Successfully loaded and validated tool config: %s from %s',
          validConfig.name,
          filePath
        );
      } else {
        log(
          'loadToolConfigs: Invalid tool configuration in file %s. Errors: %O. Skipping.',
          filePath,
          validationResult.error.format()
        );
      }
    } catch (error) {
      log('loadToolConfigs: Error processing tool file %s: %O. Skipping.', filePath, error);
    }
  }

  log(
    'loadToolConfigs: Finished loading tool configurations. Total valid tools loaded: %d',
    Object.keys(toolConfigs).length
  );
  return toolConfigs;
}
