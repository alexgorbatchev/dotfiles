import { ARCH_VALUES, OS_VALUES } from '@dotfiles/config';
import { Command } from 'commander';
import type { GlobalProgram } from './types';

export function createProgram(): GlobalProgram {
  const program: GlobalProgram = new Command()
    .name('generator')
    .description('CLI tool for managing dotfiles and tool configurations')
    .version('0.1.0')
    .option('--config <path>', 'Path to a configuration file', '')
    .option('--dry-run', 'Simulate all operations without making changes to the file system', false)
    .option('--verbose', 'Enable detailed debug messages.', false)
    .option('--quiet', 'Suppress all informational and debug output. Errors are still displayed.', false)
    .option('--platform <platform>', `Override the detected platform (${OS_VALUES.join(', ')})`)
    .option('--arch <arch>', `Override the detected architecture (${ARCH_VALUES.join(', ')})`);

  return program;
}
