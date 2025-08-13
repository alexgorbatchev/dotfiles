import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import { logs, type TsLogger } from '@modules/logger';
import { ToolConfigBuilder } from '@modules/tool-config-builder';
import type { AsyncConfigureTool, AsyncConfigureToolWithReturn, ToolConfig, ToolConfigContext } from '@types';
import { toolConfigSchema } from './toolConfig.schema';

/**
 * Creates a ToolConfigContext from YamlConfig for the specified tool.
 * @param yamlConfig The application configuration containing path information.
 * @param currentToolName The name of the tool currently being configured.
 * @returns A ToolConfigContext with all necessary path information.
 */
function createToolConfigContext(yamlConfig: YamlConfig, currentToolName: string): ToolConfigContext {
  const getToolDir = (toolName: string): string => {
    return path.join(yamlConfig.paths.binariesDir, toolName);
  };

  return {
    toolDir: getToolDir(currentToolName),
    getToolDir,
    homeDir: yamlConfig.paths.homeDir,
    binDir: yamlConfig.paths.targetDir,
    shellScriptsDir: yamlConfig.paths.shellScriptsDir,
    dotfilesDir: yamlConfig.paths.dotfilesDir,
    generatedDir: yamlConfig.paths.generatedDir,
  };
}

function determineToolFilePath(toolConfigsDir: string, file: string): { filePath: string; toolName: string } | null {
  if (file.endsWith('.tool.ts')) {
    // Direct .tool.ts file (flat structure like configs/tools/)
    return {
      filePath: path.resolve(toolConfigsDir, file),
      toolName: path.basename(file, '.tool.ts'),
    };
  }

  // Check if it's a directory that might contain a .tool.ts file (nested structure like configs-migrated/)
  const dirPath = path.resolve(toolConfigsDir, file);
  const expectedToolFile = path.join(dirPath, `${file}.tool.ts`);

  return {
    filePath: expectedToolFile,
    toolName: file,
  };
}

async function validateDirectoryStructure(fs: IFileSystem, toolConfigsDir: string, file: string): Promise<boolean> {
  if (file.endsWith('.tool.ts')) {
    return true; // Direct .tool.ts files are always valid
  }

  const dirPath = path.resolve(toolConfigsDir, file);
  try {
    const stat = await fs.stat(dirPath);
    if (stat.isDirectory()) {
      const expectedToolFile = path.join(dirPath, `${file}.tool.ts`);
      return await fs.exists(expectedToolFile);
    }
    return false; // Not a directory, skip non-.tool.ts files
  } catch {
    return false; // Skip if we can't stat the item
  }
}

async function loadToolConfigFromModule(
  logger: TsLogger,
  filePath: string,
  toolName: string,
  yamlConfig: YamlConfig
): Promise<ToolConfig | null> {
  try {
    const module = await import(filePath);
    if (!module.default) {
      logger.error(logs.config.error.parseErrors(filePath, 'ToolConfig', 'no default export'));
      return null;
    }

    let toolConfig: ToolConfig | undefined;

    if (typeof module.default === 'function') {
      logger.trace(logs.config.success.validated(filePath));
      const configureToolFn = module.default as AsyncConfigureTool | AsyncConfigureToolWithReturn;
      const builder = new ToolConfigBuilder(logger, toolName);
      const context = createToolConfigContext(yamlConfig, toolName);
      const result = await configureToolFn(builder, context);

      // Check if the function returned a ToolConfig object
      if (result && typeof result === 'object' && 'name' in result) {
        // Validate the returned object with Zod schema
        const validationResult = toolConfigSchema.safeParse(result);
        if (validationResult.success) {
          // Cast back to the proper TypeScript type since Zod validation passed
          toolConfig = result as ToolConfig;
          logger.trace(logs.config.success.loaded(filePath, 1));
        } else {
          logger.error(
            logs.config.error.parseErrors(
              filePath,
              'ToolConfig',
              `Validation failed: ${validationResult.error.message}`
            )
          );
          return null;
        }
      } else {
        // Function didn't return an object, use builder pattern
        toolConfig = builder.build();
        logger.trace(logs.config.success.loaded(filePath, 1));
      }
    } else {
      logger.trace(logs.config.success.validated(filePath));
      toolConfig = module.default as ToolConfig;
      // Ensure the toolConfig.name matches the filename if it's a direct object export
      if (toolConfig.name !== toolName) {
        logger.warn(
          logs.config.warning.invalid('tool config object name', toolConfig.name, `filename: ${toolName}`),
          filePath
        );
      }
    }

    // Set the config file path after building/loading
    if (toolConfig) {
      toolConfig.configFilePath = filePath;
    }

    return toolConfig || null;
  } catch (e) {
    logger.error(logs.config.error.loadFailed(filePath, String(e)), e);
    return null;
  }
}

function validateAndStoreToolConfig(
  logger: TsLogger,
  toolConfig: ToolConfig | null,
  filePath: string,
  toolConfigs: Record<string, ToolConfig>
): void {
  if (toolConfig?.name) {
    toolConfigs[toolConfig.name] = toolConfig;
    logger.debug(logs.config.success.loaded(filePath, 1), toolConfig.name);
  } else if (toolConfig) {
    logger.warn(logs.config.warning.invalid('tool config', 'missing name', 'valid name property'), filePath);
  } else {
    logger.error(logs.config.error.parseErrors(filePath, 'ToolConfig', 'Could not derive valid configuration'));
  }
}

