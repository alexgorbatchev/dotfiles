/**
 * Result of a shell command execution.
 */
export interface IShellResult {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code of the command (0 = success) */
  exitCode: number;
}

/**
 * Interface for executing shell commands.
 * Abstraction layer for testability - allows mocking shell execution in tests.
 */
export interface IShellExecutor {
  /**
   * Executes a shell command with arguments.
   *
   * @param command - The command to execute (e.g., 'gh')
   * @param args - Array of arguments to pass to the command
   * @returns Promise resolving to the execution result
   */
  execute(command: string, args: string[]): Promise<IShellResult>;
}
