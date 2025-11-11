/**
 * Install-first API implementation for defineTool.
 *
 * Provides type-safe tool configuration through generic mapped types,
 * where the installer method is selected first.
 */

import type { Builder } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { ToolConfigBuilder } from '@dotfiles/tool-config-builder';

type AsyncConfigureTool = Builder.AsyncConfigureTool;
type InstallFunction = Builder.InstallFunction;
type ToolConfigBuilderContract = Builder.ToolConfigBuilder;
type ToolConfigContext = Builder.ToolConfigContext;

/**
 * Define a tool configuration with type-safe install method selection.
 *
 * The install function is provided as the first parameter, allowing you to
 * select the installer method and provide type-checked parameters upfront.
 *
 * @param fn - Configuration function receiving InstallFunction and context
 * @returns Async function compatible with tool loading system
 *
 * @example
 * export default defineTool((install, ctx) =>
 *   install('github-release', { repo: 'BurntSushi/ripgrep' })
 *     .bin('rg')
 *     .version('14.0.0')
 * );
 *
 * @example Manual tool (no installation)
 * export default defineTool((install, ctx) =>
 *   install().bin('existing-tool')
 * );
 */
export function defineTool<T extends (install: InstallFunction, ctx: ToolConfigContext) => unknown>(
  fn: T
): AsyncConfigureTool {
  return async (install: InstallFunction, ctx: ToolConfigContext): Promise<ToolConfigBuilderContract | undefined> => {
    const result: unknown = fn(install, ctx);
    if (result instanceof Promise) {
      return (await result) as ToolConfigBuilderContract | undefined;
    }
    return result as ToolConfigBuilderContract | undefined;
  };
}

/**
 * Create an InstallFunction bound to a specific logger and tool name.
 *
 * @param logger - Logger instance for the builder
 * @param toolName - Name of the tool being configured
 * @returns InstallFunction that creates configured ToolConfigBuilder instances
 */
export function createInstallFunction(logger: TsLogger, toolName: string): InstallFunction {
  // Track which builder instance to return - created on first call
  let builderInstance: ToolConfigBuilder | null = null;

  const installFn = ((method?: string, params?: unknown): ToolConfigBuilderContract => {
    // Create builder on first call
    if (!builderInstance) {
      builderInstance = new ToolConfigBuilder(logger, toolName);
    }

    // Set installation method and params directly on builder fields
    if (method) {
      builderInstance.currentInstallationMethod = method;
      builderInstance.currentInstallParams = (params as Record<string, unknown>) || {};
    }

    return builderInstance as ToolConfigBuilderContract;
  }) as InstallFunction;

  return installFn;
}