/**
 * Loads all tool configurations from *.tool.ts files in a given directory.
 * Uses dynamic import() to load the TypeScript modules.
 * @param toolConfigsDir The directory containing .tool.ts files.
 * @param fs The file system implementation to use for reading directory and checking file existence.
 * @param yamlConfig The application configuration containing path information.
 * @returns A promise that resolves to a record of tool configurations, keyed by tool name.
 */
export async function loadToolConfigsFromDirectory(
  parentLogger: TsLogger,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<Record<string, ToolConfig>> {
  const logger = parentLogger.getSubLogger({ name: 'loadToolConfigsFromDirectory' });
  const toolConfigs: Record<string, ToolConfig> = {};
  logger.debug(logs.config.success.toolConfigLoading(toolConfigsDir));

  try {
    if (!(await fs.exists(toolConfigsDir))) {
      logger.debug(logs.fs.error.notFound('tool configs directory', toolConfigsDir));
      return {}; // Return empty if directory doesn't exist
    }

    const files = await fs.readdir(toolConfigsDir);
    logger.trace(logs.config.success.directoryScan(toolConfigsDir), files);

    for (const file of files) {
      // Validate directory structure first
      if (!(await validateDirectoryStructure(fs, toolConfigsDir, file))) {
        continue; // Skip invalid files/directories
      }

      const fileInfo = determineToolFilePath(toolConfigsDir, file);
      if (!fileInfo) {
        continue;
      }

      const { filePath, toolName } = fileInfo;
      logger.trace(logs.config.success.toolConfigLoad(filePath));

      const toolConfig = await loadToolConfigFromModule(logger, filePath, toolName, yamlConfig);
      validateAndStoreToolConfig(logger, toolConfig, filePath, toolConfigs);
    }
  } catch (e) {
    logger.error(logs.fs.error.readFailed(toolConfigsDir, String(e)), e);
    return {};
  }

  logger.debug(logs.general.success.completed('tool config loading'), Object.keys(toolConfigs).length);
  return toolConfigs;
}

/**
 * Loads a single tool configuration for a specific tool name.
 * @param toolName The name of the tool to load.
 * @param toolConfigsDir The directory containing .tool.ts files.
 * @param fs The file system implementation (primarily for fs.exists check).
 * @param yamlConfig The application configuration containing path information.
 * @returns A promise that resolves to the ToolConfig if found, otherwise undefined.
 */
export async function loadSingleToolConfig(
  parentLogger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<ToolConfig | undefined> {
  const logger = parentLogger.getSubLogger({ name: 'loadSingleToolConfig' });
  logger.debug(logs.config.success.singleToolConfigLoad(toolName, toolConfigsDir));
  const toolFileName = `${toolName}.tool.ts`;
  const filePath = path.resolve(toolConfigsDir, toolFileName); // Absolute path for import

  try {
    // Check existence using the provided fs. This is useful if fs is MemFileSystem
    // and we want to ensure it's aware of the file before attempting import.
    if (!(await fs.exists(filePath))) {
      logger.debug(logs.fs.error.notFound('Tool config file', filePath), fs.constructor.name, filePath);
      return undefined;
    }

    // Dynamic import() will use the host's file system.
    // This relies on filePath being an actual file on disk.
    const module = await import(filePath);
    if (module.default) {
      let toolConfig: ToolConfig | undefined;
      const toolNameFromFile = path.basename(filePath, '.tool.ts');

      if (typeof module.default === 'function') {
        logger.trace(logs.config.success.validated(filePath));
        const configureToolFn = module.default as AsyncConfigureTool | AsyncConfigureToolWithReturn;
        const builder = new ToolConfigBuilder(logger, toolNameFromFile); // Pass logger and tool name to builder
        const context = createToolConfigContext(yamlConfig, toolNameFromFile);
        const result = await configureToolFn(builder, context);

        // Check if the function returned a ToolConfig object
        if (result && typeof result === 'object' && 'name' in result) {
          // Validate the returned object with Zod schema
          const validationResult = toolConfigSchema.safeParse(result);
          if (validationResult.success) {
            // Cast back to the proper TypeScript type since Zod validation passed
            toolConfig = result as ToolConfig;
            logger.trace(logs.config.success.loaded(filePath, 1));
          } else {
            logger.error(
              logs.config.error.parseErrors(
                filePath,
                'ToolConfig',
                `Validation failed: ${validationResult.error.message}`
              )
            );
            return undefined;
          }
        } else {
          // Function didn't return an object, use builder pattern
          toolConfig = builder.build();
          logger.trace(logs.config.success.loaded(filePath, 1));
        }
      } else {
        logger.trace(logs.config.success.validated(filePath));
        toolConfig = module.default as ToolConfig;
      }

      // Set the config file path after building/loading
      if (toolConfig) {
        toolConfig.configFilePath = filePath;
      }

      if (toolConfig && toolConfig.name === toolName) {
        logger.debug(logs.config.success.loaded(filePath, 1), toolConfig.name);
        return toolConfig;
      } else if (toolConfig) {
        logger.warn(
          logs.config.warning.invalid('single tool config name', toolConfig.name, `requested: ${toolName}`),
          filePath
        );
        return undefined; // Strict: only return if names match
      }
    }
    logger.error(logs.config.error.parseErrors(filePath, 'ToolConfig', 'no default export or failed to process'));
    return undefined;
  } catch (e) {
    logger.error(logs.config.error.loadFailed(filePath, String(e)), e);
    return undefined;
  }
}
