import { loggingShellBrand } from './extendedShell.types';

/**
 * Checks if a shell has logging capabilities attached.
 * Used to prevent double-wrapping with createLoggingShell.
 */
export function hasLoggingShell($shell: unknown): boolean {
  return typeof $shell === 'function' && loggingShellBrand in $shell;
}
