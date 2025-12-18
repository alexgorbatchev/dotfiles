import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { createMemFileSystem } from '@dotfiles/file-system';
import { LogLevel, TestLogger } from '@dotfiles/logger';
import type { ILogObj } from 'tslog';
import { writeHookErrorDetails } from '../writeHookErrorDetails';

function stripAnsi(input: string): string {
  const escapeChar = String.fromCharCode(27);
  const ansiPattern = new RegExp(`${escapeChar}\\[[0-9;]*m`, 'g');
  const result = input.replace(ansiPattern, '');
  return result;
}

describe('writeHookErrorDetails - code frame', () => {
  it('prints a .tool.ts code frame based on stack trace', async () => {
    const logger: TestLogger<ILogObj> = new TestLogger({ name: 'test', minLevel: LogLevel.DEFAULT });
    const { fs } = await createMemFileSystem();

    const toolPath = '/tools/core-system/zoxide/zoxide.tool.ts';
    const toolSource = ['line1', 'line2', 'line3 boom', 'line4', 'line5'].join('\n');

    await fs.ensureDir('/tools/core-system/zoxide');
    await fs.writeFile(toolPath, toolSource);

    const error = new Error('boom');
    error.stack = `Error: boom\n    at <anonymous> (${toolPath}:3:6)\n`;

    let output = '';

    await writeHookErrorDetails({
      fileSystem: fs,
      logger,
      hookName: 'after-install',
      toolName: 'zoxide',
      error,
      writeOutput: (chunk: string): void => {
        output += chunk;
      },
    });

    const normalized = stripAnsi(output);

    assert(normalized.includes('source:'), normalized);
    assert(normalized.includes(`${toolPath}:3:6`), normalized);
    assert(normalized.includes('> 3 | line3 boom'), normalized);
    assert(normalized.includes('  1 | line1'), normalized);
    assert(normalized.includes('  5 | line5'), normalized);
  });
});
