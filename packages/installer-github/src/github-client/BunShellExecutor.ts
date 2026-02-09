import { $ } from 'bun';
import type { IShellExecutor, IShellResult } from './IShellExecutor';

/**
 * Shell executor implementation using Bun's $ operator.
 */
export class BunShellExecutor implements IShellExecutor {
  async execute(command: string, args: string[]): Promise<IShellResult> {
    const fullCommand = [command, ...args];

    // Use Bun's $ with nothrow() to capture exit code instead of throwing
    const result = await $`${fullCommand}`.quiet().nothrow();

    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    };
  }
}
