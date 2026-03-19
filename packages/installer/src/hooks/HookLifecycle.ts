import type {
  AsyncInstallHook,
  IAfterInstallContext,
  IInstallBaseContext,
  IInstallContext,
  InstallEvent,
  ToolConfig,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { InstallResult } from '../types';
import type { HookExecutor } from '../utils/HookExecutor';
import { messages } from '../utils/log-messages';

type UnknownRecord = Record<string, unknown>;
type InstallHooks = Record<string, AsyncInstallHook<IInstallBaseContext>[]>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAsyncInstallHookArray(value: unknown): value is AsyncInstallHook<IInstallBaseContext>[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'function');
}

function isTsLogger(value: unknown): value is TsLogger {
  if (!isUnknownRecord(value)) {
    return false;
  }

  return typeof value['getSubLogger'] === 'function';
}

function getInstallHooksFromToolConfig(toolConfig: unknown): InstallHooks | undefined {
  if (!isUnknownRecord(toolConfig)) {
    return undefined;
  }

  const installParams: unknown = toolConfig['installParams'];
  if (!isUnknownRecord(installParams)) {
    return undefined;
  }

  const hooks: unknown = installParams['hooks'];
  if (!isUnknownRecord(hooks)) {
    return undefined;
  }

  const hookEntries: [string, unknown][] = Object.entries(hooks);
  if (hookEntries.length === 0) {
    return undefined;
  }

  const normalizedHooks: InstallHooks = {};
  for (const [hookName, maybeHookArray] of hookEntries) {
    if (!isAsyncInstallHookArray(maybeHookArray)) {
      return undefined;
    }

    normalizedHooks[hookName] = maybeHookArray;
  }

  return normalizedHooks;
}

export class HookLifecycle {
  private readonly hookExecutor: HookExecutor;

  constructor(hookExecutor: HookExecutor) {
    this.hookExecutor = hookExecutor;
  }

  async handleInstallEvent(
    event: InstallEvent,
    currentToolConfig: ToolConfig | undefined,
    parentLogger: TsLogger,
  ): Promise<void> {
    if (!currentToolConfig) {
      return;
    }

    const hooks = getInstallHooksFromToolConfig(currentToolConfig);
    if (!hooks) {
      return;
    }

    const hookArray = hooks[event.type];
    if (!hookArray) {
      return;
    }

    const eventLoggerCandidate: unknown = event.context['logger'];
    const eventLogger: TsLogger = isTsLogger(eventLoggerCandidate) ? eventLoggerCandidate : parentLogger;

    const toolFs = event.context.fileSystem;
    const enhancedContext = this.hookExecutor.createEnhancedContext(event.context, toolFs, eventLogger);

    for (const hook of hookArray) {
      const result = await this.hookExecutor.executeHook(eventLogger, event.type, hook, enhancedContext);

      if (!result.success) {
        const errorMessage = result.error ? `${event.type} hook failed: ${result.error}` : `Hook ${event.type} failed`;
        throw new Error(errorMessage);
      }
    }
  }

  async executeBeforeInstallHook(
    resolvedToolConfig: ToolConfig,
    context: IInstallContext,
    toolFs: IFileSystem,
    parentLogger: TsLogger,
  ): Promise<InstallResult | null> {
    const logger = parentLogger.getSubLogger({ name: 'executeBeforeInstallHook' });
    const hooks = getInstallHooksFromToolConfig(resolvedToolConfig);
    const beforeInstallHooks = hooks?.['before-install'];

    if (!beforeInstallHooks) {
      return null;
    }

    logger.debug(messages.lifecycle.hookExecution('before-install'));
    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs, logger);

    for (const hook of beforeInstallHooks) {
      const result = await this.hookExecutor.executeHook(logger, 'before-install', hook, enhancedContext);

      if (!result.success) {
        const failureResult: InstallResult = {
          success: false,
          error: `beforeInstall hook failed: ${result.error}`,
        };
        return failureResult;
      }
    }

    return null;
  }

  async executeAfterInstallHook(
    resolvedToolConfig: ToolConfig,
    context: IAfterInstallContext,
    toolFs: IFileSystem,
    parentLogger: TsLogger,
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'executeAfterInstallHook' });
    const hooks = getInstallHooksFromToolConfig(resolvedToolConfig);
    const afterInstallHooks = hooks?.['after-install'];

    if (!afterInstallHooks) {
      return;
    }

    logger.debug(messages.lifecycle.hookExecution('after-install'));

    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs, logger);

    for (const hook of afterInstallHooks) {
      await this.hookExecutor.executeHook(logger, 'after-install', hook, enhancedContext, { continueOnError: true });
    }
  }
}
