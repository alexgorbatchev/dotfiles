import { NodeFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { CONFIG_FILE_NAME, ENV_DIR_VAR } from "@dotfiles/virtual-env";
import path from "node:path";
import { messages } from "./log-messages";

/**
 * Default configuration file names to search for when no explicit config is provided.
 * Files are searched in order of priority - the first existing file is used.
 */
export const DEFAULT_CONFIG_FILES: string[] = ["dotfiles.config.ts"];

const BOUNDARY_MARKERS: string[] = ["project.json", ".git"];

export interface ProcessInfo {
  cwd: string;
  homeDir: string;
}

/**
 * Resolves the configuration file path.
 *
 * If an explicit config path is provided via CLI, it is resolved relative to cwd.
 * If no config is provided, walks up the directory tree searching for default config files.
 * Stops at project boundaries (project.json, .git) or $HOME.
 *
 * @param parentLogger - Parent logger instance for logging.
 * @param configOption - The --config CLI option value (empty string if not provided).
 * @param processInfo - Process-derived values: cwd and homeDir.
 * @returns Absolute path to the configuration file, or undefined if not found.
 */
export async function resolveConfigPath(
  parentLogger: TsLogger,
  configOption: string,
  processInfo: ProcessInfo,
): Promise<string | undefined> {
  const logger = parentLogger.getSubLogger({ name: "resolveConfigPath" });

  const { cwd, homeDir } = processInfo;
  const nodeFs = new NodeFileSystem();

  // If explicit config path provided, resolve it relative to cwd
  if (configOption.length > 0) {
    const expandedConfigOption: string = configOption.startsWith("~")
      ? configOption.replace(/^~(?=$|\/|\\)/, homeDir)
      : configOption;

    const resolvedPath = path.resolve(cwd, expandedConfigOption);
    logger.debug(messages.configPathResolved(resolvedPath));
    return resolvedPath;
  }

  // Check if DOTFILES_ENV_DIR is set (virtual env is active)
  const envDir = process.env[ENV_DIR_VAR];
  if (envDir) {
    const envConfigPath = path.join(envDir, CONFIG_FILE_NAME);
    if (await nodeFs.exists(envConfigPath)) {
      logger.debug(messages.envConfigFromEnvVar(envConfigPath));
      return envConfigPath;
    }
  }

  // Search for default config files, walking up the directory tree
  let currentDir: string = cwd;

  while (true) {
    for (const fileName of DEFAULT_CONFIG_FILES) {
      const configPath = path.join(currentDir, fileName);
      if (await nodeFs.exists(configPath)) {
        logger.debug(messages.configPathResolved(configPath));
        return configPath;
      }
    }

    // Stop at $HOME (after checking it for config)
    if (currentDir === homeDir) {
      break;
    }

    // Stop at boundary markers: project.json or .git
    for (const marker of BOUNDARY_MARKERS) {
      if (await nodeFs.exists(path.join(currentDir, marker))) {
        return undefined;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}
