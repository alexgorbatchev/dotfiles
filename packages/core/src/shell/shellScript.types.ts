/**
 * This module defines shell script types using a discriminated union pattern.
 * The `kind` property is used by type guards (`isOnceScript` and `isAlwaysScript`)
 * in `BaseShellGenerator` to correctly route scripts into appropriate execution
 * contexts (one-time setup vs. every shell startup).
 */

/**
 * A shell script that should run only once, typically after a tool is installed or updated.
 * Used for tasks like generating completions or performing initial setup.
 */
export type OnceScript = { readonly kind: 'once'; readonly value: string; };

/**
 * A shell script that should run on every shell startup.
 * Used for tasks like setting environment variables or running `eval` commands.
 */
export type AlwaysScript = { readonly kind: 'always'; readonly value: string; };

/**
 * A union type representing any kind of shell script, whether it runs once or
 * on every shell startup.
 */
export type ShellScript = OnceScript | AlwaysScript;

/**
 * Creates a shell script that runs only once after tool installation or update.
 *
 * @param value - The shell script content.
 * @returns A {@link OnceScript} object.
 */
export function once(value: string): OnceScript {
  return { kind: 'once', value };
}

/**
 * Creates a shell script that runs on every shell startup.
 *
 * @param value - The shell script content.
 * @returns An {@link AlwaysScript} object.
 */
export function always(value: string): AlwaysScript {
  return { kind: 'always', value };
}

/**
 * A type guard to check if a given script is a {@link OnceScript}.
 *
 * @param script - The script to check.
 * @returns `true` if the script is a `OnceScript`, otherwise `false`.
 */
export function isOnceScript(script: ShellScript): script is OnceScript {
  return script.kind === 'once';
}

/**
 * A type guard to check if a given script is an {@link AlwaysScript}.
 *
 * @param script - The script to check.
 * @returns `true` if the script is an `AlwaysScript`, otherwise `false`.
 */
export function isAlwaysScript(script: ShellScript): script is AlwaysScript {
  return script.kind === 'always';
}

/**
 * Extracts the raw string content from a shell script.
 *
 * @param script - The {@link ShellScript} to unwrap.
 * @returns The raw string content of the script.
 */
export function getScriptContent(script: ShellScript): string {
  return script.value;
}
