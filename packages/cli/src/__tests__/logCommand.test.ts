import { describe, expect, it } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import { createProgram } from '../createProgram';
import { registerLogCommand } from '../logCommand';
import type { IServices } from '../types';

describe('logCommand', () => {
  it('should register log command successfully', () => {
    const logger = new TestLogger();
    const program = createProgram();
    const servicesFactory = () => Promise.resolve({} as IServices);

    registerLogCommand(logger, program, servicesFactory);

    const commands = program.commands;
    const logCommand = commands.find((cmd) => cmd.name() === 'log');

    expect(logCommand).toBeDefined();
    expect(logCommand?.description()).toBe('Inspect tracked files in the registry');

    // Check that all expected options are present
    const options = logCommand?.options;
    expect(options?.some((opt) => opt.long === '--type')).toBe(true);
    expect(options?.some((opt) => opt.long === '--status')).toBe(true);
    expect(options?.some((opt) => opt.long === '--since')).toBe(true);

    // Check that tool is a positional argument, not an option
    expect(options?.some((opt) => opt.long === '--tool')).toBe(false);
  });
});
