import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { ShellType } from '@types';
import { $ } from 'zx';
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
    workingDir: string,
    zxInstance: typeof $ = $
  ): Promise<string> {
    const logger = this.logger.getSubLogger({ name: 'executeCompletionCommand' });
    logger.debug(logs.command.debug.actionStarted('completion-generation', toolName));

    const result = await zxInstance`cd ${workingDir} && PATH=${workingDir}:$PATH ${cmd}`.nothrow();

    if (result.exitCode !== 0) {
      const errorMessage = `Completion command failed for ${toolName}: ${cmd}`;
      const exitCode = result.exitCode ?? -1;
      logger.error(logs.command.error.executionFailed(cmd, exitCode, result.stderr));
      throw new Error(`${errorMessage}\nExit code: ${exitCode}\nStderr: ${result.stderr}`);
    }

    logger.debug(logs.command.debug.methodStarted(), `completion-${shellType}-completed`);
    return result.stdout;
  }
}
