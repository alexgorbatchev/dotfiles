import { Platform } from '@dotfiles/core';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createMockToolConfigForTests, setupTestContext, type TestContext } from './test-setup';

describe('getToolReadme', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('fetches README using platform-specific repo when top-level repo is missing', async () => {
    ctx.toolConfigs['atuin'] = createMockToolConfigForTests({
      name: 'atuin',
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
      platformConfigs: [
        {
          platforms: Platform.Linux,
          config: {
            installationMethod: 'github-release',
            installParams: { repo: 'atuinsh/atuin' },
          },
        },
      ],
    });

    const download = mock(async () => Buffer.from('# Atuin README'));
    ctx.services.downloader.download = download;

    const result = await ctx.api.getToolReadme('atuin');

    expect(result.success).toBe(true);
    expect(result.data?.content).toBe('# Atuin README');
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[1]).toBe('https://raw.githubusercontent.com/atuinsh/atuin/latest/README.md');
  });

  test('returns error when repo is missing from top-level and platform configs', async () => {
    ctx.toolConfigs['atuin'] = createMockToolConfigForTests({
      name: 'atuin',
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
      platformConfigs: [
        {
          platforms: Platform.Linux,
          config: {
            installationMethod: 'brew',
            installParams: { formula: 'atuin' },
          },
        },
      ],
    });

    const result = await ctx.api.getToolReadme('atuin');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool does not have a GitHub repository');
  });
});
