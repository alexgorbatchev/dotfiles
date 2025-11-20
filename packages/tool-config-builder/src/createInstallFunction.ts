/**
 * Runtime implementation of InstallFunction for the install-first API.
 *
 * Creates an InstallFunction that instantiates ToolConfigBuilder instances
 * with the installation method and params already configured.
 */

import type { InstallFunction, InstallMethod, InstallParamsRegistry, ToolConfigContext } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { ToolConfigBuilder } from './toolConfigBuilder';

/**
 * Creates an InstallFunction bound to a specific logger and tool name.
 *
 * This function creates the runtime implementation of the InstallFunction interface,
 * which uses function overloads to provide type-safe installer method selection.
 * The returned function creates ToolConfigBuilder instances pre-configured with
 * the installation method and parameters.
 *
 * @param logger - Logger instance for the builder.
 * @param toolName - Name of the tool being configured.
 * @param context - Tool configuration context providing path resolution helpers.
 * @returns InstallFunction that creates configured ToolConfigBuilder instances.
 *
 * @example
 * ```typescript
 * const install = createInstallFunction(logger, 'ripgrep');
 * const config = install('github-release', { repo: 'BurntSushi/ripgrep' })
 *   .bin('rg')
 *   .build();
 * ```
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

  function install<M extends InstallMethod>(method: M, params: InstallParamsRegistry[M]): ToolConfigBuilder;
  function install(): ToolConfigBuilder;
  function install(method?: InstallMethod, params?: InstallParamsRegistry[InstallMethod]): ToolConfigBuilder {
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
