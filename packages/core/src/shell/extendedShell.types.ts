import type { $ } from 'bun';

declare const extendedShellBrand: unique symbol;

/**
 * A configured Bun shell instance that automatically applies specific environment variables
 * (like PATH and recursion guards) to all executed commands.
 *
 * This shell wrapper intercepts `.env()` calls to merge new variables with the base
 * configuration instead of replacing them, ensuring critical environment settings are preserved.
 */
export type $extended = typeof $ & { readonly [extendedShellBrand]: true };
