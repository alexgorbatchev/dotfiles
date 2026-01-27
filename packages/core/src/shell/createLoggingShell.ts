import { createSafeLogMessage, type TsLogger } from '@dotfiles/logger';
import { loggingShellBrand, type Shell, type ShellCommand } from './types';

/**
 * Wraps an existing shell to add command logging.
 *
 * Use this when you have a shell already configured (with cwd, env, etc.)
 * and want to add logging on top. The wrapper logs each command before
 * delegating to the base shell.
 *
 * For creating a new shell with logging, use `createShell({ logger })` instead.
 *
 * @param baseShell - The shell instance to wrap
 * @param logger - Logger for command logging
 * @returns A wrapped shell that logs commands
 *
 * @example
 * ```typescript
 * const baseShell = createShell();
 * const configuredShell = createConfiguredShell(baseShell, env);
 * const loggingShell = createLoggingShell(configuredShell, logger);
 * await loggingShell`echo hello`;
 * ```
 */
export function createLoggingShell(baseShell: Shell, logger: TsLogger): Shell {
  // Create a wrapper that logs the command and delegates to the base shell
  const loggingWrapper = (first: TemplateStringsArray, ...expressions: unknown[]): ShellCommand => {
    // Build the command string for logging BEFORE any transformations
    let commandStr: string = first[0] || '';
    for (let i = 0; i < expressions.length; i++) {
      const expr = expressions[i];
      if (Array.isArray(expr)) {
        commandStr += expr.map((e) => escapeArg(String(e))).join(' ');
      } else {
        commandStr += escapeArg(String(expr));
      }
      commandStr += first[i + 1] || '';
    }

    // Log the command BEFORE passing to wrappers (which may transform it)
    logger.info(createSafeLogMessage(`$ ${commandStr}`));

    // Delegate to base shell - it will handle streaming if it has a logger
    return baseShell(first, ...expressions);
  };

  // Copy properties from base shell and add brands
  Object.assign(loggingWrapper, baseShell);
  Object.defineProperty(loggingWrapper, loggingShellBrand, { value: true, enumerable: false });

  return loggingWrapper as unknown as Shell;
}

// Simple argument escaping for logging display
function escapeArg(arg: string): string {
  if (arg === '' || /[\s"'`$\\]/.test(arg)) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}
