/**
 * Install-first API implementation for defineTool.
 *
 * Provides type-safe tool configuration through generic mapped types,
 * where the installer method is selected first.
 */

import type {
  AsyncConfigureTool,
  InstallFunction,
  InstallMethod,
  InstallParamsRegistry,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderContract,
  ToolConfigContext,
} from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { ToolConfigBuilder } from '@dotfiles/tool-config-builder';

type ConfigureToolFnResult =
  | ToolConfig
  | ToolConfigBuilderContract
  | undefined
  | Promise<ToolConfig | ToolConfigBuilderContract | undefined>;

type ConfigureToolFn = (install: InstallFunction, ctx: ToolConfigContext) => ConfigureToolFnResult;

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
 *     .bin('rg').version('14.0.0')
 * );
 *
 * @example Manual tool (no installation)
 * export default defineTool((install, ctx) =>
 *   install().bin('existing-tool')
 * );
 */
export function defineTool(fn: ConfigureToolFn): AsyncConfigureTool {
  return async (
    install: InstallFunction,
    ctx: ToolConfigContext
  ): Promise<ToolConfig | ToolConfigBuilderContract | undefined> => {
    const result = fn(install, ctx);
    if (result instanceof Promise) {
      return result;
    }
    return result;
  };
}

/**
 * Create an InstallFunction bound to a specific logger and tool name.
 *
 * @param logger - Logger instance for the builder
 * @param toolName - Name of the tool being configured
 * @param context - Tool configuration context providing path helpers
 * @returns InstallFunction that creates configured ToolConfigBuilder instances
 */
export function createInstallFunction(
  logger: TsLogger,
  toolName: string,
  context?: ToolConfigContext
): InstallFunction {
  let builderInstance: ToolConfigBuilder | null = null;

  const getOrCreateBuilder = (): ToolConfigBuilder => {
    if (!builderInstance) {
      builderInstance = new ToolConfigBuilder(logger, toolName);
    }

    builderInstance.setContext(context);
    return builderInstance;
  };

  function install<M extends InstallMethod>(method: M, params: InstallParamsRegistry[M]): ToolConfigBuilderContract;
  function install(): ToolConfigBuilderContract;
  function install(method?: InstallMethod, params?: InstallParamsRegistry[InstallMethod]): ToolConfigBuilderContract {
    const builder = getOrCreateBuilder();

    if (method) {
      const fallbackParams: Record<string, unknown> = {};
      builder.currentInstallationMethod = method;
      builder.currentInstallParams = params ?? fallbackParams;
    }

    return builder;
  }

  return install;
}
