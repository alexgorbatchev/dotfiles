export * from './base';
export * from './builder.types';
export * from './hooks';
export * from './installation-methods';
export * from './platform';
export * from './shell';
export * from './toolConfigSchema';
export * from './toolConfigUpdateCheckSchema';

import type { AsyncConfigureTool, ToolConfigBuilder, ToolConfigContext } from './builder.types';
import type { ToolConfig } from './toolConfigSchema';
export type ToolConfigInstallationMethod = ToolConfig['installationMethod'];
export type ToolConfigInstallParams = ToolConfig['installParams'];

type SyncConfigureTool = (c: ToolConfigBuilder, ctx: ToolConfigContext) => ToolConfigBuilder;
type AnyConfigureTool = AsyncConfigureTool | SyncConfigureTool;

/**
 * Helper function to define a tool configuration with full type inference.
 * This provides strong typing for the tool configuration function without requiring
 * explicit type annotations on the parameters.
 *
 * Supports both async function syntax and sync builder chain syntax:
 *
 * @param fn - The tool configuration function (async or sync)
 * @returns An async function compatible with AsyncConfigureTool
 *
 * @example
 * // Sync builder chain syntax (implicit return)
 * export default defineTool((c, ctx) =>
 *   c.bin('dive')
 *     .version('latest')
 *     .install('github-release', { repo: 'wagoodman/dive' })
 * );
 *
 * // Async syntax with braces
 * export default defineTool(async (c, ctx) => {
 *   c.bin('dive')
 *     .version('latest')
 *     .install('github-release', { repo: 'wagoodman/dive' });
 * });
 */
export function defineTool<T extends AnyConfigureTool>(fn: T): AsyncConfigureTool {
  return async (c: ToolConfigBuilder, ctx: ToolConfigContext): Promise<void> => {
    const result = fn(c, ctx);
    if (result instanceof Promise) {
      await result;
    }
  };
}
