import type { ShellCompletionConfig, ShellScript } from '@dotfiles/core';

/**
 * Internal storage for shell configuration.
 * Holds the accumulated scripts, aliases, environment variables, and completions
 * for a specific shell type before they are finalized into the ToolConfig.
 */
export interface ShellStorage {
  /**
   * List of shell scripts to execute (once or always).
   */
  scripts: ShellScript[];

  /**
   * Map of alias names to their commands.
   */
  aliases: Record<string, string>;

  /**
   * Map of environment variable names to their values.
   */
  environment: Record<string, string>;

  /**
   * Configuration for shell completions.
   */
  completions?: ShellCompletionConfig;
}

/**
 * Container for configuration storage of all supported shell types.
 * Used internally by the builder to track configurations for each shell.
 */
export interface InternalShellConfigs {
  /**
   * Configuration storage for Zsh.
   */
  zsh: ShellStorage;

  /**
   * Configuration storage for Bash.
   */
  bash: ShellStorage;

  /**
   * Configuration storage for PowerShell.
   */
  powershell: ShellStorage;
}

/**
 * Supported shell types as keys of the internal configuration storage.
 */
export type ShellTypeKey = keyof InternalShellConfigs;
