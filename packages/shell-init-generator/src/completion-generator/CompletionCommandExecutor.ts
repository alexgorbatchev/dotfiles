import { type Shell, type ShellType } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
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
  ): Promise<string> {
    const logger = this.logger.getSubLogger({ name: 'executeCompletionCommand' }).setPrefix(toolName);
    logger.debug(messages.commandExecutionStarted(toolName, cmd, shellType));

    try {
      // Use sh -c to execute the command string properly
      const fullCommand = `cd ${workingDir} && PATH=${workingDir}:$PATH ${cmd}`;
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
}
