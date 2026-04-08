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
  IToolConfigBuilder as ToolConfigBuilderContract,
  IToolConfigContext,
  ToolConfig,
} from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";
import { IToolConfigBuilder } from "@dotfiles/tool-config-builder";

type ConfigureToolFnResult =
  | ToolConfig
  | ToolConfigBuilderContract
  | Omit<ToolConfigBuilderContract, "bin">
  | undefined
  | Promise<ToolConfig | ToolConfigBuilderContract | Omit<ToolConfigBuilderContract, "bin"> | undefined>;

/**
 * Define a tool configuration with type-safe install method selection.
 *
 * The install function is provided as the first parameter, allowing you to
 * select the installer method and provide type-checked parameters upfront.
 *
 * @param fn - Configuration callback that receives:
 *   - `install` - Function to select installer method. Call with method name and params,
 *     or call with no args for manual tools. Returns a fluent builder.
 *   - `ctx` - Context with tool/config info (toolName, projectConfig, systemInfo).
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
     * Use `ctx.projectConfig.paths.*` for configured directory paths.
     */
    ctx: IToolConfigContext,
  ) => ConfigureToolFnResult,
): AsyncConfigureTool {
  return async (
    install: InstallFunction,
    ctx: IToolConfigContext,
  ): Promise<ToolConfig | ToolConfigBuilderContract | Omit<ToolConfigBuilderContract, "bin"> | undefined> => {
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
  context?: IToolConfigContext,
): InstallFunction {
  let builderInstance: IToolConfigBuilder | null = null;

  const getOrCreateBuilder = (): IToolConfigBuilder => {
    if (!builderInstance) {
      builderInstance = new IToolConfigBuilder(logger, toolName);
    }

    builderInstance.setContext(context);
    return builderInstance;
  };

  function install(method?: InstallMethod, params?: IInstallParamsRegistry[InstallMethod]): ToolConfigBuilderContract {
    const builder = getOrCreateBuilder();

    if (method) {
      const fallbackParams: Record<string, unknown> = {};
      builder.currentInstallationMethod = method;
      builder.currentInstallParams = params ?? fallbackParams;
    }

    return builder;
  }

  return install as InstallFunction;
}
