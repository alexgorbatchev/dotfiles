import type { ShellType } from '@types';

/**
 * Output from script initializer containing initialization content
 */
export interface InitializationOutput {
  /** The initialization content to add to the main shell file */
  content: string;
}

/**
 * Interface for script initializers that add required setup code to shell files
 */
export interface IScriptInitializer {
  /**
   * Generates initialization content for the main shell file
   * 
   * @param shellType - Type of shell (zsh, bash, powershell)
   * @param shellScriptsDir - Directory where shell scripts are stored
   * @returns Initialization content to add to main shell file
   */
  initialize(shellType: ShellType, shellScriptsDir: string): InitializationOutput;
}