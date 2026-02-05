import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestContext, type TestContext } from './test-setup';

describe('getStats', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('returns stats for empty registry', async () => {
    const result = await ctx.api.getStats();

    expect(result.success).toBe(true);
    expect(result.data?.toolsInstalled).toBe(0);
    expect(result.data?.filesTracked).toBe(0);
    expect(result.data?.totalOperations).toBe(0);
  });

  test('returns stats with installed tools and files', async () => {
    const { randomUUID } = await import('./test-setup');

    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: 'bat',
      version: '0.24.0',
      installPath: '/binaries/bat/2025-01-01',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/binaries/bat/bat'],
    });

    await ctx.fileRegistry.recordOperation({
      toolName: 'bat',
      operationType: 'writeFile',
      filePath: '/bin/bat',
      fileType: 'shim',
      operationId: randomUUID(),
    });

    const result = await ctx.api.getStats();

    expect(result.success).toBe(true);
    expect(result.data?.toolsInstalled).toBe(1);
    expect(result.data?.filesTracked).toBe(1);
    expect(result.data?.totalOperations).toBe(1);
  });
});
