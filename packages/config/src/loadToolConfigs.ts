import type {
  AsyncConfigureTool,
  AsyncConfigureToolWithReturn,
  ISystemInfo,
  ProjectConfig,
  ToolConfig,
} from '@dotfiles/core';
import { createToolConfigContext } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { createInstallFunction } from '@dotfiles/tool-config-builder';
import path from 'node:path';
import { messages } from './log-messages';

interface IToolConfigModule {
  default?: unknown;
}

function isToolConfig(config: unknown): config is ToolConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  return 'name' in config;
}

function isConfigureToolFunction(
  exportedValue: unknown,
): exportedValue is AsyncConfigureTool | AsyncConfigureToolWithReturn {
  return typeof exportedValue === 'function';
}

/**
 * Validates a tool configuration has the required shape.
 *
 * Performs basic structural validation to ensure the config object has a name property.
 * Full schema validation occurs at install time via InstallerPluginRegistry, which has
 * access to all plugin schemas. This approach allows config loading to remain decoupled
 * from the plugin system while still ensuring type safety through:
 * 1. TypeScript compile-time validation via the builder pattern
 * 2. Runtime schema validation at install time via the registry
 *
 * @param config - The configuration object to validate.
 * @returns The validated configuration object, or null if basic validation fails.
 */
function validateToolConfig(config: unknown): ToolConfig | null {
  if (isToolConfig(config)) {
    return config;
  }

  return null;
}

/**
 * Processes a function-based tool configuration export.
 *
 * Handles `.tool.ts` files that export a configuration function. The function is called
 * with an InstallFunction and context (new API), and can either use the builder pattern
 * or return a configuration object directly.
 *
 * @param configureToolFn - The configuration function exported from the `.tool.ts` file.
 * @param logger - Logger instance for operations.
 * @param toolName - Name of the tool being configured.
 * @param filePath - Path to the configuration file (for error reporting).
 * @param projectConfig - Parsed project configuration for creating context.
 * @param systemInfo - System information for context creation.
 * @param fileSystem - File system for context utilities.
 * @returns The validated tool configuration, or null if processing failed.
 */
async function processFunctionExport(
  configureToolFn: AsyncConfigureTool | AsyncConfigureToolWithReturn,
  logger: TsLogger,
  toolName: string,
  filePath: string,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  fileSystem: IResolvedFileSystem,
): Promise<ToolConfig | null> {
  const toolDir = path.dirname(filePath);
  const context = createToolConfigContext(projectConfig, systemInfo, toolName, toolDir, fileSystem, logger);
  const install = createInstallFunction(logger, toolName, context);
  const result = await configureToolFn(install, context);

  // Check if the function returned a ToolConfig object
  if (result && typeof result === 'object' && 'name' in result) {
    const validatedConfig = validateToolConfig(result);
    return validatedConfig;
  }

  // Function didn't return an object, use builder pattern
  // The install function creates and returns a builder, so we can call build() on the result
  if (result && typeof result === 'object' && 'build' in result && typeof result.build === 'function') {
    const builtConfig: unknown = result.build();
    const validatedConfig = validateToolConfig(builtConfig);
    return validatedConfig;
  }

  logger.error(messages.configurationParseError(filePath, 'ToolConfig', 'Invalid return from configuration function'));
  return null;
}

/**
 * Processes a direct object export tool configuration.
 *
 * Handles `.tool.ts` files that directly export a configuration object rather than
 * a function. Validates the object and ensures the name matches the filename.
 *
 * @param exportedObject - The configuration object exported from the `.tool.ts` file.
 * @param logger - Logger instance for operations.
 * @param filePath - Path to the configuration file (for error reporting).
 * @param toolName - Expected tool name (derived from filename).
 * @returns The validated tool configuration, or null if processing failed.
 */
function processDirectExport(
  exportedObject: unknown,
  logger: TsLogger,
  filePath: string,
  toolName: string,
): ToolConfig | null {
  const validatedConfig = validateToolConfig(exportedObject);
  if (validatedConfig) {
    // Ensure the toolConfig.name matches the filename if it's a direct object export
    if (validatedConfig.name !== toolName) {
      logger.warn(
        messages.configurationFieldInvalid('tool config object name', validatedConfig.name, `filename: ${toolName}`),
        filePath,
      );
    }
  }
  return validatedConfig;
}

/**
 * Loads a `.tool.ts` file as an ES module and derives a {@link @dotfiles/core#ToolConfig}.
 *
 * Supports both direct object exports and function exports.
 */
async function loadToolConfigFromModule(
  logger: TsLogger,
  filePath: string,
  toolName: string,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  fileSystem: IResolvedFileSystem,
): Promise<ToolConfig | null> {
  try {
    const moduleExports: IToolConfigModule = await import(filePath);
    if (!moduleExports.default) {
      logger.error(messages.configurationParseError(filePath, 'ToolConfig', 'no default export'));
      return null;
    }

    let toolConfig: ToolConfig | null;

    const exportedValue: unknown = moduleExports.default;

    if (isConfigureToolFunction(exportedValue)) {
      toolConfig = await processFunctionExport(
        exportedValue,
        logger,
        toolName,
        filePath,
        projectConfig,
        systemInfo,
        fileSystem,
      );
    } else {
      toolConfig = processDirectExport(exportedValue, logger, filePath, toolName);
    }

    // Set the config file path after building/loading
    if (toolConfig) {
      toolConfig.configFilePath = filePath;
    }

    return toolConfig;
  } catch (error) {
    logger.error(messages.configurationLoadFailed(path.relative(projectConfig.configFileDir, filePath)), error);
    return null;
  }
}

