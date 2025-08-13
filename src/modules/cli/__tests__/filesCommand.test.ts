import { describe, expect, it } from 'bun:test';
import type { Services } from '@cli';
import { createProgram } from '@cli';
import { TestLogger } from '@testing-helpers';
import { registerFilesCommand } from '../filesCommand';

describe('filesCommand', () => {
  it('should register files command successfully', () => {
    const logger = new TestLogger();
    const program = createProgram();
    const servicesFactory = () => Promise.resolve({} as Services);

    registerFilesCommand(logger, program, servicesFactory);

    const commands = program.commands;
    const filesCommand = commands.find((cmd) => cmd.name() === 'files');

    expect(filesCommand).toBeDefined();
    expect(filesCommand?.description()).toBe('Inspect tracked files in the registry');

    // Check that all expected options are present
    const options = filesCommand?.options;
    expect(options?.some((opt) => opt.long === '--tool')).toBe(true);
    expect(options?.some((opt) => opt.long === '--type')).toBe(true);
    expect(options?.some((opt) => opt.long === '--status')).toBe(true);
    expect(options?.some((opt) => opt.long === '--since')).toBe(true);
  });
});
