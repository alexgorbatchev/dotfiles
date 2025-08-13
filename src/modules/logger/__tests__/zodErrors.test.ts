import { describe, expect, test } from 'bun:test';
import { TestLogger } from '@testing-helpers';
import { z } from 'zod';

// Helper function to extract log messages from TestLogger logs
function getLogMessages(logger: TestLogger): string[] {
  return logger.logs.map((log) => {
    const message = log[0];
    return typeof message === 'string' ? message : String(message);
  });
}

describe('TsLogger.zodErrors', () => {
  test('should log validation errors with proper formatting', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });

    // Create a schema and validation error
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      nested: z.object({
        value: z.string(),
      }),
    });

    const invalidData = {
      name: 123, // should be string
      age: 'not-a-number', // should be number
      nested: {
        value: 456, // should be string
      },
    };

    const result = schema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      logger.zodErrors(result.error);
    }

    // Verify the logged messages
    expect(logger.logs).toHaveLength(6); // 3 errors × 2 lines each (message + path)

    // Check that error messages are logged
    const logMessages = getLogMessages(logger);
    expect(logMessages.some((msg) => msg.includes('✖') && msg.includes('expected string'))).toBe(true);
    expect(logMessages.some((msg) => msg.includes('✖') && msg.includes('expected number'))).toBe(true);

    // Check that paths are logged
    expect(logMessages.some((msg) => msg.includes('→ at name'))).toBe(true);
    expect(logMessages.some((msg) => msg.includes('→ at age'))).toBe(true);
    expect(logMessages.some((msg) => msg.includes('→ at nested.value'))).toBe(true);
  });

  test('should handle errors without paths', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });

    // Create a custom validation error without path
    const customSchema = z.custom((val) => typeof val === 'string', 'Must be a string');
    const result = customSchema.safeParse(123);

    expect(result.success).toBe(false);

    if (!result.success) {
      logger.zodErrors(result.error);
    }

    // Should only log the error message, no path
    expect(logger.logs).toHaveLength(1);
    const logMessages = getLogMessages(logger);
    expect(logMessages[0]).toMatch(/✖.*Must be a string/);
  });

  test('should sort errors by path length', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });

    // Create a schema with nested validation that will produce errors at different path depths
    const schema = z.object({
      a: z.string(),
      nested: z.object({
        b: z.string(),
        deepNested: z.object({
          c: z.string(),
        }),
      }),
    });

    const invalidData = {
      a: 123,
      nested: {
        b: 456,
        deepNested: {
          c: 789,
        },
      },
    };

    const result = schema.safeParse(invalidData);
    expect(result.success).toBe(false);

    if (!result.success) {
      logger.zodErrors(result.error);
    }

    // Find the path messages to verify ordering
    const logMessages = getLogMessages(logger);
    const pathMessages = logMessages.filter((msg) => msg.includes('→ at'));
    expect(pathMessages).toHaveLength(3);

    // Should be sorted by path length: 'a' < 'nested.b' < 'nested.deepNested.c'
    expect(pathMessages[0]).toContain('→ at a');
    expect(pathMessages[1]).toContain('→ at nested.b');
    expect(pathMessages[2]).toContain('→ at nested.deepNested.c');
  });
});
