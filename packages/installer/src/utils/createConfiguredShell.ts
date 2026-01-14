import { type $extended, extendedShellBrand, hasLoggingShell, loggingShellBrand } from '@dotfiles/core';
import type { $ } from 'dax-sh';

/**
 * Creates a configured shell instance that automatically applies the provided environment variables
 * to all commands executed with it.
 *
 * With dax-sh, subsequent .env() calls are additive (they merge with existing env vars),
 * so we simply need to ensure the base environment is applied to each command.
 *
 * @param $shell - The base dax shell instance
 * @param env - The environment variables to apply to all commands
 * @returns A new shell instance that wraps the base shell with the provided environment
 */
export function createConfiguredShell(
  $shell: typeof $ | $extended,
  env: Record<string, string | undefined>,
): $extended {
  // Create a wrapper function that applies the environment to every command
  const configuredShell = (first: TemplateStringsArray | string, ...expressions: unknown[]) => {
    if (typeof first === 'string') {
      return ($shell as $extended)(first).env(env);
    }
    // @ts-expect-error: dax-sh typing for template expressions
    return $shell(first, ...expressions).env(env);
  };

  // Copy all properties from the original shell to the wrapper
  // This ensures that properties like $.escape, $.text, etc. are available
  Object.assign(configuredShell, $shell);

  // Add the brand symbol to mark this as an extended shell
  Object.defineProperty(configuredShell, extendedShellBrand, { value: true, enumerable: false });

  // Preserve the logging shell brand if present on the source shell
  // (Object.assign doesn't copy non-enumerable symbol properties)
  if (hasLoggingShell($shell)) {
    Object.defineProperty(configuredShell, loggingShellBrand, { value: true, enumerable: false });
  }

  return configuredShell as unknown as $extended;
}
