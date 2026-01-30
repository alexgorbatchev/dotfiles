import { type Shell, type ShellType } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import path from 'node:path';
import { messages } from './log-messages';
import type { ICompletionCommandExecutor } from './types';

export class CompletionCommandExecutor implements ICompletionCommandExecutor {
  private readonly logger: TsLogger;
  private readonly shell: Shell;

  constructor(parentLogger: TsLogger, shell: Shell) {
    this.logger = parentLogger.getSubLogger({ name: 'CompletionCommandExecutor' });
    this.shell = shell;
  }

  async executeCompletionCommand(
    cmd: string,
    toolName: string,
    shellType: ShellType,
    workingDir: string,
    binaryPaths?: string[],
  ): Promise<string> {
    const logger = this.logger.getSubLogger({ name: 'executeCompletionCommand' }).setPrefix(toolName);
    logger.debug(messages.commandExecutionStarted(toolName, cmd, shellType));

    // Build directories to prepend to PATH (from binaryPaths + workingDir)
    const binaryDirs = binaryPaths?.map((p) => path.dirname(p)) ?? [];
    const pathDirs = [...new Set([...binaryDirs, workingDir])];
    // TODO not multiplatform
    const pathPrefix = pathDirs.join(':');

    // Validate binary existence BEFORE running the command
    // This prevents infinite loops when the command would fall through to a shim
    if (binaryPaths && binaryPaths.length > 0) {
      const binaryNames = [...new Set(binaryPaths.map((p) => path.basename(p)))];
      const foundAny = await this.checkAnyBinaryExistsInPath(binaryNames, pathPrefix);
      if (!foundAny) {
        const searchedLocations = pathDirs.join(', ');
        throw new Error(
          `None of the expected binaries (${binaryNames.join(', ')}) found in: ${searchedLocations}. ` +
            `Skipping completion generation to prevent infinite loop.`,
        );
      }
    }

    try {
      // Run the completion command with the enhanced PATH
      const fullCommand = `cd ${workingDir} && PATH=${pathPrefix}:$PATH ${cmd}`;
      const result = await this.shell`sh -c ${fullCommand}`.quiet();
      logger.debug(messages.commandExecutionCompleted(toolName, shellType));
      return result.stdout;
    } catch (error) {
      const exitCode = error && typeof error === 'object' && 'exitCode' in error ? (error.exitCode as number) : -1;
      const stderr = error && typeof error === 'object' && 'stderr' in error
        ? (error.stderr as Buffer).toString()
        : 'Unknown error';

      const errorMessage = `Completion command failed for ${toolName}: ${cmd}`;
      logger.error(messages.commandExecutionFailed(toolName, cmd, exitCode, stderr));
      throw new Error(`${errorMessage}\nExit code: ${exitCode}\nStderr: ${stderr}`, { cause: error });
    }
  }

  /**
   * Check if any of the given binaries exist using shell's `command -v` with the specified PATH.
   * Uses ONLY our path prefix (not inheriting system PATH) to ensure we only find binaries
   * in the expected locations.
   */
  private async checkAnyBinaryExistsInPath(binaryNames: string[], pathPrefix: string): Promise<boolean> {
    for (const binaryName of binaryNames) {
      try {
        const checkCommand = `PATH=${pathPrefix} command -v ${binaryName}`;
        await this.shell`sh -c ${checkCommand}`.quiet();
        return true;
      } catch {
        // Binary not found, continue checking other binaries
      }
    }
    return false;
  }
}
