import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type {
  AsyncConfigureTool,
  AsyncConfigureToolWithReturn,
  ToolConfig,
  ToolConfigContext,
} from '@dotfiles/schemas';
import { toolConfigSchema } from '@dotfiles/schemas';
import type { YamlConfig } from '@dotfiles/schemas/config';
import { ToolConfigBuilder } from '@dotfiles/tool-config-builder';
import { configLoaderLogMessages } from './log-messages';

/**
 * Validates a tool configuration with Zod schema and logs errors if validation fails.
 * @param config The configuration to validate
 * @param logger The logger instance
 * @param filePath The file path for error reporting
 * @param context Description of what's being validated
 * @returns The validated config or null if validation failed
 */
function validateToolConfig(config: unknown, logger: TsLogger, filePath: string, context: string): ToolConfig | null {
  const validationResult = toolConfigSchema.safeParse(config);
  if (validationResult.success) {
    return validationResult.data;
  }

  logger.error(configLoaderLogMessages.configurationParseError(filePath, 'ToolConfig', `${context} validation failed`));
  logger.zodErrors(validationResult.error);
  return null;
}

/**
 * Processes a function-based tool configuration export.
 * @param configureToolFn The configuration function
 * @param logger The logger instance
 * @param toolName The tool name
 * @param filePath The file path
 * @param yamlConfig The YAML configuration
 * @returns The processed tool config or null
 */
async function processFunctionExport(
  configureToolFn: AsyncConfigureTool | AsyncConfigureToolWithReturn,
  logger: TsLogger,
  toolName: string,
  filePath: string,
  yamlConfig: YamlConfig
): Promise<ToolConfig | null> {
  const builder = new ToolConfigBuilder(logger, toolName);
  const context = createToolConfigContext(yamlConfig, toolName, logger);
  const result = await configureToolFn(builder, context);

  // Check if the function returned a ToolConfig object
  if (result && typeof result === 'object' && 'name' in result) {
    const validatedConfig = validateToolConfig(result, logger, filePath, 'Function return');
    if (validatedConfig) {
      logger.trace(configLoaderLogMessages.configurationLoaded(filePath, 1));
    }
    return validatedConfig;
  }

  // Function didn't return an object, use builder pattern
  const builtConfig = builder.build();
  const validatedConfig = validateToolConfig(builtConfig, logger, filePath, 'Builder');
  if (validatedConfig) {
    logger.trace(configLoaderLogMessages.configurationLoaded(filePath, 1));
  }
  return validatedConfig;
}

/**
 * Processes a direct object export tool configuration.
 * @param exportedObject The exported object
 * @param logger The logger instance
 * @param filePath The file path
 * @param toolName The expected tool name
 * @returns The processed tool config or null
 */
function processDirectExport(
  exportedObject: unknown,
  logger: TsLogger,
  filePath: string,
  toolName: string
): ToolConfig | null {
  const validatedConfig = validateToolConfig(exportedObject, logger, filePath, 'Direct export');
  if (validatedConfig) {
    logger.trace(configLoaderLogMessages.configurationValidated(filePath));
    // Ensure the toolConfig.name matches the filename if it's a direct object export
    if (validatedConfig.name !== toolName) {
      logger.warn(
        configLoaderLogMessages.configurationFieldInvalid(
          'tool config object name',
          validatedConfig.name,
          `filename: ${toolName}`
        ),
        filePath
      );
    }
  }
  return validatedConfig;
}

/**
 * Creates a ToolConfigContext from YamlConfig for the specified tool.
 * @param yamlConfig The application configuration containing path information.
 * @param currentToolName The name of the tool currently being configured.
 * @param logger The logger instance for structured logging.
 * @returns A ToolConfigContext with all necessary path information.
 */
function createToolConfigContext(yamlConfig: YamlConfig, currentToolName: string, logger: TsLogger): ToolConfigContext {
  const getToolDir = (toolName: string): string => {
    return path.join(yamlConfig.paths.binariesDir, toolName);
  };

  return {
    toolName: currentToolName,
    toolDir: getToolDir(currentToolName),
    getToolDir,
    homeDir: yamlConfig.paths.homeDir,
    binDir: yamlConfig.paths.targetDir,
    shellScriptsDir: yamlConfig.paths.shellScriptsDir,
    dotfilesDir: yamlConfig.paths.dotfilesDir,
    generatedDir: yamlConfig.paths.generatedDir,
    appConfig: yamlConfig,
    logger: logger.getSubLogger({ name: `config-${currentToolName}` }),
  };
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
      logger.error(configLoaderLogMessages.configurationParseError(filePath, 'ToolConfig', 'no default export'));
      return null;
    }

    let toolConfig: ToolConfig | null;

    if (typeof module.default === 'function') {
      logger.trace(configLoaderLogMessages.configurationValidated(filePath));
      const configureToolFn = module.default as AsyncConfigureTool | AsyncConfigureToolWithReturn;
      toolConfig = await processFunctionExport(configureToolFn, logger, toolName, filePath, yamlConfig);
    } else {
      toolConfig = processDirectExport(module.default, logger, filePath, toolName);
    }

    // Set the config file path after building/loading
    if (toolConfig) {
      toolConfig.configFilePath = filePath;
    }

    return toolConfig;
  } catch (e) {
    logger.error(configLoaderLogMessages.configurationLoadFailed(path.relative(yamlConfig.configFileDir, filePath), e));
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
    logger.debug(configLoaderLogMessages.configurationLoaded(filePath, 1), toolConfig.name);
  } else if (toolConfig) {
    logger.warn(
      configLoaderLogMessages.configurationFieldInvalid('tool config', 'missing name', 'valid name property'),
      filePath
    );
  } else {
    logger.error(
      configLoaderLogMessages.configurationParseError(filePath, 'ToolConfig', 'Could not derive valid configuration')
    );
  }
}

