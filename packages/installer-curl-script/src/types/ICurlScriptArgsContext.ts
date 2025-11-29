import type { ProjectConfig } from '@dotfiles/core';

/**
 * Context provided to args function for dynamic argument generation.
 */
export interface ICurlScriptArgsContext {
  /** Project configuration with paths and settings */
  projectConfig: ProjectConfig;
  /**
   * The absolute path to the downloaded installation script file on the local file system.
   * This script has already been made executable (chmod +x).
   * Example: `${projectConfig.paths.binariesDir}/<tool-name>/<version>/<tool-name>-install.sh`
   */
  scriptPath: string;
  /**
   * The absolute path to the directory where the tool is being installed.
   * This is the versioned directory.
   * Example: `${projectConfig.paths.binariesDir}/<tool-name>/<version>`
   */
  installDir: string;
}
