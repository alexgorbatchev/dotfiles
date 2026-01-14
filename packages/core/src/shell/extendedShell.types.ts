import type { $ } from 'dax-sh';

export const extendedShellBrand: unique symbol = Symbol('extendedShellBrand');
export const loggingShellBrand: unique symbol = Symbol('loggingShellBrand');

/**
 * A configured Bun shell instance that extends Bun's `$`.
 *
 * **What it extends**
 * - Automatically applies a base environment to every command.
 * - Intercepts `.env()` to *merge* additional variables with the base environment (instead of
 *   replacing it). This preserves critical variables like `PATH` and recursion guards.
 *
 * **Working directory behavior (install hooks)**
 * - In install lifecycle hooks for a tool (defined in a `.tool.ts` file), commands run with the
 *   directory containing that `.tool.ts` file as the default working directory.
 * - This applies to: `before-install`, `after-download`, `after-extract`, `after-install`.
 * - Hooks can still override this per command via `.cwd(...)` or by using `cd ... && ...`.
 * - If the tool does not originate from a `.tool.ts` file (rare), the working directory is inherited
 *   from the running process (`process.cwd()`).
 */
export type $extended = typeof $ & {
  (command: string): ReturnType<typeof $>;
  readonly [extendedShellBrand]: true;
};
