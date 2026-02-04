import { NodeFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import os from 'node:os';
import path from 'node:path';
import { messages } from './log-messages';

/**
 * Default configuration file names to search for when no explicit config is provided.
 * Files are searched in order of priority - the first existing file is used.
 */
export const DEFAULT_CONFIG_FILES: string[] = ['dotfiles.config.ts'];

/**
 * Resolves the configuration file path.
 *
 * If an explicit config path is provided via CLI, it is resolved relative to cwd.
 * If no config is provided, searches for default config files in order of priority.
 *
 * @param parentLogger - Parent logger instance for logging.
 * @param configOption - The --config CLI option value (empty string if not provided).
 * @param cwd - Current working directory for path resolution.
 * @returns Absolute path to the configuration file, or undefined if not found.
 */
export async function resolveConfigPath(
  parentLogger: TsLogger,
  configOption: string,
  cwd: string,
): Promise<string | undefined> {
  const logger = parentLogger.getSubLogger({ name: 'resolveConfigPath' });

  const bootstrapHomeDir: string = os.homedir();

  // If explicit config path provided, resolve it relative to cwd
  if (configOption.length > 0) {
    const expandedConfigOption: string = configOption.startsWith('~')
      ? configOption.replace(/^~(?=$|\/|\\)/, bootstrapHomeDir)
      : configOption;

    const resolvedPath = path.resolve(cwd, expandedConfigOption);
    logger.debug(messages.configPathResolved(resolvedPath));
    return resolvedPath;
  }

  // Search for default config files in order of priority
  const nodeFs = new NodeFileSystem();
  for (const fileName of DEFAULT_CONFIG_FILES) {
    const configPath = path.join(cwd, fileName);
    if (await nodeFs.exists(configPath)) {
      logger.debug(messages.configPathResolved(configPath));
      return configPath;
    }
  }

  // No config file found
  return undefined;
}
