import type { IFileSystem } from '@modules/file-system';
import type { ToolConfig, AsyncConfigureTool } from '@types';
import { ToolConfigBuilder } from '@modules/tool-config-builder';
import path from 'node:path';
import { type TsLogger } from '@modules/logger';

/**
 * Loads all tool configurations from *.tool.ts files in a given directory.
 * Uses dynamic import() to load the TypeScript modules.
 * @param toolConfigsDir The directory containing .tool.ts files.
 * @param fs The file system implementation to use for reading directory and checking file existence.
 * @returns A promise that resolves to a record of tool configurations, keyed by tool name.
 */
export async function loadToolConfigsFromDirectory(
  parentLogger: TsLogger,
  toolConfigsDir: string,
  fs: IFileSystem
): Promise<Record<string, ToolConfig>> {
  const logger = parentLogger.getSubLogger({ name: 'loadToolConfigsFromDirectory' });
  const toolConfigs: Record<string, ToolConfig> = {};
  logger.debug('Loading tool configs from directory: %s using FS: %s', toolConfigsDir, fs.constructor.name);

  try {
    if (!(await fs.exists(toolConfigsDir))) {
      logger.debug('Tool configs directory does not exist: %s', toolConfigsDir);
      return {}; // Return empty if directory doesn't exist
    }

    const files = await fs.readdir(toolConfigsDir);
    logger.debug('Files in toolConfigsDir "%s": %o', toolConfigsDir, files);

    for (const file of files) {
      if (file.endsWith('.tool.ts')) {
        // Resolve to an absolute path for dynamic import
        const filePath = path.resolve(toolConfigsDir, file);
        logger.debug('Attempting to load tool config from: %s', filePath);

        try {
          // While fs.exists(filePath) could be checked here using the passed `fs`,
          // dynamic import() will ultimately rely on the host file system.
          // In dry-run scenarios, setupServices ensures these files exist on disk
          // and MemFileSystem is populated with their content using these same absolute paths.
          // So, import(filePath) should work.

          const module = await import(filePath);
          if (module.default) {
            let toolConfig: ToolConfig | undefined;
            const toolNameFromFile = path.basename(file, '.tool.ts');

            if (typeof module.default === 'function') {
              logger.debug('Default export from %s is a function. Assuming AsyncConfigureTool.', filePath);
              const configureToolFn = module.default as AsyncConfigureTool;
              const builder = new ToolConfigBuilder(logger, toolNameFromFile); // Pass logger and tool name to builder
              await configureToolFn(builder);
              toolConfig = builder.build();
              logger.debug('Built ToolConfig for "%s" from AsyncConfigureTool function.', toolConfig.name);
            } else {
              logger.debug('Default export from %s is an object. Assuming direct ToolConfig.', filePath);
              toolConfig = module.default as ToolConfig;
              // Ensure the toolConfig.name matches the filename if it's a direct object export
              if (toolConfig.name !== toolNameFromFile) {
                logger.debug(
                  'Warning: Tool config object from %s has name "%s" but filename implies "%s". Using name from object: "%s".',
                  filePath,
                  toolConfig.name,
                  toolNameFromFile,
                  toolConfig.name
                );
                 console.warn(
                  `Warning: Tool config object from ${filePath} has name "${toolConfig.name}" but filename implies "${toolNameFromFile}". Using name from object: "${toolConfig.name}".`
                );
              }
            }

            if (toolConfig && toolConfig.name) {
              // Prefer toolConfig.name if explicitly set by builder/object, otherwise use filename-derived.
              // The builder now sets the name from the filename, so toolConfig.name should be reliable.
              toolConfigs[toolConfig.name] = toolConfig;
              logger.debug('Successfully loaded tool config: %s from %s', toolConfig.name, filePath);
            } else if (toolConfig) {
              logger.debug('Warning: Tool config from %s is missing a "name" property after processing.', filePath);
              console.warn(`Warning: Tool config from ${filePath} is missing a "name" property after processing.`);
            } else {
              // This case should ideally not be hit if builder.build() always returns a valid config or throws.
              logger.debug('Warning: Could not derive a valid ToolConfig from %s.', filePath);
              console.warn(`Warning: Could not derive a valid ToolConfig from ${filePath}.`);
            }
          } else {
            logger.debug('Warning: Tool config from %s has no default export.', filePath);
            console.warn(`Warning: Tool config from ${filePath} has no default export.`);
          }
        } catch (e) {
          logger.debug('Error loading tool config from %s: %O', filePath, e);
          // Log the error but continue processing other files
          console.error(`Error loading tool configuration from ${filePath}:`, e);
        }
      }
    }
  } catch (e) {
    logger.debug('Error reading tool configs directory %s: %O', toolConfigsDir, e);
    console.error(`Error reading tool configs directory ${toolConfigsDir}:`, e);
    // If the directory itself can't be read, return empty or rethrow depending on desired strictness
    return {};
  }
  logger.debug('Finished loading tool configs. Found: %o', Object.keys(toolConfigs));
  return toolConfigs;
}

