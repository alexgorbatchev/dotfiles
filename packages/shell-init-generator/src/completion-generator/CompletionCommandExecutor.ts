import type { TsLogger } from '@dotfiles/logger';
import type { ShellType } from '@dotfiles/schemas';
import { $ } from 'bun';
import { completionGeneratorLogMessages } from './log-messages';
import type { ICompletionCommandExecutor } from './types';

export class CompletionCommandExecutor implements ICompletionCommandExecutor {
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger) {
    this.logger = parentLogger.getSubLogger({ name: 'CompletionCommandExecutor' });
  }

  async executeCompletionCommand(
    cmd: string,
    toolName: string,
    shellType: ShellType,
    workingDir: string
  ): Promise<string> {
    const logger = this.logger.getSubLogger({ name: 'executeCompletionCommand' });
    logger.debug(completionGeneratorLogMessages.commandExecutionStarted(toolName, cmd, shellType));

    try {
      // Use sh -c to execute the command string properly
      const fullCommand = `cd ${workingDir} && PATH=${workingDir}:$PATH ${cmd}`;
      const result = await $`sh -c ${fullCommand}`.quiet();
      logger.debug(completionGeneratorLogMessages.commandExecutionCompleted(toolName, shellType));
      return result.text();
    } catch (error) {
      const exitCode = error && typeof error === 'object' && 'exitCode' in error ? (error.exitCode as number) : -1;
      const stderr =
        error && typeof error === 'object' && 'stderr' in error ? (error.stderr as Buffer).toString() : 'Unknown error';

      const errorMessage = `Completion command failed for ${toolName}: ${cmd}`;
      logger.error(completionGeneratorLogMessages.commandExecutionFailed(toolName, cmd, exitCode, stderr));
      throw new Error(`${errorMessage}\nExit code: ${exitCode}\nStderr: ${stderr}`);
    }
  }
}
