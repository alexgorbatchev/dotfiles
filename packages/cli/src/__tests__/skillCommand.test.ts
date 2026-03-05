import type { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, test } from 'bun:test';
import { registerSkillCommand } from '../skillCommand';
import type { IGlobalProgram, IServices } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('skillCommand', () => {
  let program: IGlobalProgram;
  let testLogger: TestLogger;
  let mockServices: IServices;

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'skill-command',
    });

    program = setup.program;
    testLogger = setup.logger;
    mockServices = setup.createServices();

    registerSkillCommand(testLogger, program, async () => mockServices);
  });

  test('should register skill command successfully', () => {
    const commands = program.commands;
    const skillCommand = commands.find((cmd) => cmd.name() === 'skill');

    expect(skillCommand).toBeDefined();
    expect(skillCommand?.description()).toContain('skill');
  });

  test('should require path argument', () => {
    const commands = program.commands;
    const skillCommand = commands.find((cmd) => cmd.name() === 'skill');
    const args = skillCommand?.registeredArguments;

    expect(args).toHaveLength(1);
    const pathArg = args?.[0];
    expect(pathArg?.name()).toBe('path');
    expect(pathArg?.required).toBe(true);
  });
});
