import path from 'node:path';
import type { ISystemInfo } from '@dotfiles/core';
import { expandHomePath } from './expandHomePath';

/**
 * Config paths interface to avoid circular dependency with @dotfiles/config
 */
interface IConfigWithPaths {
  paths: {
    homeDir: string;
    dotfilesDir: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Expands a path from a tool configuration file.
 *
 * Handles:
 * 1. Variable expansion: ${paths.homeDir}, ${paths.dotfilesDir}, etc.
 * 2. Home directory expansion: ~/some/path -> /home/user/some/path (using projectConfig.paths.homeDir)
 * 3. Relative path resolution: ./some/path -> resolved relative to tool config file
 * 4. Absolute paths: /some/path -> used as-is
 *
 * @param toolConfigFilePath - Absolute path to the tool config file (can be undefined for legacy configs)
 * @param inputPath - The path from the tool config (may contain variables, ~, or be relative)
 * @param projectConfig - The loaded project configuration for variable substitution and home directory
 * @param systemInfo - System information (kept for compatibility but homeDir comes from projectConfig)
 * @returns The fully resolved absolute path
 */
export function expandToolConfigPath(
  toolConfigFilePath: string | undefined,
  inputPath: string,
  projectConfig: IConfigWithPaths,
  _systemInfo: ISystemInfo
): string {
  // Step 1: Expand variables like ${paths.homeDir}
  let expandedPath = expandVariables(inputPath, projectConfig);

  // Step 2: Expand home directory (~)
  expandedPath = expandHomePath(projectConfig.paths.homeDir, expandedPath);

  // Step 3: If still relative, resolve relative to tool config file directory or fallback to dotfiles dir
  if (!path.isAbsolute(expandedPath)) {
    if (toolConfigFilePath) {
      const toolConfigDir = path.dirname(toolConfigFilePath);
      expandedPath = path.resolve(toolConfigDir, expandedPath);
    } else {
      // Fallback to dotfiles directory for legacy configs without configFilePath
      expandedPath = path.resolve(projectConfig.paths.dotfilesDir, expandedPath);
    }
  }

  return expandedPath;
}

/**
 * Expands variables in a path string using the project configuration.
 * Supports syntax like ${paths.homeDir}, ${paths.dotfilesDir}, etc.
 */
function expandVariables(inputPath: string, projectConfig: IConfigWithPaths): string {
  return inputPath.replace(/(?<!\$)\{([a-zA-Z0-9_.]+)\}/g, (match, varName) => {
    if (varName.includes('.')) {
      const parts = varName.split('.');
      let value: unknown = projectConfig;

      for (const part of parts) {
        if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[part];
        } else {
          // Variable not found, return original match
          return match;
        }
      }

      return typeof value === 'string' ? value : match;
    }

    // Simple variable name - not supported in this context, return as-is
    return match;
  });
}
