import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestContext, type TestContext } from './test-setup';

describe('getHealth', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test('returns healthy status for valid registry', async () => {
    const result = await ctx.api.getHealth();

    expect(result.success).toBe(true);
    expect(result.data?.overall).toBeDefined();
    expect(result.data?.checks).toHaveLength(2);
    expect(result.data?.lastCheck).toBeDefined();
  });
});
