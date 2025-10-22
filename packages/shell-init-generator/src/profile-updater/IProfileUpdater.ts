import type { IFileSystem } from '@dotfiles/file-system';
import type { ShellType } from '@dotfiles/schemas';

/**
 * Configuration for updating a specific profile file.
 */
export interface ProfileUpdateConfig {
  /** Shell type this profile belongs to */
  shellType: ShellType;
  /** Path to the generated shell script to source */
  generatedScriptPath: string;
  /** Whether to check if the profile file exists before attempting to update */
  onlyIfExists: boolean;
  /** Path to the YAML config file for reference in comments */
  yamlConfigPath: string;
}

/**
 * Result of a profile file update operation.
 */
export interface ProfileUpdateResult {
  /** Shell type that was processed */
  shellType: ShellType;
  /** Path to the profile file that was processed */
  profilePath: string;
  /** Whether the profile file existed */
  fileExists: boolean;
  /** Whether the sourcing line was added or already existed */
  wasUpdated: boolean;
  /** Whether the sourcing line already existed in the file */
  wasAlreadyPresent: boolean;
}

/**
 * Interface for updating shell profile files to source generated initialization scripts.
 */
export interface IProfileUpdater {
  /**
   * Updates profile files for the specified shell types to source the generated scripts.
   *
   * @param configs - Array of profile update configurations
   * @returns Promise resolving to array of update results
   */
  updateProfiles(configs: ProfileUpdateConfig[]): Promise<ProfileUpdateResult[]>;

  /**
   * Gets the default profile file path for a given shell type.
   *
   * @param shellType - The shell type to get profile path for
   * @returns The default profile file path for the shell
   */
  getProfilePath(shellType: ShellType): string;

  /**
   * Checks if a profile file already contains a source line for the given script path.
   *
   * @param profilePath - Path to the profile file
   * @param scriptPath - Path to the script to check for
   * @returns Promise resolving to true if the sourcing line exists
   */
  hasSourceLine(profilePath: string, scriptPath: string): Promise<boolean>;
}

/**
 * Constructor signature for profile updater implementations.
 */
export interface IProfileUpdaterConstructor {
  new (fileSystem: IFileSystem, homeDir: string): IProfileUpdater;
}
