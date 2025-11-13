/**
 * A branded string type representing a shell script that should run only once,
 * typically after a tool is installed or updated.
 *
 * This is used for tasks like generating completions or performing initial setup
 * that do not need to be repeated on every shell startup.
 *
 * @see {@link once}
 * @public
 */
export type OnceScript = string & { readonly __brand: 'once' };

/**
 * A branded string type representing a shell script that should run on every
 * shell startup.
 *
 * This is used for tasks like setting environment variables, initializing shell
 * functions, or running `eval` commands that are required for the tool to
 * function correctly in a new shell session.
 *
 * @see {@link always}
 * @public
 */
export type AlwaysScript = string & { readonly __brand: 'always' };

/**
 * A union type representing any kind of shell script, whether it runs once or
 * on every shell startup.
 * @public
 */
export type ShellScript = OnceScript | AlwaysScript;

/**
 * A tagged template function that marks a shell script to be run only once
 * after a tool installation or update.
 * 
 * Needs `bierner.comment-tagged-templates` VSCode extension to highlight
 * shell scripts correctly.
 *
 * @param strings - The template string array.
 * @param values - The values to interpolate into the string.
 * @returns A {@link OnceScript} branded string.
 *
 * @example
 * ```typescript
 * once /* zsh *\/`
 *   # This command generates completions and runs only once.
 *   tool gen-completions --shell zsh > "$DOTFILES/.generated/completions/_tool"
 * `
 * ```
 * @public
 */
export function once(strings: TemplateStringsArray, ...values: unknown[]): OnceScript {
  const content = String.raw(strings, ...values);
  const script = new String(content) as OnceScript;
  // Intentionally augmenting String object for branded type
  (script as OnceScript & { __brand: string }).__brand = 'once';
  return script as OnceScript;
}

/**
 * A tagged template function that marks a shell script to be run on every
 * shell startup.
 *
 * Needs `bierner.comment-tagged-templates` VSCode extension to highlight
 * shell scripts correctly.
 * 
 * @param strings - The template string array.
 * @param values - The values to interpolate into the string.
 * @returns An {@link AlwaysScript} branded string.
 *
 * @example
 * ```typescript
 * always /* zsh *\/`
 *   # This command initializes the tool on every shell startup.
 *   export TOOL_CONFIG_DIR="$HOME/.config/tool"
 *   eval "$(tool init zsh)"
 * `
 * ```
 * @public
 */
export function always(strings: TemplateStringsArray, ...values: unknown[]): AlwaysScript {
  const content = String.raw(strings, ...values);
  const script = new String(content) as AlwaysScript;
  // Intentionally augmenting String object for branded type
  (script as AlwaysScript & { __brand: string }).__brand = 'always';
  return script as AlwaysScript;
}

/**
 * A type guard to check if a given script is a {@link OnceScript}.
 *
 * @param script - The script to check.
 * @returns `true` if the script is a `OnceScript`, otherwise `false`.
 * @public
 */
export function isOnceScript(script: ShellScript): script is OnceScript {
  return (script as OnceScript).__brand === 'once';
}

/**
 * A type guard to check if a given script is an {@link AlwaysScript}.
 *
 * @param script - The script to check.
 * @returns `true` if the script is an `AlwaysScript`, otherwise `false`.
 * @public
 */
export function isAlwaysScript(script: ShellScript): script is AlwaysScript {
  return (script as AlwaysScript).__brand === 'always';
}

/**
 * Extracts the raw string content from a branded shell script type.
 *
 * @param script - The {@link ShellScript} to unwrap.
 * @returns The raw string content of the script.
 * @public
 */
export function getScriptContent(script: ShellScript): string {
  return script as string;
}
