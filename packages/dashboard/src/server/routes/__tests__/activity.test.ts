import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestContext, type TestContext } from './test-setup';

describe('getActivity', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('returns empty activity when no operations exist', async () => {
    const result = await ctx.api.getActivity();

    expect(result.success).toBe(true);
    expect(result.data?.activities).toEqual([]);
    expect(result.data?.totalCount).toBe(0);
  });

  test('returns recent operations as activity items', async () => {
    const { randomUUID } = await import('./test-setup');

    await ctx.fileRegistry.recordOperation({
      toolName: 'fzf',
      operationType: 'writeFile',
      filePath: '/bin/fzf',
      fileType: 'shim',
      operationId: randomUUID(),
    });

    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: 'fzf',
      version: '0.55.0',
      installPath: '/binaries/fzf/2025-01-01',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/binaries/fzf/fzf'],
    });

    const result = await ctx.api.getActivity();

    expect(result.success).toBe(true);
    expect(result.data?.activities.length).toBeGreaterThan(0);
  });

  test('returns activities with relative timestamps', async () => {
    const { randomUUID } = await import('./test-setup');

    await ctx.fileRegistry.recordOperation({
      toolName: 'bat',
      operationType: 'writeFile',
      filePath: '/bin/bat',
      fileType: 'shim',
      operationId: randomUUID(),
    });

    const result = await ctx.api.getActivity();

    expect(result.success).toBe(true);
    expect(result.data?.activities[0]?.relativeTime).toBeDefined();
  });

  test('limits activities to specified count', async () => {
    const { randomUUID } = await import('./test-setup');

    for (let i = 0; i < 10; i++) {
      await ctx.fileRegistry.recordOperation({
        toolName: `tool-${i}`,
        operationType: 'writeFile',
        filePath: `/bin/tool-${i}`,
        fileType: 'shim',
        operationId: randomUUID(),
      });
    }

    const result = await ctx.api.getActivity(5);

    expect(result.success).toBe(true);
    expect(result.data?.activities).toHaveLength(5);
    expect(result.data?.totalCount).toBe(10);
  });

  test('orders activities by most recent first', async () => {
    const { randomUUID } = await import('./test-setup');

    await ctx.fileRegistry.recordOperation({
      toolName: 'first',
      operationType: 'writeFile',
      filePath: '/bin/first',
      fileType: 'shim',
      operationId: randomUUID(),
    });

    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    await ctx.fileRegistry.recordOperation({
      toolName: 'second',
      operationType: 'writeFile',
      filePath: '/bin/second',
      fileType: 'shim',
      operationId: randomUUID(),
    });

    const result = await ctx.api.getActivity();

    expect(result.success).toBe(true);
    expect(result.data?.activities[0]?.toolName).toBe('second');
    expect(result.data?.activities[1]?.toolName).toBe('first');
  });
});
