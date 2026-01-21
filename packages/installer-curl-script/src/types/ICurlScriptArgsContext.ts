import type { ProjectConfig } from '@dotfiles/core';

/**
 * Context provided to args function for dynamic argument generation.
 */
export interface ICurlScriptArgsContext {
  /** Project configuration with paths and settings */
  projectConfig: ProjectConfig;

  /**
   * The absolute path to the downloaded installation script file on the local file system.
   * The script is downloaded from the URL specified in `installParams.url`, saved to the
   * staging directory, and made executable (chmod +x). This file is preserved after
   * installation completes (moved along with the staging directory to the versioned path).
   *
   * Example: `${stagingDir}/<tool-name>-install.sh`
   */
  scriptPath: string;

  /**
   * The absolute path to the temporary staging directory for this installation attempt.
   * The downloaded installation script (`scriptPath`) is saved here, along with any files
   * the script or your code creates during installation. After successful installation,
   * the entire directory is renamed to the versioned path (e.g., `<tool-name>/1.2.3`),
   * preserving all contents.
   *
   * Example: `${projectConfig.paths.binariesDir}/<tool-name>/<uuid>`
   */
  stagingDir: string;
}
