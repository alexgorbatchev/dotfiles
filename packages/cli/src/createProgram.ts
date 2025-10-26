import { ARCH_VALUES, OS_VALUES } from '@dotfiles/config';
import { LOG_LEVEL_NAMES } from '@dotfiles/logger';
import { Command } from 'commander';
import type { GlobalProgram } from './types';

export function createProgram(): GlobalProgram {
  const program: GlobalProgram = new Command()
    .name('generator')
    .description('CLI tool for managing dotfiles and tool configurations')
    .version(process.env['DOTFILES_VERSION'] || '0.0.0')
    .option('--config <path>', 'Path to a configuration file', '')
    .option('--dry-run', 'Simulate all operations without making changes to the file system', false)
    .option(`--log <level>`, `Set log level (${LOG_LEVEL_NAMES.join(', ')})`, 'default')
    .option('--verbose', 'Enable detailed debug messages (alias for --log=verbose)', false)
    .option(
      '--quiet',
      'Suppress all informational and debug output. Errors are still displayed (alias for --log=quiet)',
      false
    )
    .option('--platform <platform>', `Override the detected platform (${OS_VALUES.join(', ')})`)
    .option('--arch <arch>', `Override the detected architecture (${ARCH_VALUES.join(', ')})`);

  return program;
}
