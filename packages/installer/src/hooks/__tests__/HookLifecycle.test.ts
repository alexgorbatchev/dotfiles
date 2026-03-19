import type { IAfterInstallContext } from '@dotfiles/core';
import { describe, expect, it, mock, spyOn } from 'bun:test';
import assert from 'node:assert';
import { createGithubReleaseToolConfig } from '../../__tests__/installer-test-helpers';
import { createTestInstallHookContext } from '../../__tests__/hookContextTestHelper';
import { HookExecutor } from '../../utils/HookExecutor';
import { HookLifecycle } from '../HookLifecycle';

describe('HookLifecycle', () => {
  it('executes matching install-event hooks in order', async () => {
    const executionOrder: string[] = [];
    const firstHook = mock(async () => {
      executionOrder.push('first');
    });
    const secondHook = mock(async () => {
      executionOrder.push('second');
    });

    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: 'owner/repo',
        hooks: {
          'after-download': [firstHook, secondHook],
        },
      },
    });

    const { context, logger } = createTestInstallHookContext();
    const hookExecutor = new HookExecutor(() => undefined);
    const hookLifecycle = new HookLifecycle(hookExecutor);

    await hookLifecycle.handleInstallEvent(
      {
        type: 'after-download',
        toolName: context.toolName,
        context: {
          ...context,
          logger,
        },
      },
      toolConfig,
      logger,
    );

    expect(executionOrder).toEqual(['first', 'second']);
  });

  it('propagates install-event hook failures', async () => {
    const eventHook = mock(async () => Promise.resolve());
    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: 'owner/repo',
        hooks: {
          'after-download': [eventHook],
        },
      },
    });

    const { context, logger } = createTestInstallHookContext();
    const hookExecutor = new HookExecutor(() => undefined);
    const executeHookSpy = spyOn(hookExecutor, 'executeHook').mockResolvedValue({
      success: false,
      error: 'event hook failed',
      durationMs: 1,
      skipped: false,
    });

    const hookLifecycle = new HookLifecycle(hookExecutor);

    await expect(
      hookLifecycle.handleInstallEvent(
        {
          type: 'after-download',
          toolName: context.toolName,
          context: {
            ...context,
            logger,
          },
        },
        toolConfig,
        logger,
      ),
    ).rejects.toThrow('after-download hook failed: event hook failed');

    executeHookSpy.mockRestore();
  });

  it('returns failure result when before-install hook fails', async () => {
    const beforeInstallHook = mock(async () => Promise.resolve());
    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: 'owner/repo',
        hooks: {
          'before-install': [beforeInstallHook],
        },
      },
    });

    const { context, logger } = createTestInstallHookContext();
    const hookExecutor = new HookExecutor(() => undefined);
    const executeHookSpy = spyOn(hookExecutor, 'executeHook').mockResolvedValue({
      success: false,
      error: 'before hook failed',
      durationMs: 1,
      skipped: false,
    });

    const hookLifecycle = new HookLifecycle(hookExecutor);

    const result = await hookLifecycle.executeBeforeInstallHook(toolConfig, context, context.fileSystem, logger);

    expect(result).toEqual({
      success: false,
      error: 'beforeInstall hook failed: before hook failed',
    });

    executeHookSpy.mockRestore();
  });

  it('executes all after-install hooks with continueOnError enabled', async () => {
    const afterInstallHookOne = mock(async () => Promise.resolve());
    const afterInstallHookTwo = mock(async () => Promise.resolve());
    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: 'owner/repo',
        hooks: {
          'after-install': [afterInstallHookOne, afterInstallHookTwo],
        },
      },
    });

    const { context, logger } = createTestInstallHookContext();
    const afterInstallContext: IAfterInstallContext = {
      ...context,
      installedDir: '/tmp/test-tool/installed',
      binaryPaths: ['/tmp/test-tool/installed/test-tool'],
      version: '1.0.0',
    };

    const hookExecutor = new HookExecutor(() => undefined);
    const executeHookSpy = spyOn(hookExecutor, 'executeHook').mockResolvedValue({
      success: false,
      error: 'after hook failed',
      durationMs: 1,
      skipped: false,
    });

    const hookLifecycle = new HookLifecycle(hookExecutor);

    await hookLifecycle.executeAfterInstallHook(toolConfig, afterInstallContext, context.fileSystem, logger);

    expect(executeHookSpy).toHaveBeenCalledTimes(2);

    const firstCall = executeHookSpy.mock.calls[0];
    const secondCall = executeHookSpy.mock.calls[1];
    assert(firstCall);
    assert(secondCall);

    expect(firstCall[4]).toEqual({ continueOnError: true });
    expect(secondCall[4]).toEqual({ continueOnError: true });

    executeHookSpy.mockRestore();
  });
});
