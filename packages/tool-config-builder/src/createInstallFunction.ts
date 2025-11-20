/**
 * Runtime implementation of InstallFunction for the install-first API.
 *
 * Creates an InstallFunction that instantiates IToolConfigBuilder instances
 * with the installation method and params already configured.
 */

import type { IInstallParamsRegistry, InstallFunction, InstallMethod, IToolConfigContext } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { IToolConfigBuilder } from './toolConfigBuilder';

/**
 * Creates an InstallFunction bound to a specific logger and tool name.
 *
 * This function creates the runtime implementation of the InstallFunction interface,
 * which uses function overloads to provide type-safe installer method selection.
 * The returned function creates IToolConfigBuilder instances pre-configured with
 * the installation method and parameters.
 *
 * @param logger - Logger instance for the builder.
 * @param toolName - Name of the tool being configured.
 * @param context - Tool configuration context providing path resolution helpers.
 * @returns InstallFunction that creates configured IToolConfigBuilder instances.
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

  function install<M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): IToolConfigBuilder;
  function install(): IToolConfigBuilder;
  function install(method?: InstallMethod, params?: IInstallParamsRegistry[InstallMethod]): IToolConfigBuilder {
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
