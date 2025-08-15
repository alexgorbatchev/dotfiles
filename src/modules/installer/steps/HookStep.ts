import { logs } from '@modules/logger';
import type { AsyncInstallHook } from '@types';
import type { HookExecutor } from '../HookExecutor';
import { InstallationStep, type StepContext } from './base';

export interface HookStepParams {
  hookType: 'afterDownload' | 'afterExtract' | 'beforeInstall' | 'afterInstall';
  hook: AsyncInstallHook;
  hookExecutor: HookExecutor;
}

/**
 * Step that executes installation hooks
 */
export class HookStep extends InstallationStep<HookStepParams> {
  getStepName(): string {
    return `hook-${this.params.hookType}`;
  }

  async execute(context: StepContext): Promise<StepContext> {
    const { hookType, hook, hookExecutor } = this.params;

    context.logger.debug(logs.installer.debug.hookExecuting(), hookType);

    try {
      const enhancedContext = hookExecutor.createEnhancedContext(context, context.toolFs, context.logger);
      const result = await hookExecutor.executeHook(hookType, hook, enhancedContext);

      if (!result.success) {
        return {
          ...context,
          success: false,
          error: `${hookType} hook failed: ${result.error}`,
        };
      }

      return {
        ...context,
        success: true,
      };
    } catch (error) {
      return {
        ...context,
        success: false,
        error: `${hookType} hook execution failed: ${(error as Error).message}`,
      };
    }
  }
}
