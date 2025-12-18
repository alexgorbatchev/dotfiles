import type { $ } from 'bun';

declare const extendedShellBrand: unique symbol;

/**
 * A configured Bun shell instance that extends Bun's `$`.
 *
 * **What it extends**
 * - Automatically applies a base environment to every command.
 * - Intercepts `.env()` to *merge* additional variables with the base environment (instead of
 *   replacing it). This preserves critical variables like `PATH` and recursion guards.
 *
 * **What it does NOT do**
 * - It does not set or override the working directory. Unless the caller explicitly uses
 *   `.cwd(...)` or performs a `cd ... && ...` in the command, the working directory is inherited
 *   from the running process (`process.cwd()`).
 *
 * **Where you get it**
 * - This type is provided on the install lifecycle hook context as `ctx.$` (e.g. `before-install`,
 *   `after-download`, `after-extract`, `after-install`).
 * - It is not available during `.tool.ts` configuration loading (tool config evaluation uses an
 *   `IToolConfigContext`, which intentionally has no shell executor).
 *
 * This is a *type brand* over Bun's `$` to ensure hook/plugin contexts receive the configured
 * shell variant.
 */
export type $extended = typeof $ & { readonly [extendedShellBrand]: true };
