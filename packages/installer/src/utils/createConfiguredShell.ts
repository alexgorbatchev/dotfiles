import { hasLoggingShell, loggingShellBrand, type Shell, type ShellCommandInput } from "@dotfiles/core";

/**
 * Creates a configured shell instance that automatically applies the provided environment variables
 * to all commands executed with it.
 *
 * With Shell, subsequent .env() calls are additive (they merge with existing env vars),
 * so we simply need to ensure the base environment is applied to each command.
 *
 * @param $shell - The base Shell instance
 * @param env - The environment variables to apply to all commands
 * @returns A new shell instance that wraps the base shell with the provided environment
 */
export function createConfiguredShell($shell: Shell, env: Record<string, string | undefined>): Shell {
  // Create a wrapper function that applies the environment to every command
  const configuredShell = (first: ShellCommandInput, ...expressions: unknown[]) => {
    if (typeof first === "string") {
      return $shell(first).env(env);
    }
    return $shell(first, ...expressions).env(env);
  };

  // Copy all properties from the original shell to the wrapper
  Object.assign(configuredShell, $shell);

  // Preserve the logging shell brand if present on the source shell
  // (Object.assign doesn't copy non-enumerable symbol properties)
  if (hasLoggingShell($shell)) {
    Object.defineProperty(configuredShell, loggingShellBrand, { value: true, enumerable: false });
  }

  return configuredShell as unknown as Shell;
}
