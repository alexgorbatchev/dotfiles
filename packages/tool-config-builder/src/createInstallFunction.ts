/**
 * Runtime implementation of InstallFunction for the install-first API.
 *
 * Creates an InstallFunction that instantiates ToolConfigBuilder instances
 * with the installation method and params already configured.
 */

import type { Builder } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { ToolConfigBuilder } from './toolConfigBuilder';

type InstallFunction = Builder.InstallFunction;
type ToolConfigBuilderInterface = Builder.ToolConfigBuilder;
type ToolConfigContext = Builder.ToolConfigContext;

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
  // Track builder instance - created on first call
  let builderInstance: ToolConfigBuilder | null = null;

  const installFn = ((method?: string, params?: unknown): ToolConfigBuilderInterface => {
    // Create builder on first call
    if (!builderInstance) {
      builderInstance = new ToolConfigBuilder(logger, toolName);
    }

    builderInstance.setContext(context);

    // Set installation method and params directly on builder's public fields
    if (method) {
      builderInstance.currentInstallationMethod = method;
      builderInstance.currentInstallParams = (params as Record<string, unknown>) || {};
    }

    return builderInstance as unknown as ToolConfigBuilderInterface;
  }) as InstallFunction;

  return installFn;
}
