import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createMockToolConfigForTests, setupTestContext, type TestContext } from './test-setup';

describe('updateTool', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('returns error when tool not found', async () => {
    const result = await ctx.api.updateTool('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool "nonexistent" not found in configuration');
  });

  test('returns not supported when tool version is pinned', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: '0.54.0',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    const result = await ctx.api.updateTool('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.updated).toBe(false);
    expect(result.data?.supported).toBe(false);
    expect(result.data?.error).toBe(
      'Tool is pinned to version "0.54.0". Only tools with version "latest" can be updated.',
    );
  });

  test('updates tool with version latest successfully', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdate: () => true,
    });

    ctx.mockInstaller.install.mockResolvedValueOnce({
      success: true,
      version: '0.55.0',
      installationMethod: 'github-release',
    });

    const result = await ctx.api.updateTool('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.updated).toBe(true);
    expect(result.data?.newVersion).toBe('0.55.0');
    expect(result.data?.supported).toBe(true);
    expect(ctx.mockInstaller.install).toHaveBeenCalledWith(
      'fzf',
      ctx.toolConfigs['fzf'],
      { force: true },
    );
  });

  test('warns but proceeds when plugin does not support update', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'curl-binary',
      installParams: { url: 'https://example.com/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdate: () => false,
    });

    ctx.mockInstaller.install.mockResolvedValueOnce({
      success: true,
      version: '1.0.0',
      installationMethod: 'curl-binary',
    });

    const result = await ctx.api.updateTool('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.updated).toBe(true);
    expect(result.data?.supported).toBe(true);
  });

  test('returns error when installation fails', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdate: () => true,
    });

    ctx.mockInstaller.install.mockResolvedValueOnce({
      success: false,
      error: 'Download failed: 404',
    });

    const result = await ctx.api.updateTool('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.updated).toBe(false);
    expect(result.data?.error).toBe('Download failed: 404');
  });

  test('handles exception thrown by installer', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdate: () => true,
    });

    ctx.mockInstaller.install.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await ctx.api.updateTool('fzf');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to update tool: Network timeout');
  });

  test('includes old version from existing installation', async () => {
    ctx.toolConfigs['fzf'] = createMockToolConfigForTests({
      name: 'fzf',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'junegunn/fzf' },
      binaries: ['fzf'],
    });

    ctx.mockPluginRegistry.get.mockReturnValue({
      supportsUpdate: () => true,
    });

    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: 'fzf',
      version: '0.54.0',
      installPath: '/home/user/.dotfiles/.generated/binaries/fzf/current',
      binaryPaths: ['/home/user/.dotfiles/.generated/binaries/fzf/current/fzf'],
      timestamp: new Date().toISOString(),
    });

    ctx.mockInstaller.install.mockResolvedValueOnce({
      success: true,
      version: '0.55.0',
      installationMethod: 'github-release',
    });

    const result = await ctx.api.updateTool('fzf');

    expect(result.success).toBe(true);
    expect(result.data?.updated).toBe(true);
    expect(result.data?.oldVersion).toBe('0.54.0');
    expect(result.data?.newVersion).toBe('0.55.0');
  });
});
