import type { $extended } from '@dotfiles/core';
import type { $, ShellExpression } from 'bun';

/**
 * Creates a configured shell instance that automatically applies the provided environment variables
 * to all commands executed with it.
 *
 * @param $shell - The base Bun shell instance
 * @param env - The environment variables to apply to all commands
 * @returns A new shell instance that wraps the base shell with the provided environment
 */
export function createConfiguredShell(
  $shell: typeof $ | $extended,
  env: Record<string, string | undefined>
): $extended {
  // Create a wrapper function that applies the environment to every command
  const configuredShell = (strings: TemplateStringsArray, ...expressions: ShellExpression[]) => {
    const shellPromise = $shell(strings, ...expressions).env(env);

    // Intercept .env() to merge with the base environment instead of replacing it
    // This ensures that critical environment variables (like PATH and recursion guards)
    // are preserved when plugins add their own variables.
    const originalEnv = shellPromise.env;
    shellPromise.env = function (newEnv: Record<string, string | undefined>) {
      return originalEnv.call(this, { ...env, ...newEnv });
    };

    return shellPromise;
  };

  // Copy all properties from the original shell to the wrapper
  // This ensures that properties like $.escape, $.text, etc. are available
  Object.assign(configuredShell, $shell);

  return configuredShell as $extended;
}
