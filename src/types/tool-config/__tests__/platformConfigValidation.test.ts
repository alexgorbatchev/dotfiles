import { describe, expect, test } from 'bun:test';
import { Platform } from '@types';
import { platformConfigEntrySchema } from '../platformConfigEntrySchema';

describe('Platform Config Validation', () => {
  test('should reject platform config with invalid fields like name and platformConfigs', () => {
    // This reproduces the issue seen in borders.tool.ts and aerospace.tool.ts
    const invalidPlatformConfigEntry = {
      platforms: Platform.MacOS,
      config: {
        // These fields should NOT be allowed in platform config
        name: 'borders', // ❌ Invalid - causes "Unrecognized keys" error
        platformConfigs: [], // ❌ Invalid - causes "Unrecognized keys" error
        binaries: ['borders'],
        version: 'latest',
        installationMethod: 'brew' as const,
        installParams: {
          formula: 'borders',
          tap: 'FelixKratz/formulae',
        },
      },
    };

    const result = platformConfigEntrySchema.safeParse(invalidPlatformConfigEntry);

    // This should fail validation
    expect(result.success).toBe(false);

    if (!result.success) {
      // Should contain error about unrecognized keys
      const errorMessages = result.error.issues.map((issue) => issue.message);
      expect(errorMessages.some((msg) => msg.includes('Unrecognized key'))).toBe(true);
    }
  });

  test('should accept valid platform config without name and platformConfigs', () => {
    const validPlatformConfigEntry = {
      platforms: Platform.MacOS,
      config: {
        // Only valid fields for platform config
        binaries: ['borders'],
        version: 'latest',
        installationMethod: 'brew' as const,
        installParams: {
          formula: 'borders',
          tap: 'FelixKratz/formulae',
        },
      },
    };

    const result = platformConfigEntrySchema.safeParse(validPlatformConfigEntry);
    expect(result.success).toBe(true);
  });
});
