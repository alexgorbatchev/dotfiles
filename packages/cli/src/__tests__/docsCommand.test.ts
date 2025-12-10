import { beforeEach, describe, expect, test } from 'bun:test';
import type { TestLogger } from '@dotfiles/logger';
import { registerDocsCommand } from '../docsCommand';
import type { IGlobalProgram, IServices } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('docsCommand', () => {
  let program: IGlobalProgram;
  let testLogger: TestLogger;
  let mockServices: IServices;

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'docs-command',
    });

    program = setup.program;
    testLogger = setup.logger;
    mockServices = setup.createServices();

    registerDocsCommand(testLogger, program, async () => mockServices);
  });

  test('should register docs command successfully', () => {
    const commands = program.commands;
    const docsCommand = commands.find((cmd) => cmd.name() === 'docs');

    expect(docsCommand).toBeDefined();
    expect(docsCommand?.description()).toContain('symlink');
  });

  test('should require path argument', () => {
    const commands = program.commands;
    const docsCommand = commands.find((cmd) => cmd.name() === 'docs');
    const args = docsCommand?.registeredArguments;

    expect(args).toHaveLength(1);
    const pathArg = args?.[0];
    expect(pathArg?.name()).toBe('path');
    expect(pathArg?.required).toBe(true);
  });
});
