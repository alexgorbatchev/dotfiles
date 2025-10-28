import type { AsyncInstallHook } from '@dotfiles/schemas';
import type { HookExecutor } from '../utils/HookExecutor';
import { messages } from '../utils/log-messages';
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

    context.logger.debug(messages.hookStep.executingHook(hookType));

    try {
      const enhancedContext = hookExecutor.createEnhancedContext(context, context.toolFs);
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
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
