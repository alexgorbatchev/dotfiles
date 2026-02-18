import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createMockToolConfigForTests, setupTestContext, type TestContext } from './test-setup';

describe('checkToolUpdate', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('returns error when tool not found', async () => {
    const result = await ctx.api.checkToolUpdate('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool "nonexistent" not found in configuration');
  });

  test('returns not supported when plugin not found', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue(undefined);

    const result = await ctx.api.checkToolUpdate('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.supported).toBe(false);
    expect(result.data?.hasUpdate).toBe(false);
  });

  test('returns not supported when plugin does not support update check', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdateCheck: () => false,
    });

    const result = await ctx.api.checkToolUpdate('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.supported).toBe(false);
    expect(result.data?.hasUpdate).toBe(false);
  });

  test('returns update available when plugin reports update', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: '0.54.0',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdateCheck: () => true,
      checkUpdate: async () => ({
        success: true,
        hasUpdate: true,
        currentVersion: '0.54.0',
        latestVersion: '0.55.0',
      }),
    });

    const result = await ctx.api.checkToolUpdate('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(result.data?.hasUpdate).toBe(true);
    expect(result.data?.currentVersion).toBe('0.54.0');
    expect(result.data?.latestVersion).toBe('0.55.0');
  });

  test('returns up to date when no update available', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: '0.55.0',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdateCheck: () => true,
      checkUpdate: async () => ({
        success: true,
        hasUpdate: false,
        currentVersion: '0.55.0',
        latestVersion: '0.55.0',
      }),
    });

    const result = await ctx.api.checkToolUpdate('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(result.data?.hasUpdate).toBe(false);
    expect(result.data?.currentVersion).toBe('0.55.0');
    expect(result.data?.latestVersion).toBe('0.55.0');
  });

  test('returns error when plugin check fails', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: '0.54.0',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdateCheck: () => true,
      checkUpdate: async () => ({
        success: false,
        error: 'GitHub API rate limit exceeded',
      }),
    });

    const result = await ctx.api.checkToolUpdate('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.supported).toBe(true);
    expect(result.data?.hasUpdate).toBe(false);
    expect(result.data?.error).toBe('GitHub API rate limit exceeded');
  });

  test('handles exception thrown by plugin', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdateCheck: () => true,
      checkUpdate: async () => {
        throw new Error('Network timeout');
      },
    });

    const result = await ctx.api.checkToolUpdate('fzf');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to check for updates: Network timeout');
  });
});
