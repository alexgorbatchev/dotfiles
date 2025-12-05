/**
 * Install-first API implementation for defineTool.
 *
 * Provides type-safe tool configuration through generic mapped types,
 * where the installer method is selected first.
 */

import type {
  AsyncConfigureTool,
  IInstallParamsRegistry,
  InstallFunction,
  InstallMethod,
  IToolConfigContext,
  ToolConfig,
  IToolConfigBuilder as ToolConfigBuilderContract,
} from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { IToolConfigBuilder } from '@dotfiles/tool-config-builder';

type ConfigureToolFnResult =
  | ToolConfig
  | ToolConfigBuilderContract
  | undefined
  | Promise<ToolConfig | ToolConfigBuilderContract | undefined>;

/**
 * Define a tool configuration with type-safe install method selection.
 *
 * The install function is provided as the first parameter, allowing you to
 * select the installer method and provide type-checked parameters upfront.
 *
 * @param fn - Configuration callback that receives:
 *   - `install` - Function to select installer method. Call with method name and params,
 *     or call with no args for manual tools. Returns a fluent builder.
 *   - `ctx` - Context with paths (toolDir, homeDir, binDir, dotfilesDir) and system info.
 *
 * @returns Async function compatible with tool loading system
 *
 * @example
 * ```ts
 * export default defineTool((install, ctx) =>
 *   install('github-release', { repo: 'BurntSushi/ripgrep' })
 *     .bin('rg')
 *     .version('14.0.0')
 * );
 * ```
 */
export function defineTool(
  fn: (
    /**
     * Function to select the installation method and provide type-checked parameters.
     * Call with a method name and params for installers, or call with no args for manual tools.
     * Returns a fluent builder to configure binaries, versions, hooks, and shell settings.
     * 
     * @inheritdoc
     */
    install: InstallFunction,
    /**
     * Context object providing access to paths, configuration, and system information.
     * Includes toolName, toolDir, homeDir, binDir, dotfilesDir, and more.
     */
    ctx: IToolConfigContext
  ) => ConfigureToolFnResult
): AsyncConfigureTool {
  return async (
    install: InstallFunction,
    ctx: IToolConfigContext
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
 * @returns InstallFunction that creates configured IToolConfigBuilder instances
 */
export function createInstallFunction(
  logger: TsLogger,
  toolName: string,
  context?: IToolConfigContext
): InstallFunction {
  let builderInstance: IToolConfigBuilder | null = null;

  const getOrCreateBuilder = (): IToolConfigBuilder => {
    if (!builderInstance) {
      builderInstance = new IToolConfigBuilder(logger, toolName);
    }

    builderInstance.setContext(context);
    return builderInstance;
  };

  function install<M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): ToolConfigBuilderContract;
  function install(): ToolConfigBuilderContract;
  function install(method?: InstallMethod, params?: IInstallParamsRegistry[InstallMethod]): ToolConfigBuilderContract {
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