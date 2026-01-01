/**
 * Context available when resolving shell completion configuration.
 *
 * This context is provided at generation time (after installation) when the tool's
 * version is known. Use this context in completion callbacks to construct version-
 * dependent URLs or source paths.
 *
 * @example
 * // Version-dependent completion URL
 * shell.completions((ctx) => ({
 *   url: `https://github.com/user/repo/releases/download/${ctx.version}/completions.zsh`,
 * }))
 */
export interface ICompletionContext {
  /**
   * The installed version of the tool.
   *
   * @example '15.1.0'
   * @example 'v0.26.1'
   */
  version: string;
}
