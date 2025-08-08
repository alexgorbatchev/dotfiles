/**
 * Branded string types for shell scripts to enforce explicit execution timing
 */

/**
 * Script that runs only once after tool installation or updates
 */
export type OnceScript = string & { readonly __brand: 'once' };

/**
 * Script that runs on every shell startup
 */
export type AlwaysScript = string & { readonly __brand: 'always' };

/**
 * Union type for all shell script execution types
 */
export type ShellScript = OnceScript | AlwaysScript;

/**
 * Tagged template function to mark scripts that should run only once after installation/updates
 * 
 * @example
 * ```typescript
 * c.zsh(once`
 *   # Generate completions (runs only once)
 *   tool gen-completions --shell zsh > "$DOTFILES/.generated/completions/_tool"
 * `)
 * ```
 */
export function once(strings: TemplateStringsArray, ...values: unknown[]): OnceScript {
  const content = String.raw(strings, ...values);
  const script = new String(content) as any;
  script.__brand = 'once';
  return script as OnceScript;
}

/**
 * Tagged template function to mark scripts that should run on every shell startup
 * 
 * @example
 * ```typescript
 * c.zsh(always`
 *   # Fast runtime integration (runs every shell startup)
 *   export TOOL_CONFIG_DIR="$HOME/.config/tool"
 *   eval "$(tool init zsh)"
 * `)
 * ```
 */
export function always(strings: TemplateStringsArray, ...values: unknown[]): AlwaysScript {
  const content = String.raw(strings, ...values);
  const script = new String(content) as any;
  script.__brand = 'always';
  return script as AlwaysScript;
}

/**
 * Type guard to check if a script is a OnceScript
 */
export function isOnceScript(script: ShellScript): script is OnceScript {
  return (script as OnceScript).__brand === 'once';
}

/**
 * Type guard to check if a script is an AlwaysScript  
 */
export function isAlwaysScript(script: ShellScript): script is AlwaysScript {
  return (script as AlwaysScript).__brand === 'always';
}

/**
 * Extract the script content from a branded shell script
 */
export function getScriptContent(script: ShellScript): string {
  return script as string;
}