/**
 * Loads a single tool configuration for a specific tool name.
 * @param toolName The name of the tool to load.
 * @param toolConfigsDir The directory containing .tool.ts files.
 * @param fs The file system implementation (primarily for fs.exists check).
 * @returns A promise that resolves to the ToolConfig if found, otherwise undefined.
 */
export async function loadSingleToolConfig(
  parentLogger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem
): Promise<ToolConfig | undefined> {
  const logger = parentLogger.getSubLogger({ name: 'loadSingleToolConfig' });
  logger.debug('Loading single tool config: "%s" from directory: %s', toolName, toolConfigsDir);
  const toolFileName = `${toolName}.tool.ts`;
  const filePath = path.resolve(toolConfigsDir, toolFileName); // Absolute path for import

  try {
    // Check existence using the provided fs. This is useful if fs is MemFileSystem
    // and we want to ensure it's aware of the file before attempting import.
    if (!(await fs.exists(filePath))) {
      logger.debug('Tool config file does not exist via %s: %s', fs.constructor.name, filePath);
      return undefined;
    }

    // Dynamic import() will use the host's file system.
    // This relies on filePath being an actual file on disk.
    const module = await import(filePath);
    if (module.default) {
      let toolConfig: ToolConfig | undefined;
      const toolNameFromFile = path.basename(filePath, '.tool.ts');

      if (typeof module.default === 'function') {
        logger.debug('Default export from %s is a function. Assuming AsyncConfigureTool for single load.', filePath);
        const configureToolFn = module.default as AsyncConfigureTool;
        const builder = new ToolConfigBuilder(logger, toolNameFromFile); // Pass logger and tool name to builder
        await configureToolFn(builder);
        toolConfig = builder.build();
        logger.debug('Built ToolConfig for "%s" from AsyncConfigureTool function (single load).', toolConfig.name);
      } else {
        logger.debug('Default export from %s is an object. Assuming direct ToolConfig for single load.', filePath);
        toolConfig = module.default as ToolConfig;
      }

      if (toolConfig && toolConfig.name === toolName) {
        logger.debug('Successfully loaded single tool config: %s from %s', toolConfig.name, filePath);
        return toolConfig;
      } else if (toolConfig) {
        logger.debug(
          'Warning: Single tool config loaded from %s has name "%s" but tool "%s" was requested. Mismatch or build error.',
          filePath,
          toolConfig.name,
          toolName
        );
        console.warn(
          `Warning: Tool config loaded from ${filePath} (name: "${toolConfig.name}") does not match requested tool "${toolName}".`
        );
        return undefined; // Strict: only return if names match
      }
    }
    logger.debug('Warning: Tool config from %s has no default export or failed to process.', filePath);
    console.warn(`Warning: Tool config from ${filePath} has no default export or failed to process.`);
    return undefined;
  } catch (e) {
    logger.debug('Error loading single tool config "%s" from %s: %O', toolName, filePath, e);
    console.error(`Error loading single tool configuration "${toolName}" from ${filePath}:`, e);
    return undefined;
  }
}