import path from 'node:path';
import type {
  ToolConfig,
  AsyncConfigureTool,
  ToolConfigBuilder as IToolConfigBuilder,
} from './types';
import { ToolConfigBuilder } from './tool-config-builder';
import { createLogger } from './utils/logger';
import { config as appConfig } from './config';

const logger = createLogger('config-loader');

/**
 * Loads the raw configuration function from a tool's specific configuration file.
 * Example: generator/src/tools/my-tool.ts
 * @param toolName The name of the tool, corresponding to the filename.
 * @param importer The dynamic import function to use (defaults to global import).
 * @returns The AsyncConfigureTool function exported by the tool's config file.
 */
async function importToolConfigureFunction(
  toolName: string,
  importer: (modulePath: string) => Promise<any> = (globalThis as any).import
): Promise<AsyncConfigureTool> {
  if (!appConfig.DOTFILES_DIR) {
    throw new Error('DOTFILES_DIR is not configured.');
  }
  // TODO: Determine the correct base path for tool configs.
  // Assuming they are in 'generator/src/tools' relative to DOTFILES_DIR for now.
  // This might need to be adjusted based on the final project structure or config.
  const toolsDir = path.join(appConfig.DOTFILES_DIR, 'generator', 'src', 'tools');
  const toolConfigPath = path.join(toolsDir, `${toolName}.ts`);

  logger('Attempting to import tool configuration from: %s', toolConfigPath);

  try {
    // Dynamically import the .ts file using the provided importer.
    const toolModule = await importer(toolConfigPath);
    if (typeof toolModule.configureTool !== 'function') {
      throw new Error(
        `Tool configuration file ${toolConfigPath} must export an async function named 'configureTool'.`
      );
    }
    return toolModule.configureTool as AsyncConfigureTool;
  } catch (error) {
    logger(
      'Error importing tool configuration for %s from %s: %o',
      toolName,
      toolConfigPath,
      error
    );
    throw new Error(
      `Failed to load configuration for tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Loads, builds, and resolves the configuration for a specific tool.
 * @param toolName The name of the tool.
 * @param currentOsArch The current OS and architecture string (e.g., "darwin-arm64").
 * @param importer Optional custom dynamic import function for testing.
 * @returns The resolved ToolConfig for the given tool and architecture.
 */
export async function getToolConfigByName(
  toolName: string,
  currentOsArch: string,
  importer?: (modulePath: string) => Promise<any> // This can be undefined
): Promise<ToolConfig> {
  logger('Loading configuration for tool: %s, arch: %s', toolName, currentOsArch);
  // Pass importer; if it's undefined, importToolConfigureFunction will use its default
  const configureToolFunc = await importToolConfigureFunction(toolName, importer);

  const builder = new ToolConfigBuilder(toolName);
  await configureToolFunc(builder);

  // Get the configuration, applying architecture-specific overrides
  const resolvedConfig = builder.getConfig(currentOsArch);
  logger('Resolved configuration for %s (%s): %o', toolName, currentOsArch, resolvedConfig);
  return resolvedConfig;
}

/**
 * Loads all tool configurations.
 * (This might be needed by the main generator script, not necessarily by install-tool.ts directly)
 * @param currentOsArch The current OS and architecture string.
 * @returns A map of tool names to their resolved ToolConfig.
 */
// export async function getAllToolConfigs(currentOsArch: string): Promise<Map<string, ToolConfig>> {
//   const configs = new Map<string, ToolConfig>();
//   // TODO: Need a way to discover all tool config files in generator/src/tools/
//   const toolNames = []; // e.g., by reading the directory
//   for (const toolName of toolNames) {
//     try {
//       const config = await getToolConfigByName(toolName, currentOsArch);
//       configs.set(toolName, config);
//     } catch (error) {
//       logger('Failed to load config for tool %s during getAllToolConfigs: %o', toolName, error);
//       // Decide whether to throw, or collect errors and continue
//     }
//   }
//   return configs;
// }