/**
 * Recursively scans a directory for .tool.ts files.
 */
async function scanDirectoryForToolFiles(
  fs: IFileSystem,
  dirPath: string,
  logger: TsLogger
): Promise<{ filePath: string; toolName: string }[]> {
  const results: { filePath: string; toolName: string }[] = [];

  try {
    const entries = await fs.readdir(dirPath);

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);

      try {
        const stat = await fs.stat(entryPath);

        if (stat.isDirectory()) {
          // Recursively scan subdirectories
          const subResults = await scanDirectoryForToolFiles(fs, entryPath, logger);
          results.push(...subResults);
        } else if (entry.endsWith('.tool.ts')) {
          // Found a .tool.ts file
          const toolName = path.basename(entry, '.tool.ts');
          results.push({
            filePath: entryPath,
            toolName,
          });
        }
      } catch (error) {
        logger.debug(configLoaderLogMessages.fsReadFailed(entryPath, (error as Error).message));
      }
    }
  } catch (error) {
    logger.debug(configLoaderLogMessages.fsReadFailed(dirPath, (error as Error).message));
  }

  return results;
}

/**
 * Loads tool configurations from a directory, optionally filtering by tool name.
 * @param parentLogger The parent logger instance.
 * @param toolConfigsDir The directory containing .tool.ts files.
 * @param fs The file system implementation.
 * @param yamlConfig The YAML configuration.
 * @param toolName Optional tool name to load. If not provided, loads all tools.
 * @returns A record of tool configurations.
 */
export async function loadToolConfigs(
  parentLogger: TsLogger,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig,
  toolName?: string
): Promise<Record<string, ToolConfig>> {
  const logger = parentLogger.getSubLogger({ name: 'loadToolConfigs' });
  const toolConfigs: Record<string, ToolConfig> = {};

  if (toolName) {
    logger.debug(configLoaderLogMessages.singleToolConfigLoadingStarted(toolName, toolConfigsDir));
  } else {
    logger.debug(configLoaderLogMessages.toolConfigLoadingStarted(toolConfigsDir));
  }

  try {
    if (!(await fs.exists(toolConfigsDir))) {
      logger.debug(configLoaderLogMessages.fsItemNotFound('tool configs directory', toolConfigsDir));
      return {};
    }

    const files = await fs.readdir(toolConfigsDir);
    logger.trace(configLoaderLogMessages.toolConfigDirectoryScan(toolConfigsDir), files);

    // Recursively scan for all .tool.ts files
    const allToolFiles = await scanDirectoryForToolFiles(fs, toolConfigsDir, logger);

    // Filter files if a specific tool name is requested
    const filesToProcess = toolName
      ? allToolFiles.filter(({ toolName: foundToolName }) => foundToolName === toolName)
      : allToolFiles;

    for (const { filePath, toolName: discoveredToolName } of filesToProcess) {
      logger.trace(configLoaderLogMessages.toolConfigEntryLoad(path.relative(yamlConfig.configFileDir, filePath)));

      const toolConfig = await loadToolConfigFromModule(logger, filePath, discoveredToolName, yamlConfig);
      validateAndStoreToolConfig(logger, toolConfig, filePath, toolConfigs);
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error(configLoaderLogMessages.fsReadFailed(toolConfigsDir, errorMessage));
    return {};
  }

  const configCount = Object.keys(toolConfigs).length;
  if (toolName) {
    logger.debug(
      configCount > 0
        ? configLoaderLogMessages.configurationLoaded('single tool config', 1)
        : configLoaderLogMessages.fsItemNotFound('Tool config', toolName)
    );
  } else {
    logger.debug(configLoaderLogMessages.toolConfigLoadingCompleted(), configCount);
  }

  return toolConfigs;
}

/**
 * Loads a single tool configuration for a specific tool name.
 * @param parentLogger The parent logger instance.
 * @param toolName The name of the tool to load.
 * @param toolConfigsDir The directory containing .tool.ts files.
 * @param fs The file system implementation.
 * @param yamlConfig The YAML configuration.
 * @returns The tool configuration or undefined if not found.
 */
export async function loadSingleToolConfig(
  parentLogger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<ToolConfig | undefined> {
  const configs = await loadToolConfigs(parentLogger, toolConfigsDir, fs, yamlConfig, toolName);
  return configs[toolName];
}
