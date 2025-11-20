import { ARCH_VALUES, OS_VALUES } from '@dotfiles/config';
import { LOG_LEVEL_NAMES } from '@dotfiles/logger';
import { Command } from 'commander';
import type { IGlobalProgram } from './types';

/**
 * Creates and configures the main Commander.js program with global options.
 *
 * Sets up the CLI program with global options available to all commands:
 * - Configuration file path
 * - Dry-run mode
 * - Log level control
 * - Platform/architecture overrides
 *
 * @returns The configured Commander.js program instance
 * @example
 * ```typescript
 * const program = createProgram();
 * program
 *   .command('install')
 *   .action(async (options) => {
 *     const globalOpts = program.opts();
 *     console.log(globalOpts.verbose); // Access global options
 *   });
 * ```
 */
export function createProgram(): IGlobalProgram {
  const program: IGlobalProgram = new Command()
    .name('generator')
    .description('CLI tool for managing dotfiles and tool configurations')
    .version(process.env.DOTFILES_VERSION ?? '0.0.0')
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
