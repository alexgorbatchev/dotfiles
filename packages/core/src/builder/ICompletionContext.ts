/**
 * Context available when resolving shell completion configuration.
 *
 * This context is provided after successful installation when the tool's version is known.
 * Completions are NOT generated during `dotfiles generate`, only after `dotfiles install`.
 * Use this context in completion callbacks to construct version-dependent URLs or source paths.
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
   * Only available after `dotfiles install` completes successfully.
   * Contains the actual resolved version (e.g., `'15.1.0'`), not the configured
   * version which may be `'latest'`.
   *
   * @example
   * '15.1.0'
   * 'v0.26.1'
   */
  version: string;
}
