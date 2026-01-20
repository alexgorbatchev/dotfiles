import { LogLevel } from '@dotfiles/logger';
import { describe, expect, test } from 'bun:test';
import { resolveLogLevel } from '../cli';
import type { IGlobalProgramOptions } from '../types';

describe('resolveLogLevel', () => {
  test('forces quiet when --shim-mode is present', () => {
    const argv = ['install', 'fnm', '--shim-mode'];
    const options: IGlobalProgramOptions = {
      config: '',
      dryRun: false,
      log: 'default',
      verbose: false,
      quiet: false,
      trace: false,
      platform: undefined,
      arch: undefined,
    };

    const level = resolveLogLevel(argv, options);
    expect(level).toBe(LogLevel.QUIET);
  });

  test('does not force quiet when --shim-mode is absent', () => {
    const argv = ['install', 'fnm'];
    const options: IGlobalProgramOptions = {
      config: '',
      dryRun: false,
      log: 'default',
      verbose: false,
      quiet: false,
      trace: false,
      platform: undefined,
      arch: undefined,
    };

    const level = resolveLogLevel(argv, options);
    expect(level).toBe(LogLevel.DEFAULT);
  });
});
