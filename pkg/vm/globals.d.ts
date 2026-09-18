/**
 * Globals the CLI's embedded JavaScript runtime provides to configuration files.
 *
 * This file is shipped beside index.d.ts and is included only by the tsconfig the CLI
 * writes under the generated directory. It is kept apart from index.d.ts because a
 * project that also loads Node or Bun type definitions would see a second, conflicting
 * declaration of `process`; the CLI-owned program loads neither, since the
 * configuration runs inside the CLI rather than in Node.js.
 */

/**
 * The process object the runtime exposes. Only `env` exists: there is no
 * `process.platform`, `process.argv` or anything else from Node's API. Use
 * `ctx.systemInfo` for the platform and architecture.
 */
interface IRuntimeProcess {
  /**
   * Environment variables of the CLI process. A variable that is not set reads as
   * `undefined`.
   */
  env: Record<string, string | undefined>;
}

/**
 * The environment the configuration is evaluated in.
 */
declare var process: IRuntimeProcess;
