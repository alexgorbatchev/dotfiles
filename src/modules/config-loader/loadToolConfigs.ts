import type { IFileSystem } from '@modules/file-system';
import type { ToolConfig, AsyncConfigureTool, ToolConfigContext } from '@types';
import type { YamlConfig } from '@modules/config';
import { ToolConfigBuilder } from '@modules/tool-config-builder';
import path from 'node:path';
import { type TsLogger, logs } from '@modules/logger';

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
      if (file.endsWith('.tool.ts')) {
        // Resolve to an absolute path for dynamic import
        const filePath = path.resolve(toolConfigsDir, file);
        logger.trace(logs.config.success.toolConfigLoad(filePath));

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
              logger.trace(logs.config.success.validated(filePath));
              const configureToolFn = module.default as AsyncConfigureTool;
              const builder = new ToolConfigBuilder(logger, toolNameFromFile); // Pass logger and tool name to builder
              const context = createToolConfigContext(yamlConfig, toolNameFromFile);
              await configureToolFn(builder, context);
              toolConfig = builder.build();
              logger.trace(logs.config.success.loaded(filePath, 1));
            } else {
              logger.trace(logs.config.success.validated(filePath));
              toolConfig = module.default as ToolConfig;
              // Ensure the toolConfig.name matches the filename if it's a direct object export
              if (toolConfig.name !== toolNameFromFile) {
                logger.warn(logs.config.warning.invalid('tool config object name', toolConfig.name, `filename: ${toolNameFromFile}`), filePath);
              }
            }

            // Set the config file path after building/loading
            if (toolConfig) {
              toolConfig.configFilePath = filePath;
            }

            if (toolConfig && toolConfig.name) {
              // Prefer toolConfig.name if explicitly set by builder/object, otherwise use filename-derived.
              // The builder now sets the name from the filename, so toolConfig.name should be reliable.
              toolConfigs[toolConfig.name] = toolConfig;
              logger.debug(logs.config.success.loaded(filePath, 1), toolConfig.name);
            } else if (toolConfig) {
              logger.warn(logs.config.warning.invalid('tool config', 'missing name', 'valid name property'), filePath);
            } else {
              // This case should ideally not be hit if builder.build() always returns a valid config or throws.
              logger.error(logs.config.error.parseErrors(filePath, 'ToolConfig', 'Could not derive valid configuration'));
            }
          } else {
            logger.error(logs.config.error.parseErrors(filePath, 'ToolConfig', 'no default export'));
          }
        } catch (e) {
          logger.error(logs.config.error.loadFailed(filePath, String(e)), e);
        }
      }
    }
  } catch (e) {
    logger.error(logs.fs.error.readFailed(toolConfigsDir, String(e)), e);
    // If the directory itself can't be read, return empty or rethrow depending on desired strictness
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
        const configureToolFn = module.default as AsyncConfigureTool;
        const builder = new ToolConfigBuilder(logger, toolNameFromFile); // Pass logger and tool name to builder
        const context = createToolConfigContext(yamlConfig, toolNameFromFile);
        await configureToolFn(builder, context);
        toolConfig = builder.build();
        logger.trace(logs.config.success.loaded(filePath, 1));
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
        logger.warn(logs.config.warning.invalid('single tool config name', toolConfig.name, `requested: ${toolName}`), filePath);
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