function validateAndStoreToolConfig(
  logger: TsLogger,
  toolConfig: ToolConfig | null,
  filePath: string,
  toolConfigs: Record<string, ToolConfig>,
): void {
  if (toolConfig?.name) {
    toolConfigs[toolConfig.name] = toolConfig;
    logger.debug(messages.configurationLoaded(filePath, 1), toolConfig.name);
  } else if (toolConfig) {
    logger.warn(messages.configurationFieldInvalid('tool config', 'missing name', 'valid name property'), filePath);
  } else {
    logger.error(messages.configurationParseError(filePath, 'ToolConfig', 'Could not derive valid configuration'));
  }
}

/**
 * Recursively scans a directory tree for `.tool.ts` configuration files.
 *
 * Traverses the directory structure starting from the given path, collecting all files
 * that end with `.tool.ts` and extracting the tool name from each filename.
 *
 * @param fs - File system interface for directory operations.
 * @param dirPath - Root directory path to start scanning from.
 * @param logger - Logger instance for debug messages.
 * @returns Array of objects containing file paths and corresponding tool names.
 */
async function scanDirectoryForToolFiles(
  fs: IResolvedFileSystem,
  dirPath: string,
  logger: TsLogger,
): Promise<{ filePath: string; toolName: string; }[]> {
  const results: { filePath: string; toolName: string; }[] = [];

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
        logger.debug(messages.fsReadFailed(entryPath), error);
      }
    }
  } catch (error) {
    logger.debug(messages.fsReadFailed(dirPath), error);
  }

  return results;
}

/**
 * Loads tool configurations from a directory.
 *
 * Recursively scans the specified directory for `.tool.ts` files, loads and validates
 * each configuration, and returns them as a record. Can optionally filter to load only
 * a specific tool by name.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param toolConfigsDir - Root directory containing `.tool.ts` configuration files.
 * @param fs - File system interface for reading files and directories.
 * @param projectConfig - Parsed project configuration for context creation.
 * @param systemInfo - System information for context creation.
 * @param toolName - Optional tool name to filter by. If provided, only loads that tool's configuration.
 * @returns A record mapping tool names to their configurations.
 */
export async function loadToolConfigs(
  parentLogger: TsLogger,
  toolConfigsDir: string,
  fs: IResolvedFileSystem,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  toolName?: string,
): Promise<Record<string, ToolConfig>> {
  const logger = parentLogger.getSubLogger({ name: 'loadToolConfigs' });
  const toolConfigs: Record<string, ToolConfig> = {};

  if (toolName) {
    logger.debug(messages.singleToolConfigLoadingStarted(toolName, toolConfigsDir));
  } else {
    logger.debug(messages.toolConfigLoadingStarted(toolConfigsDir));
  }

  try {
    if (!(await fs.exists(toolConfigsDir))) {
      logger.debug(messages.fsItemNotFound('tool configs directory', toolConfigsDir));
      const emptyConfigs: Record<string, ToolConfig> = {};
      return emptyConfigs;
    }

    logger.trace(messages.toolConfigDirectoryScan(toolConfigsDir));

    // Recursively scan for all .tool.ts files
    const allToolFiles = await scanDirectoryForToolFiles(fs, toolConfigsDir, logger);

    // Filter files if a specific tool name is requested
    const filesToProcess = toolName
      ? allToolFiles.filter(({ toolName: foundToolName }) => foundToolName === toolName)
      : allToolFiles;

    for (const { filePath, toolName: discoveredToolName } of filesToProcess) {
      const toolConfig = await loadToolConfigFromModule(
        logger,
        filePath,
        discoveredToolName,
        projectConfig,
        systemInfo,
        fs,
      );
      validateAndStoreToolConfig(logger, toolConfig, filePath, toolConfigs);
    }
  } catch (error) {
    logger.error(messages.fsReadFailed(toolConfigsDir), error);
    const emptyConfigs: Record<string, ToolConfig> = {};
    return emptyConfigs;
  }

  return toolConfigs;
}

/**
 * Loads configuration for a single tool by name.
 *
 * Convenience wrapper around {@link loadToolConfigs} that filters for a specific tool
 * and returns just that tool's configuration.
 *
 * @param parentLogger - Parent logger instance (a sublogger will be created).
 * @param toolName - The name of the tool to load configuration for.
 * @param toolConfigsDir - Root directory containing `.tool.ts` configuration files.
 * @param fs - File system interface for reading files and directories.
 * @param projectConfig - Parsed project configuration for context creation.
 * @param systemInfo - System information for context creation.
 * @returns The tool's configuration if found, undefined otherwise.
 */
export async function loadSingleToolConfig(
  parentLogger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IResolvedFileSystem,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
): Promise<ToolConfig | undefined> {
  const configs = await loadToolConfigs(parentLogger, toolConfigsDir, fs, projectConfig, systemInfo, toolName);
  return configs[toolName];
}
